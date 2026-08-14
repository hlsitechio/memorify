export type MindMapNode = {
  id: string;
  mem_id: string | null;
  title: string | null;
  namespace: string;
  category: string;
  status: string;
  archived: boolean;
  updated_at: string;
};

export type MindMapEdge = {
  id: string;
  from_memory_id: string;
  to_memory_id: string;
  from_mem_id?: string | null;
  to_mem_id?: string | null;
  relation: string;
  weight: number;
  bidirectional?: boolean;
};

export type MindMapLayoutItem = {
  memory_id: string;
  x: number;
  y: number;
  collapsed?: boolean;
};

export function isBuildLocked(node: Pick<MindMapNode, "mem_id" | "status">): boolean {
  return !node.mem_id || node.status === "building";
}

export function nodeLabel(node: MindMapNode): string {
  if (node.title?.trim()) return node.title.trim();
  if (node.mem_id) return node.mem_id;
  return node.id.slice(0, 8);
}

/** Design sample — never real user content from other workspaces. */
export const DEMO_NODES: MindMapNode[] = [
  {
    id: "n1",
    mem_id: "mem_a1b2c3d4e5f60718293a",
    title: "User prefers concise answers",
    namespace: "default",
    category: "preferences",
    status: "ready",
    archived: false,
    updated_at: "2026-08-08T12:00:00Z",
  },
  {
    id: "n2",
    mem_id: "mem_b2c3d4e5f60718293a1b",
    title: "Project: Memorify launch",
    namespace: "default",
    category: "projects",
    status: "ready",
    archived: false,
    updated_at: "2026-08-08T12:01:00Z",
  },
  {
    id: "n3",
    mem_id: "mem_c3d4e5f60718293a1b2c",
    title: "Stack: Neon + Netlify Edge",
    namespace: "default",
    category: "knowledge",
    status: "ready",
    archived: false,
    updated_at: "2026-08-08T12:02:00Z",
  },
  {
    id: "n4",
    mem_id: "mem_d4e5f60718293a1b2c3d",
    title: "MCP is primary agent surface",
    namespace: "agent:demo",
    category: "decisions",
    status: "ready",
    archived: false,
    updated_at: "2026-08-08T12:03:00Z",
  },
  {
    id: "n5",
    mem_id: null,
    title: "Import pipeline (building)",
    namespace: "default",
    category: "work",
    status: "building",
    archived: false,
    updated_at: "2026-08-08T12:04:00Z",
  },
  {
    id: "n6",
    mem_id: "mem_e5f60718293a1b2c3d4e",
    title: "Support: debug by Workspace → mem_id",
    namespace: "shared",
    category: "knowledge",
    status: "ready",
    archived: false,
    updated_at: "2026-08-08T12:05:00Z",
  },
  {
    id: "n7",
    mem_id: "mem_f60718293a1b2c3d4e5f",
    title: "Contact: billing lead",
    namespace: "default",
    category: "contacts",
    status: "ready",
    archived: false,
    updated_at: "2026-08-08T12:06:00Z",
  },
];

export const DEMO_EDGES: MindMapEdge[] = [
  {
    id: "e1",
    from_memory_id: "n2",
    to_memory_id: "n3",
    from_mem_id: "mem_b2c3d4e5f60718293a1b",
    to_mem_id: "mem_c3d4e5f60718293a1b2c",
    relation: "supports",
    weight: 1,
  },
  {
    id: "e2",
    from_memory_id: "n2",
    to_memory_id: "n4",
    from_mem_id: "mem_b2c3d4e5f60718293a1b",
    to_mem_id: "mem_c3d4e5f60718293a1b2c",
    relation: "derived_from",
    weight: 1,
  },
  {
    id: "e3",
    from_memory_id: "n4",
    to_memory_id: "n6",
    relation: "relates_to",
    weight: 1,
  },
  {
    id: "e4",
    from_memory_id: "n1",
    to_memory_id: "n6",
    relation: "supports",
    weight: 1,
  },
  {
    id: "e5",
    from_memory_id: "n3",
    to_memory_id: "n6",
    relation: "mentions",
    weight: 1,
  },
  {
    id: "e6",
    from_memory_id: "n2",
    to_memory_id: "n7",
    relation: "mentions",
    weight: 0.5,
  },
];

export const DEMO_LAYOUT: MindMapLayoutItem[] = [
  { memory_id: "n1", x: 180, y: 140 },
  { memory_id: "n2", x: 420, y: 120 },
  { memory_id: "n3", x: 660, y: 160 },
  { memory_id: "n4", x: 420, y: 300 },
  { memory_id: "n5", x: 700, y: 360 },
  { memory_id: "n6", x: 240, y: 360 },
  { memory_id: "n7", x: 520, y: 440 },
];
