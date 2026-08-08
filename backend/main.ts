// main.ts — Memorify backend entry point (Deno Deploy)
// Routes:
//   GET  /          → health check
//   POST /v1        → agent gateway {agent, action, input}
//   GET  /mcp       → MCP discovery (health)
//   POST /mcp       → MCP JSON-RPC 2.0 protocol
//   GET  /health    → health check

import { loadEnv } from "./lib/env.ts";
import { handleCors, json } from "./lib/cors.ts";
import { handleV1 } from "./routes/v1.ts";
import { handleMcp } from "./routes/mcp.ts";

loadEnv();

Deno.serve((req: Request) => {
  // CORS preflight
  const cors = handleCors(req);
  if (cors) return cors;

  const url = new URL(req.url);
  const path = url.pathname;

  // ── Health checks ─────────────────────────────────────────
  if (path === "/" || path === "/health") {
    return json({
      name: "memorify",
      version: "0.1.0",
      status: "live",
      endpoints: ["/v1", "/mcp", "/health"],
    });
  }

  // ── Agent gateway ─────────────────────────────────────────
  if (path === "/v1") {
    return handleV1(req);
  }

  // ── MCP protocol ──────────────────────────────────────────
  if (path === "/mcp") {
    return handleMcp(req);
  }

  // ── 404 ────────────────────────────────────────────────────
  return json({ error: "not found", path }, 404);
});