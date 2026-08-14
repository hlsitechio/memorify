// Netlify Edge Function — Memorify API gateway
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

  if (path === "/api/health" || path === "/health") {
    return json({
      name: "memorify",
      version: "0.1.1",
      status: "live",
      endpoints: [
        "/api/v1",
        "/api/agents",
        "/api/bootstrap",
        "/mcp",
        "/api/health",
      ],
    });
  }

  if (path === "/api/v1" || path === "/v1" || path === "/api") {
    // Forward to v1 handler - for now return manifest
    return json({
      name: "memorify-gateway",
      version: "0.1.1",
      protocol: { agent: "string", action: "string", input: "object" },
      agents: {
        memory: ["remember", "recall", "list", "update", "delete"],
        gateway: ["ping", "manifest"],
        skills: ["list", "get", "run"],
        events: ["log", "list"],
        mcp: ["servers", "tools", "call", "sync", "add_server"],
        agents: ["list", "new", "rename", "bootstrap"],
        documents: ["list", "view", "add_from_url", "delete"],
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