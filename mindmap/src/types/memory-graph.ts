// mindmap/src/types/memory-graph.ts
// Shared SPA types (mirror backend privacy shapes — no ops content).

export type MemoryStatus = "draft" | "building" | "ready" | "archived_soft";

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

export type MemoryNodeFull = MemoryNodeChip & {
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
};

export type MemoryEdge = {
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

export type MemoryMapMeta = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  status: string;
  focus_memory_id?: string | null;
  filters?: Record<string, unknown>;
};

export type MemoryMapLayoutItem = {
  memory_id: string;
  x: number;
  y: number;
  collapsed: boolean;
};

export type MindMapGraph = {
  nodes: MemoryNodeChip[];
  edges: MemoryEdge[];
  map?: MemoryMapMeta;
  layout?: MemoryMapLayoutItem[];
};

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
  action?: string;
};

export const RELATION_TYPES = [
  "relates_to",
  "supports",
  "contradicts",
  "parent_of",
  "child_of",
  "derived_from",
  "mentions",
  "blocks",
] as const;

export type RelationType = (typeof RELATION_TYPES)[number] | `custom:${string}`;

export function isBuildLocked(node: Pick<MemoryNodeChip, "mem_id" | "status">): boolean {
  return !node.mem_id || node.status === "building";
}

export function nodeLabel(node: MemoryNodeChip): string {
  if (node.title?.trim()) return node.title.trim();
  if (node.mem_id) return node.mem_id;
  return node.id.slice(0, 8);
}
