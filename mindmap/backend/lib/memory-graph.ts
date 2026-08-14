// mindmap/backend/lib/memory-graph.ts
// Graph service: resolve, gate, link, neighbors, subgraph, maps.
// Always scoped by workspace_id. Content never returned on ops paths.

import { query, queryOne, execute } from "../../../backend/lib/db.ts";
import { classifyMemoryRef, mintMemId, isMemId } from "./memory-ids.ts";
import { MemoryGraphError } from "./memory-errors.ts";
import {
  isBuildZone,
  opsFromDebugRow,
  toChip,
  toFullNode,
  TOUCHABLE_STATUSES,
  type MemoryEdgePublic,
  type MemoryNodeChip,
  type MemoryNodeFull,
  type MemoryNodeOps,
  type MemoryRow,
} from "./memory-privacy.ts";

export type GraphActor = {
  workspace_id: string;
  agent_id?: string | null;
  user_id?: string | null;
};

const EDGE_SELECT = `
  e.id, e.workspace_id, e.from_memory_id, e.to_memory_id, e.relation,
  e.weight, e.bidirectional, e.metadata, e.created_at::text AS created_at,
  f.mem_id AS from_mem_id, t.mem_id AS to_mem_id
`;

type EdgeRow = {
  id: string;
  workspace_id: string;
  from_memory_id: string;
  to_memory_id: string;
  relation: string;
  weight: number;
  bidirectional: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  from_mem_id: string | null;
  to_mem_id: string | null;
};

function edgePublic(e: EdgeRow): MemoryEdgePublic {
  return {
    id: e.id,
    from_memory_id: e.from_memory_id,
    to_memory_id: e.to_memory_id,
    from_mem_id: e.from_mem_id,
    to_mem_id: e.to_mem_id,
    relation: e.relation,
    weight: Number(e.weight),
    bidirectional: !!e.bidirectional,
    metadata: e.metadata ?? {},
    created_at: e.created_at,
  };
}

const MEMORY_COLS = `
  id, workspace_id, mem_id, title, content, namespace, category, tags,
  metadata, status, archived,
  created_at::text AS created_at, updated_at::text AS updated_at
`;

export async function resolveMemory(
  workspaceId: string,
  ref: string,
): Promise<MemoryRow> {
  const c = classifyMemoryRef(ref);
  if (!c) throw new MemoryGraphError("INVALID_REF", "invalid memory ref");

  const row = c.kind === "mem_id"
    ? await queryOne<MemoryRow>(
      `SELECT ${MEMORY_COLS} FROM memories WHERE workspace_id = $1 AND mem_id = $2`,
      [workspaceId, c.value],
    )
    : await queryOne<MemoryRow>(
      `SELECT ${MEMORY_COLS} FROM memories WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, c.value],
    );

  if (!row) {
    throw new MemoryGraphError(
      "BUILD_ZONE_OR_MISSING",
      "memory not found or still in build",
      { action: "do_not_touch", httpStatus: 404 },
    );
  }
  return row;
}

/** Mutating gate: missing mem_id or building → do not touch. */
export async function assertTouchable(
  workspaceId: string,
  ref: string,
): Promise<MemoryRow> {
  const row = await resolveMemory(workspaceId, ref);
  if (isBuildZone(row)) {
    throw new MemoryGraphError(
      "BUILD_ZONE",
      "memory zone is in build — do not touch",
      { action: "do_not_touch", httpStatus: 409 },
    );
  }
  if (!TOUCHABLE_STATUSES.has(row.status) && row.status !== "draft") {
    throw new MemoryGraphError(
      "NOT_EDITABLE",
      `memory_not_editable:${row.status}`,
    );
  }
  return row;
}

export async function remember(
  actor: GraphActor,
  input: {
    content: string;
    title?: string;
    namespace?: string;
    category?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
    status?: string;
    parent_ref?: string;
    relation?: string;
  },
): Promise<MemoryNodeFull & { linked_edge_id?: string }> {
  if (!input.content?.trim()) {
    throw new MemoryGraphError("INVALID_REF", "content required");
  }

  const ns = input.namespace ||
    (actor.agent_id ? `agent:${actor.agent_id}` : "default");
  const category = input.category || "general";
  const tags = input.tags ?? [];
  const metadata = input.metadata ?? {};
  const status = input.status || "ready";
  const id = crypto.randomUUID();
  const memId = mintMemId(id);

  const row = await queryOne<MemoryRow>(
    `INSERT INTO memories (
       id, workspace_id, mem_id, title, namespace, content, category, tags, metadata, status,
       created_by_agent_id, created_by_user_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
     RETURNING ${MEMORY_COLS}`,
    [
      id,
      actor.workspace_id,
      memId,
      input.title ?? null,
      ns,
      input.content,
      category,
      tags,
      JSON.stringify(metadata),
      status,
      actor.agent_id ?? null,
      actor.user_id ?? null,
    ],
  );

  if (!row) throw new MemoryGraphError("MEMORY_NOT_FOUND", "insert failed");

  // Audit without content
  execute(
    `INSERT INTO events (workspace_id, agent_id, kind, source, payload)
     VALUES ($1, $2, 'memory.remember', $3, $4::jsonb)`,
    [
      actor.workspace_id,
      actor.agent_id ?? null,
      actor.agent_id ? `agent:${actor.agent_id}` : "user",
      JSON.stringify({ mem_id: memId, memory_id: id, category, namespace: ns }),
    ],
  ).catch(() => {});

  let linked_edge_id: string | undefined;
  if (input.parent_ref) {
    const edge = await link(actor, {
      from: input.parent_ref,
      to: memId,
      relation: input.relation || "parent_of",
    });
    linked_edge_id = edge.id;
  }

  return { ...toFullNode(row), linked_edge_id };
}

export async function getFull(
  workspaceId: string,
  ref: string,
): Promise<MemoryNodeFull> {
  return toFullNode(await resolveMemory(workspaceId, ref));
}

export async function link(
  actor: GraphActor,
  input: {
    from: string;
    to: string;
    relation?: string;
    weight?: number;
    bidirectional?: boolean;
    metadata?: Record<string, unknown>;
  },
): Promise<MemoryEdgePublic> {
  const from = await assertTouchable(actor.workspace_id, input.from);
  const to = await assertTouchable(actor.workspace_id, input.to);
  if (from.id === to.id) {
    throw new MemoryGraphError("INVALID_REF", "cannot link memory to itself");
  }

  const relation = (input.relation || "relates_to").trim();
  const weight = input.weight ?? 1;
  const bidirectional = !!input.bidirectional;
  const metadata = input.metadata ?? {};

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM memory_edges
     WHERE workspace_id = $1 AND from_memory_id = $2 AND to_memory_id = $3 AND relation = $4`,
    [actor.workspace_id, from.id, to.id, relation],
  );
  if (existing) {
    throw new MemoryGraphError("EDGE_EXISTS", "edge already exists", {
      httpStatus: 409,
    });
  }

  const row = await queryOne<EdgeRow>(
    `INSERT INTO memory_edges (
       workspace_id, from_memory_id, to_memory_id, relation, weight, bidirectional, metadata,
       created_by_agent_id, created_by_user_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
     RETURNING id, workspace_id, from_memory_id, to_memory_id, relation, weight, bidirectional,
               metadata, created_at::text AS created_at,
               $10::text AS from_mem_id, $11::text AS to_mem_id`,
    [
      actor.workspace_id,
      from.id,
      to.id,
      relation,
      weight,
      bidirectional,
      JSON.stringify(metadata),
      actor.agent_id ?? null,
      actor.user_id ?? null,
      from.mem_id,
      to.mem_id,
    ],
  );

  if (!row) throw new MemoryGraphError("EDGE_NOT_FOUND", "edge insert failed");

  execute(
    `INSERT INTO events (workspace_id, agent_id, kind, source, payload)
     VALUES ($1, $2, 'memory.link', $3, $4::jsonb)`,
    [
      actor.workspace_id,
      actor.agent_id ?? null,
      actor.agent_id ? `agent:${actor.agent_id}` : "user",
      JSON.stringify({
        edge_id: row.id,
        from_mem_id: from.mem_id,
        to_mem_id: to.mem_id,
        relation,
      }),
    ],
  ).catch(() => {});

  return edgePublic(row);
}

export async function unlink(
  actor: GraphActor,
  input: {
    edge_id?: string;
    from?: string;
    to?: string;
    relation?: string;
  },
): Promise<{ deleted: boolean; id?: string }> {
  if (input.edge_id) {
    const count = await execute(
      `DELETE FROM memory_edges WHERE id = $1 AND workspace_id = $2`,
      [input.edge_id, actor.workspace_id],
    );
    return { deleted: count > 0, id: input.edge_id };
  }
  if (!input.from || !input.to) {
    throw new MemoryGraphError(
      "INVALID_REF",
      "edge_id or from+to required",
    );
  }
  const from = await resolveMemory(actor.workspace_id, input.from);
  const to = await resolveMemory(actor.workspace_id, input.to);
  const relation = input.relation || "relates_to";
  const row = await queryOne<{ id: string }>(
    `DELETE FROM memory_edges
     WHERE workspace_id = $1 AND from_memory_id = $2 AND to_memory_id = $3 AND relation = $4
     RETURNING id`,
    [actor.workspace_id, from.id, to.id, relation],
  );
  return { deleted: !!row, id: row?.id };
}

export async function neighbors(
  workspaceId: string,
  ref: string,
  opts?: {
    direction?: "in" | "out" | "both";
    limit?: number;
  },
): Promise<{ center: MemoryNodeChip; edges: MemoryEdgePublic[]; nodes: MemoryNodeChip[] }> {
  const center = await resolveMemory(workspaceId, ref);
  const direction = opts?.direction ?? "both";
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);

  let sql = `
    SELECT ${EDGE_SELECT}
    FROM memory_edges e
    JOIN memories f ON f.id = e.from_memory_id
    JOIN memories t ON t.id = e.to_memory_id
    WHERE e.workspace_id = $1 AND (`;
  const params: unknown[] = [workspaceId];
  if (direction === "out") {
    sql += `e.from_memory_id = $2`;
    params.push(center.id);
  } else if (direction === "in") {
    sql += `e.to_memory_id = $2`;
    params.push(center.id);
  } else {
    sql += `e.from_memory_id = $2 OR e.to_memory_id = $2`;
    params.push(center.id);
  }
  sql += `) ORDER BY e.created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const edges = await query<EdgeRow>(sql, params);
  const ids = new Set<string>();
  for (const e of edges) {
    ids.add(e.from_memory_id);
    ids.add(e.to_memory_id);
  }
  ids.delete(center.id);

  let nodes: MemoryNodeChip[] = [];
  if (ids.size > 0) {
    const idList = [...ids];
    const rows = await query<MemoryRow>(
      `SELECT ${MEMORY_COLS} FROM memories
       WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND archived = false`,
      [workspaceId, idList],
    );
    nodes = rows.map(toChip);
  }

  return {
    center: toChip(center),
    edges: edges.map(edgePublic),
    nodes,
  };
}

export async function subgraph(
  workspaceId: string,
  opts: {
    focus?: string;
    depth?: number;
    limit_nodes?: number;
    namespace?: string;
    category?: string;
  },
): Promise<{ nodes: MemoryNodeChip[]; edges: MemoryEdgePublic[] }> {
  const depth = Math.min(Math.max(opts.depth ?? 1, 0), 3);
  const limitNodes = Math.min(Math.max(opts.limit_nodes ?? 80, 1), 200);

  if (opts.focus) {
    const start = await resolveMemory(workspaceId, opts.focus);
    const seen = new Set<string>([start.id]);
    let frontier = [start.id];
    const edgeAcc: EdgeRow[] = [];

    for (let d = 0; d < depth; d++) {
      if (frontier.length === 0) break;
      const rows = await query<EdgeRow>(
        `SELECT ${EDGE_SELECT}
         FROM memory_edges e
         JOIN memories f ON f.id = e.from_memory_id
         JOIN memories t ON t.id = e.to_memory_id
         WHERE e.workspace_id = $1
           AND (e.from_memory_id = ANY($2::uuid[]) OR e.to_memory_id = ANY($2::uuid[]))`,
        [workspaceId, frontier],
      );
      const next: string[] = [];
      for (const e of rows) {
        edgeAcc.push(e);
        for (const id of [e.from_memory_id, e.to_memory_id]) {
          if (!seen.has(id)) {
            seen.add(id);
            next.push(id);
          }
        }
      }
      frontier = next;
      if (seen.size >= limitNodes) break;
    }

    const idList = [...seen].slice(0, limitNodes);
    const nodeRows = await query<MemoryRow>(
      `SELECT ${MEMORY_COLS} FROM memories
       WHERE workspace_id = $1 AND id = ANY($2::uuid[])`,
      [workspaceId, idList],
    );
    const idSet = new Set(idList);
    return {
      nodes: nodeRows.map(toChip),
      edges: edgeAcc
        .filter((e) => idSet.has(e.from_memory_id) && idSet.has(e.to_memory_id))
        .map(edgePublic),
    };
  }

  // Flat filtered chip list + edges among them
  const params: unknown[] = [workspaceId];
  let where = `workspace_id = $1 AND archived = false`;
  if (opts.namespace) {
    params.push(opts.namespace);
    where += ` AND namespace = $${params.length}`;
  }
  if (opts.category) {
    params.push(opts.category);
    where += ` AND category = $${params.length}`;
  }
  params.push(limitNodes);
  const nodeRows = await query<MemoryRow>(
    `SELECT ${MEMORY_COLS} FROM memories WHERE ${where}
     ORDER BY updated_at DESC LIMIT $${params.length}`,
    params,
  );
  const ids = nodeRows.map((n) => n.id);
  let edges: EdgeRow[] = [];
  if (ids.length > 0) {
    edges = await query<EdgeRow>(
      `SELECT ${EDGE_SELECT}
       FROM memory_edges e
       JOIN memories f ON f.id = e.from_memory_id
       JOIN memories t ON t.id = e.to_memory_id
       WHERE e.workspace_id = $1
         AND e.from_memory_id = ANY($2::uuid[])
         AND e.to_memory_id = ANY($2::uuid[])`,
      [workspaceId, ids],
    );
  }
  return { nodes: nodeRows.map(toChip), edges: edges.map(edgePublic) };
}

export async function healthOps(
  workspaceId: string,
  memId: string,
): Promise<MemoryNodeOps> {
  if (!isMemId(memId)) {
    throw new MemoryGraphError("INVALID_REF", "mem_id required", {
      action: "fix_input",
    });
  }

  const row = await queryOne<{
    workspace_id: string;
    memory_uuid: string;
    mem_id: string | null;
    status: string;
    namespace: string;
    category: string;
    archived: boolean;
    content_len: number;
    tag_count: number;
    edge_count: number;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT workspace_id, memory_uuid, mem_id, status, namespace, category, archived,
            content_len, tag_count, edge_count,
            created_at::text AS created_at, updated_at::text AS updated_at
     FROM memory_debug_index
     WHERE workspace_id = $1 AND mem_id = $2`,
    [workspaceId, memId],
  );

  if (!row) {
    throw new MemoryGraphError(
      "BUILD_ZONE_OR_MISSING",
      "memory not found or still in build",
      { action: "do_not_touch", httpStatus: 404 },
    );
  }

  const err = await queryOne<{ kind: string; created_at: string; payload: Record<string, unknown> }>(
    `SELECT kind, created_at::text AS created_at, payload
     FROM events
     WHERE workspace_id = $1
       AND (
         payload->>'mem_id' = $2
         OR payload->>'memory_id' = $3
       )
       AND (kind ILIKE '%error%' OR kind ILIKE '%.fail%')
     ORDER BY created_at DESC
     LIMIT 1`,
    [workspaceId, memId, row.memory_uuid],
  );

  return opsFromDebugRow(
    row,
    err
      ? {
        code: String(err.payload?.code ?? err.kind),
        at: err.created_at,
        kind: err.kind,
      }
      : null,
  );
}

export async function ensureMainMap(
  workspaceId: string,
): Promise<{ id: string; slug: string; name: string; status: string }> {
  const existing = await queryOne<{
    id: string;
    slug: string;
    name: string;
    status: string;
  }>(
    `SELECT id, slug, name, status FROM memory_maps
     WHERE workspace_id = $1 AND slug = 'main'`,
    [workspaceId],
  );
  if (existing) return existing;

  const row = await queryOne<{
    id: string;
    slug: string;
    name: string;
    status: string;
  }>(
    `INSERT INTO memory_maps (workspace_id, slug, name, status)
     VALUES ($1, 'main', 'Main map', 'ready')
     RETURNING id, slug, name, status`,
    [workspaceId],
  );
  if (!row) throw new MemoryGraphError("MAP_NOT_FOUND", "failed to create main map");
  return row;
}

export async function listMaps(workspaceId: string) {
  return await query(
    `SELECT id, slug, name, description, status, focus_memory_id, filters, created_at::text, updated_at::text
     FROM memory_maps WHERE workspace_id = $1 ORDER BY created_at ASC`,
    [workspaceId],
  );
}

export async function getMap(workspaceId: string, slug: string) {
  const map = await queryOne<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    status: string;
    focus_memory_id: string | null;
    filters: Record<string, unknown>;
  }>(
    `SELECT id, slug, name, description, status, focus_memory_id, filters
     FROM memory_maps WHERE workspace_id = $1 AND slug = $2`,
    [workspaceId, slug],
  );
  if (!map) {
    throw new MemoryGraphError("MAP_NOT_FOUND", `map not found: ${slug}`);
  }
  if (map.status === "building") {
    throw new MemoryGraphError("BUILD_ZONE", "map is in build — do not touch", {
      action: "do_not_touch",
      httpStatus: 409,
    });
  }

  const layout = await query<{
    memory_id: string;
    x: number;
    y: number;
    collapsed: boolean;
  }>(
    `SELECT memory_id, x, y, collapsed FROM memory_map_layouts WHERE map_id = $1`,
    [map.id],
  );

  const graph = await subgraph(workspaceId, {
    focus: map.focus_memory_id ?? undefined,
    depth: Number(map.filters?.depth ?? 2) || 2,
    namespace: map.filters?.namespace as string | undefined,
    category: map.filters?.category as string | undefined,
    limit_nodes: Number(map.filters?.limit_nodes ?? 80) || 80,
  });

  return { map, layout, ...graph };
}

export async function saveLayout(
  workspaceId: string,
  slug: string,
  positions: Array<{ memory_id: string; x: number; y: number; collapsed?: boolean }>,
) {
  const map = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM memory_maps WHERE workspace_id = $1 AND slug = $2`,
    [workspaceId, slug],
  );
  if (!map) throw new MemoryGraphError("MAP_NOT_FOUND", "map not found");
  if (map.status === "building") {
    throw new MemoryGraphError("BUILD_ZONE", "map is in build — do not touch", {
      action: "do_not_touch",
    });
  }

  for (const p of positions.slice(0, 500)) {
    await execute(
      `INSERT INTO memory_map_layouts (map_id, memory_id, x, y, collapsed, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (map_id, memory_id)
       DO UPDATE SET x = EXCLUDED.x, y = EXCLUDED.y, collapsed = EXCLUDED.collapsed, updated_at = now()`,
      [map.id, p.memory_id, p.x, p.y, p.collapsed ?? false],
    );
  }
  return { saved: positions.length };
}

/** Agent-scoped structural health (same redaction as ops, same workspace only). */
export async function healthForAgent(
  workspaceId: string,
  ref: string,
): Promise<MemoryNodeOps> {
  const row = await resolveMemory(workspaceId, ref);
  if (!row.mem_id) {
    throw new MemoryGraphError("BUILD_ZONE", "memory zone is in build — do not touch", {
      action: "do_not_touch",
    });
  }
  return healthOps(workspaceId, row.mem_id);
}
