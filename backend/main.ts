// main.ts — LOCAL-ONLY Deno.serve entry (offline / deno task dev).
// Production = Netlify Edge Functions (netlify/edge-functions/{api,mcp}.ts)
// + Neon via NEON_DATABASE_URL. Deno Deploy is NOT used.
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
import { handleHealth } from "./routes/health.ts";

loadEnv();

Deno.serve((req: Request) => {
  // CORS preflight
  const cors = handleCors(req);
  if (cors) return cors;

  const url = new URL(req.url);
  const path = url.pathname;

  // ── Health checks ─────────────────────────────────────────
  if (path === "/" || path === "/health" || path === "/api/health") {
    return handleHealth(req);
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