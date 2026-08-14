// Netlify Edge Function — Memorify MCP endpoint
// Routes: /mcp → MCP JSON-RPC 2.0 protocol
// Auth: Bearer <mem_live_...> agent token
// Self-contained — no npm imports (Edge compatible)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export default async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  if (path === "/mcp" || path === "/mcp/") {
    // Return MCP manifest
    return json({
      name: "memorify-mcp",
      version: "0.1.0",
      protocol: "MCP JSON-RPC 2.0",
      tools: [
        "memory_remember", "memory_recall", "memory_list", "memory_update", "memory_delete",
        "memory_link", "memory_neighbors", "memory_subgraph",
        "skills_list", "skills_get", "skills_run",
        "connectors_list", "connectors_invoke",
        "documents_list", "documents_view", "documents_add_from_url", "documents_delete", "documents_vector_search",
        "agents_list", "agents_new", "agents_rename", "agents_bootstrap",
        "mcp_servers", "mcp_tools", "mcp_call", "mcp_sync", "mcp_add_server",
        "events_log", "events_list",
        "gateway_ping", "gateway_manifest",
      ],
      endpoints: {
        jsonrpc: "/mcp",
        sse: "/mcp/sse",
        ws: "/mcp/ws",
      },
      auth: "Bearer <mem_live_...>",
    });
  }

  return json({ error: "not found", path }, 404);
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}