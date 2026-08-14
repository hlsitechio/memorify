// mindmap/copilot/memory-graph.ts
// Copilot command defs for agent-first mind map.

export type CommandDef = {
  name: string;
  description: string;
  scope: "server" | "client";
  routes?: string[];
  destructive?: boolean;
  parameters: Record<string, unknown>;
};

const ROUTES = ["/dashboard/mind-map", "/dashboard/memory", "/dashboard"];

export const memoryGraphCommands: CommandDef[] = [
  {
    name: "memory.graph.get",
    description: "Get a memory node by mem_id.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        mem_id: { type: "string" },
        id: { type: "string" },
      },
    },
  },
  {
    name: "memory.graph.link",
    description:
      "Link two memories with a typed relation. Fails with BUILD_ZONE if either side is building — do not force.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        relation: { type: "string" },
        weight: { type: "number" },
        bidirectional: { type: "boolean" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "memory.graph.unlink",
    description: "Remove a graph edge.",
    scope: "server",
    destructive: true,
    routes: ROUTES,
    parameters: {
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
    name: "memory.graph.neighbors",
    description: "Walk neighbors around a mem_id for map/reasoning.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        mem_id: { type: "string" },
        direction: { type: "string" },
        limit: { type: "number" },
      },
      required: ["mem_id"],
    },
  },
  {
    name: "memory.graph.subgraph",
    description: "Bounded subgraph (chips + edges). Prefer over dumping all content.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        mem_id: { type: "string" },
        depth: { type: "number" },
        limit_nodes: { type: "number" },
        namespace: { type: "string" },
        category: { type: "string" },
      },
    },
  },
  {
    name: "memory.graph.health",
    description:
      "Structural health only (status, lengths, edge_count, error codes). Never returns content body.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { mem_id: { type: "string" } },
      required: ["mem_id"],
    },
  },
  {
    name: "memory.map.open",
    description: "Open or ensure the main mind map view for this workspace.",
    scope: "client",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { slug: { type: "string" }, focus: { type: "string" } },
    },
  },
];
