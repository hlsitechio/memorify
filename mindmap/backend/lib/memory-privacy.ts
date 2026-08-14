// mindmap/backend/lib/memory-privacy.ts
// Redaction boundaries: full (workspace auth) vs chip vs ops (never content).

export type MemoryStatus = "draft" | "building" | "ready" | "archived_soft";

export type MemoryRow = {
  id: string;
  workspace_id: string;
  mem_id: string | null;
  title: string | null;
  content: string;
  namespace: string;
  category: string;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  status: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

/** Full node — only for workspace member or agent token of that workspace. */
export type MemoryNodeFull = {
  id: string;
  mem_id: string | null;
  title: string | null;
  content: string;
  namespace: string;
  category: string;
  tags: string[];
  metadata: Record<string, unknown>;
  status: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

/** Map / list chip — no body. */
export type MemoryNodeChip = {
  id: string;
  mem_id: string | null;
  title: string | null;
  namespace: string;
  category: string;
  status: string;
  archived: boolean;
  updated_at: string;
};

/**
 * Platform ops shape — NEVER include content or title by default (strict).
 * title omitted intentionally.
 */
export type MemoryNodeOps = {
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
  last_error?: { code: string; at: string; kind?: string } | null;
};

export type MemoryEdgePublic = {
  id: string;
  from_memory_id: string;
  to_memory_id: string;
  from_mem_id?: string | null;
  to_mem_id?: string | null;
  relation: string;
  weight: number;
  bidirectional: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
};

export function toFullNode(row: MemoryRow): MemoryNodeFull {
  return {
    id: row.id,
    mem_id: row.mem_id,
    title: row.title,
    content: row.content,
    namespace: row.namespace,
    category: row.category,
    tags: row.tags ?? [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    status: row.status,
    archived: row.archived,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toChip(row: Pick<
  MemoryRow,
  | "id"
  | "mem_id"
  | "title"
  | "namespace"
  | "category"
  | "status"
  | "archived"
  | "updated_at"
>): MemoryNodeChip {
  return {
    id: row.id,
    mem_id: row.mem_id,
    title: row.title,
    namespace: row.namespace,
    category: row.category,
    status: row.status,
    archived: row.archived,
    updated_at: row.updated_at,
  };
}

/** Strip any accidental content keys from unknown objects (defense in depth). */
export function assertNoContentKey(obj: Record<string, unknown>): void {
  if ("content" in obj) {
    throw new Error("privacy_violation: content key present in ops payload");
  }
}

export function opsFromDebugRow(
  row: {
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
  },
  last_error?: MemoryNodeOps["last_error"],
): MemoryNodeOps {
  const out: MemoryNodeOps = {
    workspace_id: row.workspace_id,
    memory_uuid: row.memory_uuid,
    mem_id: row.mem_id,
    status: row.status,
    namespace: row.namespace,
    category: row.category,
    archived: row.archived,
    content_len: Number(row.content_len) || 0,
    tag_count: Number(row.tag_count) || 0,
    edge_count: Number(row.edge_count) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_error: last_error ?? null,
  };
  assertNoContentKey(out as unknown as Record<string, unknown>);
  return out;
}

export const TOUCHABLE_STATUSES = new Set(["ready", "draft"]);

export function isBuildZone(row: {
  mem_id: string | null;
  status: string;
}): boolean {
  if (!row.mem_id) return true;
  if (row.status === "building") return true;
  return false;
}
