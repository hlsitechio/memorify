// Netlify Edge Function — Memorify API gateway
// Routes: /api/v1 → agent gateway, /api/health → health check
// Auth: Bearer <mem_live_...> agent token

import { json, corsHeaders } from "../../backend/lib/cors.ts";
import { loadEnv } from "../../backend/lib/env.ts";
import { handleV1 } from "../../backend/routes/v1.ts";

// Load env on cold start
loadEnv();

// deno-lint-ignore require-await
export default async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  // Health check
  if (path === "/api/health" || path === "/health") {
    return json({
      name: "memorify",
      version: "0.1.0",
      status: "live",
      endpoints: ["/api/v1", "/mcp", "/api/health"],
    });
  }

  // Agent gateway
  if (path === "/api/v1" || path === "/v1" || path === "/api") {
    return handleV1(req);
  }

  return json({ error: "not found", path }, 404);
};