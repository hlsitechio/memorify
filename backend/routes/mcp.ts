// routes/mcp.ts — MCP JSON-RPC 2.0 over HTTP
// Auth: Bearer <mem_live_...> (agent token)
//
// Methods: initialize, ping, tools/list, tools/call
// Tool calls are dispatched to the v1 gateway actions.

import { json, corsHeaders } from "../lib/cors.ts";
import { verifyAgentToken } from "../lib/agent-token.ts";
import { handleV1 } from "./v1.ts";

// ── MCP tool definitions ──────────────────────────────────────
type ToolDef = {
  name: string;
  description: string;
  action: string;        // maps to v1 {agent, action}
  agent: string;          // "memory" | "skills" | "events" | "documents" | "agents" | "mcp"
  inputSchema: Record<string, unknown>;
};

const TOOLS: ToolDef[] = [
  {
    name: "whoami",
    description: "Return info about the connected agent + workspace.",
    action: "ping",
    agent: "gateway",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "memory_remember",
    description: "Save a memory for this workspace.",
    action: "remember",
    agent: "memory",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "What to remember" },
        category: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["content"],
    },
  },
  {
    name: "memory_recall",
    description: "Search memories by query string.",
    action: "recall",
    agent: "memory",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
        scope: { type: "string", description: "agent | shared | all" },
      },
    },
  },
  {
    name: "memory_update",
    description: "Update an existing memory by id.",
    action: "update",
    agent: "memory",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, content: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "memory_delete",
    description: "Delete a memory by id.",
    action: "delete",
    agent: "memory",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "memory_list",
    description: "List recent memories.",
    action: "list",
    agent: "memory",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "documents_list",
    description: "List documents in the workspace.",
    action: "list",
    agent: "documents",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "documents_view",
    description: "Fetch a document's content.",
    action: "view",
    agent: "documents",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "documents_add_from_url",
    description: "Import a document from a URL.",
    action: "add_from_url",
    agent: "documents",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" }, name: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "skills_list",
    description: "List skills in this workspace.",
    action: "list",
    agent: "skills",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "skills_get",
    description: "Get a skill's full definition by id or slug.",
    action: "get",
    agent: "skills",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, slug: { type: "string" } },
    },
  },
  {
    name: "skills_run",
    description: "Run a skill by id or slug. Returns the prompt + model for execution.",
    action: "run",
    agent: "skills",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        slug: { type: "string" },
        input: { description: "String or object passed as user message." },
        model: { type: "string" },
      },
      required: ["input"],
    },
  },
  {
    name: "events_log",
    description: "Log an event from the agent.",
    action: "log",
    agent: "events",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string" },
        message: { type: "string" },
        metadata: { type: "object" },
      },
      required: ["kind"],
    },
  },
  {
    name: "events_list",
    description: "List recent events.",
    action: "list",
    agent: "events",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "mcp_servers",
    description: "List connected MCP servers.",
    action: "servers",
    agent: "mcp",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "mcp_tools",
    description: "List tools across connected MCP servers.",
    action: "tools",
    agent: "mcp",
    inputSchema: { type: "object", properties: { server_id: { type: "string" } } },
  },
  {
    name: "mcp_call",
    description: "Call a tool on a connected MCP server (transparent proxy).",
    action: "call",
    agent: "mcp",
    inputSchema: {
      type: "object",
      properties: {
        server_id: { type: "string" },
        tool: { type: "string" },
        arguments: { type: "object" },
      },
      required: ["server_id", "tool"],
    },
  },
  {
    name: "agents_bootstrap",
    description: "Rehydrate a session: returns memories, skills, events for this agent.",
    action: "bootstrap",
    agent: "agents",
    inputSchema: { type: "object", properties: {} },
  },
];

// ── JSON-RPC helpers ──────────────────────────────────────────
function rpc(id: unknown, result?: unknown, error?: { code: number; message: string }): unknown {
  return error
    ? { jsonrpc: "2.0", id, error }
    : { jsonrpc: "2.0", id, result };
}

// ── Route handler ─────────────────────────────────────────────
export async function handleMcp(req: Request): Promise<Response> {
  // GET → discovery
  if (req.method === "GET") {
    return json({
      name: "memorify-mcp",
      version: "0.1.0",
      protocol: "mcp/jsonrpc-2.0",
      transport: "streamable-http",
      docs: "POST JSON-RPC 2.0 with Authorization: Bearer <mem_live_...>",
      tools: TOOLS.map((t) => t.name),
    });
  }

  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  // ── Auth ──────────────────────────────────────────────────
  const auth = req.headers.get("authorization") ?? "";
  const rawToken = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!rawToken) {
    return new Response(
      JSON.stringify(rpc(null, undefined, { code: -32001, message: "missing bearer token (mem_live_...)" })),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const agentPayload = await verifyAgentToken(rawToken);
  if (!agentPayload) {
    return new Response(
      JSON.stringify(rpc(null, undefined, { code: -32001, message: "invalid or revoked token" })),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Parse JSON-RPC ────────────────────────────────────────
  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify(rpc(null, undefined, { code: -32700, message: "parse error" })),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { id = null, method, params = {} } = body;
  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // ── initialize ──────────────────────────────────────────
    if (method === "initialize") {
      return new Response(JSON.stringify(rpc(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "memorify",
          version: "0.1.0",
          description: "Memorify MCP — memory, skills, documents, events, MCP proxy. Agent token required.",
        },
      })), { headers });
    }

    // ── ping ────────────────────────────────────────────────
    if (method === "ping") {
      return new Response(JSON.stringify(rpc(id, {})), { headers });
    }

    // ── tools/list ──────────────────────────────────────────
    if (method === "tools/list") {
      return new Response(JSON.stringify(rpc(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      })), { headers });
    }

    // ── tools/call ──────────────────────────────────────────
    if (method === "tools/call") {
      const toolName = (params as Record<string, unknown>).name as string;
      const args = ((params as Record<string, unknown>).arguments ?? {}) as Record<string, unknown>;
      const def = TOOLS.find((t) => t.name === toolName);

      if (!def) {
        return new Response(JSON.stringify(rpc(id, undefined, {
          code: -32602,
          message: `unknown tool: ${toolName}`,
        })), { status: 400, headers });
      }

      // Dispatch directly to the v1 handler (no HTTP roundtrip)
      const v1Req = new Request("https://memorify.dev/v1", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${rawToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent: def.agent,
          action: def.action,
          input: args,
        }),
      });
      const v1Res = await handleV1(v1Req);
      const v1Data = await v1Res.json();

      if (!v1Data?.ok) {
        return new Response(JSON.stringify(rpc(id, {
          isError: true,
          content: [{ type: "text", text: v1Data?.error ?? "tool call failed" }],
        })), { headers });
      }

      return new Response(JSON.stringify(rpc(id, {
        content: [{ type: "text", text: JSON.stringify(v1Data.result, null, 2) }],
      })), { headers });
    }

    // ── notifications (no id) → 204 ─────────────────────────
    if (id === null || id === undefined) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    return new Response(JSON.stringify(rpc(id, undefined, {
      code: -32601,
      message: `method not found: ${method}`,
    })), { status: 400, headers });
  } catch (e) {
    return new Response(JSON.stringify(rpc(id, undefined, {
      code: -32000,
      message: (e as Error).message,
    })), { status: 500, headers });
  }
}