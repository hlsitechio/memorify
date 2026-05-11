// Synapse MCP server — exposes Synapse to external AI clients (Claude, Cursor, n8n…)
// over the JSON-RPC Streamable HTTP transport.
//
// Auth: Bearer <agent-token>  (same token as agent-api)
// Endpoint: https://<project>.functions.supabase.co/synapse-mcp
//
// Implements: initialize, tools/list, tools/call, ping
// Tool implementations are delegated to the agent-api function so we have a
// single source of truth for the actual logic.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, mcp-protocol-version, accept",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const AGENT_API_URL = `${SUPABASE_URL}/functions/v1/agent-api`;

// Curated tool manifest exposed to external MCP clients.
// Each tool maps to an agent-api `action` with the same params.
type ToolDef = {
  name: string;
  description: string;
  action: string;
  inputSchema: any;
};

const TOOLS: ToolDef[] = [
  {
    name: "whoami",
    description: "Return info about the connected Synapse agent + workspace.",
    action: "whoami",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "memory_remember",
    description: "Save a memory for this workspace.",
    action: "memory.remember",
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
    action: "memory.recall",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "memory_update",
    description: "Update an existing memory by id.",
    action: "memory.update",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, content: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "memory_delete",
    description: "Delete a memory by id.",
    action: "memory.delete",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "documents_list",
    description: "List documents in the workspace.",
    action: "documents.list",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "documents_view",
    description: "Fetch a document's content / metadata.",
    action: "documents.view",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "documents_add_from_url",
    description: "Import a document from a public URL.",
    action: "documents.add_from_url",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" }, name: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "skills_list",
    description: "List available skills (reusable prompt+schema bundles).",
    action: "skills.list",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "events_log",
    description: "Log an event from the agent.",
    action: "events.log",
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
    action: "events.list",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "mcp_servers",
    description: "List MCP servers connected to this Synapse workspace.",
    action: "mcp.servers",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "mcp_tools",
    description: "List tools across connected MCP servers.",
    action: "mcp.tools",
    inputSchema: {
      type: "object",
      properties: { server_id: { type: "string" } },
    },
  },
  {
    name: "mcp_sync",
    description: "Re-discover tools for a connected MCP server.",
    action: "mcp.sync",
    inputSchema: {
      type: "object",
      properties: { server_id: { type: "string" } },
      required: ["server_id"],
    },
  },
  {
    name: "mcp_call",
    description: "Call a tool on a connected MCP server (transparent proxy).",
    action: "mcp.call",
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
    name: "agents_list",
    description: "List agents in this workspace.",
    action: "agents.list",
    inputSchema: { type: "object", properties: {} },
  },
];

function rpc(id: any, result?: any, error?: { code: number; message: string }) {
  return error
    ? { jsonrpc: "2.0", id, error }
    : { jsonrpc: "2.0", id, result };
}

async function callAgentApi(action: string, params: any, token: string) {
  const res = await fetch(AGENT_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, params: params ?? {} }),
  });
  const data = await res.json();
  if (!data?.ok) throw new Error(data?.error ?? `agent-api ${action} failed`);
  return data.result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // GET → simple discovery / health
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        name: "synapse-mcp",
        version: "1.0.0",
        protocol: "mcp",
        transport: "streamable-http",
        docs: "Send POST JSON-RPC 2.0 with Authorization: Bearer <agent-token>",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Auth
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    return new Response(
      JSON.stringify(rpc(null, undefined, { code: -32001, message: "missing bearer token" })),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let body: any;
  try { body = await req.json(); }
  catch {
    return new Response(
      JSON.stringify(rpc(null, undefined, { code: -32700, message: "parse error" })),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { id = null, method, params } = body ?? {};

  try {
    if (method === "initialize") {
      return new Response(JSON.stringify(rpc(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "synapse", version: "1.0.0" },
      })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (method === "ping") {
      return new Response(JSON.stringify(rpc(id, {})), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (method === "tools/list") {
      return new Response(JSON.stringify(rpc(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (method === "tools/call") {
      const toolName = params?.name as string;
      const args = params?.arguments ?? {};
      const def = TOOLS.find((t) => t.name === toolName);
      if (!def) {
        return new Response(JSON.stringify(rpc(id, undefined, { code: -32602, message: `unknown tool ${toolName}` })), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const result = await callAgentApi(def.action, args, token);
        return new Response(JSON.stringify(rpc(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown";
        return new Response(JSON.stringify(rpc(id, {
          isError: true,
          content: [{ type: "text", text: msg }],
        })), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Notifications (no id) → empty 200
    if (id === null || id === undefined) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    return new Response(JSON.stringify(rpc(id, undefined, { code: -32601, message: `method not found: ${method}` })), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify(rpc(id, undefined, { code: -32000, message: msg })), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
