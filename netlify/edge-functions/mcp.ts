// Netlify Edge Function — Memorify MCP endpoint
// Routes: /mcp → MCP JSON-RPC 2.0 protocol
// Auth: Bearer <mem_live_...> agent token

import { loadEnv } from "../../backend/lib/env.ts";
import { handleMcp } from "../../backend/routes/mcp.ts";

// Load env on cold start
loadEnv();

// deno-lint-ignore require-await
export default async (req: Request): Promise<Response> => {
  return handleMcp(req);
};