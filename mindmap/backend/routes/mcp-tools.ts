// mindmap/backend/routes/mcp-tools.ts
// MCP tool definitions for the memory graph (append to TOOLS in mcp.ts).

export type McpToolDef = {
  name: string;
  description: string;
  action: string;
  agent: string;
  inputSchema: Record<string, unknown>;
};

export const MEMORY_GRAPH_MCP_TOOLS: McpToolDef[] = [
  {
    name: "memory_get",
    description: "Get a memory node by mem_id (or uuid). Returns full node for this workspace.",
    action: "get",
    agent: "memory",
    inputSchema: {
      type: "object",
      properties: {
        mem_id: { type: "string", description: "Public mem_… id" },
        id: { type: "string", description: "UUID fallback" },
      },
    },
  },
  {
    name: "memory_link",
    description:
      "Create a typed edge between two memories in this workspace. Fails with BUILD_ZONE if either end is building.",
    action: "link",
    agent: "memory",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "mem_id or uuid" },
        to: { type: "string", description: "mem_id or uuid" },
        relation: {
          type: "string",
          description:
            "relates_to | supports | contradicts | parent_of | child_of | derived_from | mentions | blocks",
        },
        weight: { type: "number" },
        bidirectional: { type: "boolean" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "memory_unlink",
    description: "Remove an edge by edge_id or from+to+relation.",
    action: "unlink",
    agent: "memory",
    inputSchema: {
      type: "object",
      properties: {
        edge_id: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
        relation: { type: "string" },
      },
    },
  },
  {
    name: "memory_neighbors",
    description: "List neighbor chips + edges around a memory (map walk).",
    action: "neighbors",
    agent: "memory",
    inputSchema: {
      type: "object",
      properties: {
        mem_id: { type: "string" },
        id: { type: "string" },
        direction: { type: "string", description: "in | out | both" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "memory_subgraph",
    description:
      "Bounded subgraph for agent reasoning. Prefer chips (no bulk dump). Use focus mem_id + depth.",
    action: "subgraph",
    agent: "memory",
    inputSchema: {
      type: "object",
      properties: {
        mem_id: { type: "string" },
        focus: { type: "string" },
        depth: { type: "number" },
        limit_nodes: { type: "number" },
        namespace: { type: "string" },
        category: { type: "string" },
      },
    },
  },
  {
    name: "memory_health",
    description:
      "Structural health for a memory (status, content_len, edge_count, last_error code). No content body.",
    action: "health",
    agent: "memory",
    inputSchema: {
      type: "object",
      properties: {
        mem_id: { type: "string" },
        id: { type: "string" },
      },
    },
  },
  {
    name: "memory_map_list",
    description: "List named mind maps in this workspace.",
    action: "map_list",
    agent: "memory",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "memory_map_get",
    description: "Get a named map (default slug main) with chips, edges, layout.",
    action: "map_get",
    agent: "memory",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" } },
    },
  },
  {
    name: "memory_map_ensure",
    description: "Ensure the default main map exists.",
    action: "map_ensure",
    agent: "memory",
    inputSchema: { type: "object", properties: {} },
  },
];
