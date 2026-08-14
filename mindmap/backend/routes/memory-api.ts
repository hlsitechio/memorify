// mindmap/backend/routes/memory-api.ts
// Clerk-authenticated SPA API: /api/memory/*
// SECURITY: workspace_id from JWT org only — never trust body workspace_id.

import { json } from "../../../backend/lib/cors.ts";
import { extractBearer, verifyClerkJwt } from "../../../backend/lib/clerk.ts";
import {
  ensureMainMap,
  getFull,
  getMap,
  link,
  listMaps,
  neighbors,
  remember,
  saveLayout,
  subgraph,
  unlink,
} from "../lib/memory-graph.ts";
import { isMemoryGraphError } from "../lib/memory-errors.ts";
import { toChip } from "../lib/memory-privacy.ts";
import { query } from "../../../backend/lib/db.ts";

async function requireClerkOrg(req: Request): Promise<{
  userId: string;
  workspaceId: string;
}> {
  const token = extractBearer(req);
  if (!token) throw new MemoryAuthError("missing_bearer", 401);
  let claims: Awaited<ReturnType<typeof verifyClerkJwt>>;
  try {
    claims = await verifyClerkJwt(token);
  } catch {
    throw new MemoryAuthError("invalid_token", 401);
  }
  const workspaceId = claims.org_id;
  if (!workspaceId) throw new MemoryAuthError("org_required", 403);
  return { userId: claims.sub, workspaceId };
}

class MemoryAuthError extends Error {
  httpStatus: number;
  constructor(message: string, httpStatus: number) {
    super(message);
    this.httpStatus = httpStatus;
  }
}

function errResponse(e: unknown): Response {
  if (e instanceof MemoryAuthError) {
    return json({ error: e.message }, e.httpStatus);
  }
  if (isMemoryGraphError(e)) {
    return json(e.toJSON(), e.httpStatus);
  }
  return json({ error: (e as Error).message }, 400);
}

/**
 * Handle paths under /api/memory...
 * Caller strips prefix or passes full pathname.
 */
export async function handleMemoryApi(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let path = url.pathname;
  // normalize
  if (path.startsWith("/api/memory")) path = path.slice("/api/memory".length) || "/";
  if (!path.startsWith("/")) path = `/${path}`;

  let auth: { userId: string; workspaceId: string };
  try {
    auth = await requireClerkOrg(req);
  } catch (e) {
    return errResponse(e);
  }

  const actor = {
    workspace_id: auth.workspaceId,
    user_id: auth.userId,
    agent_id: null as string | null,
  };

  try {
    // GET /api/memory  — list chips
    if (path === "/" && req.method === "GET") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 200);
      const namespace = url.searchParams.get("namespace") ?? undefined;
      const category = url.searchParams.get("category") ?? undefined;
      const graph = await subgraph(auth.workspaceId, {
        namespace,
        category,
        limit_nodes: limit,
        depth: 0,
      });
      return json({ ok: true, nodes: graph.nodes, edges: graph.edges });
    }

    // POST /api/memory — create
    if (path === "/" && req.method === "POST") {
      const body = await req.json();
      const node = await remember(actor, {
        content: String(body.content ?? ""),
        title: body.title,
        namespace: body.namespace,
        category: body.category,
        tags: body.tags,
        metadata: body.metadata,
        parent_ref: body.parent_mem_id ?? body.parent_ref,
        relation: body.relation,
      });
      return json({ ok: true, memory: node }, 201);
    }

    // GET /api/memory/maps
    if (path === "/maps" && req.method === "GET") {
      const maps = await listMaps(auth.workspaceId);
      return json({ ok: true, maps });
    }

    // POST /api/memory/maps/ensure
    if (path === "/maps/ensure" && req.method === "POST") {
      const map = await ensureMainMap(auth.workspaceId);
      return json({ ok: true, map });
    }

    // GET /api/memory/maps/:slug
    const mapGet = path.match(/^\/maps\/([^/]+)$/);
    if (mapGet && req.method === "GET") {
      const data = await getMap(auth.workspaceId, decodeURIComponent(mapGet[1]));
      return json({ ok: true, ...data });
    }

    // PUT /api/memory/maps/:slug/layout
    const mapLayout = path.match(/^\/maps\/([^/]+)\/layout$/);
    if (mapLayout && req.method === "PUT") {
      const body = await req.json();
      const result = await saveLayout(
        auth.workspaceId,
        decodeURIComponent(mapLayout[1]),
        body.positions ?? [],
      );
      return json({ ok: true, ...result });
    }

    // POST /api/memory/link
    if (path === "/link" && req.method === "POST") {
      const body = await req.json();
      const edge = await link(actor, {
        from: body.from ?? body.from_mem_id,
        to: body.to ?? body.to_mem_id,
        relation: body.relation,
        weight: body.weight,
        bidirectional: body.bidirectional,
        metadata: body.metadata,
      });
      return json({ ok: true, edge }, 201);
    }

    // POST /api/memory/unlink
    if (path === "/unlink" && req.method === "POST") {
      const body = await req.json();
      const result = await unlink(actor, body);
      return json({ ok: true, ...result });
    }

    // GET /api/memory/subgraph
    if (path === "/subgraph" && req.method === "GET") {
      const data = await subgraph(auth.workspaceId, {
        focus: url.searchParams.get("focus") ?? url.searchParams.get("mem_id") ?? undefined,
        depth: Number(url.searchParams.get("depth") ?? 2),
        limit_nodes: Number(url.searchParams.get("limit") ?? 80),
        namespace: url.searchParams.get("namespace") ?? undefined,
        category: url.searchParams.get("category") ?? undefined,
      });
      return json({ ok: true, ...data });
    }

    // GET /api/memory/:memId/neighbors
    const neigh = path.match(/^\/([^/]+)\/neighbors$/);
    if (neigh && req.method === "GET") {
      const data = await neighbors(
        auth.workspaceId,
        decodeURIComponent(neigh[1]),
        {
          direction: (url.searchParams.get("direction") as "in" | "out" | "both") ||
            "both",
          limit: Number(url.searchParams.get("limit") ?? 50),
        },
      );
      return json({ ok: true, ...data });
    }

    // GET /api/memory/:memId
    const one = path.match(/^\/([^/]+)$/);
    if (one && req.method === "GET") {
      const mem = await getFull(auth.workspaceId, decodeURIComponent(one[1]));
      return json({ ok: true, memory: mem });
    }

    // GET /api/memory/:memId/chip — chip only
    const chip = path.match(/^\/([^/]+)\/chip$/);
    if (chip && req.method === "GET") {
      const mem = await getFull(auth.workspaceId, decodeURIComponent(chip[1]));
      return json({ ok: true, chip: toChip(mem as never) });
    }

    return json({ error: "not_found", path }, 404);
  } catch (e) {
    return errResponse(e);
  }
}

/** Lightweight list used by dashboard without full subgraph edges. */
export async function listMemoryChips(
  workspaceId: string,
  limit = 100,
) {
  const rows = await query(
    `SELECT id, mem_id, title, namespace, category, status, archived,
            updated_at::text AS updated_at
     FROM memories
     WHERE workspace_id = $1 AND archived = false
     ORDER BY updated_at DESC
     LIMIT $2`,
    [workspaceId, limit],
  );
  return rows.map((r) => toChip(r as never));
}
