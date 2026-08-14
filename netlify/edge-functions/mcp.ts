// Netlify Edge Function — Memorify MCP endpoint
// Routes: /mcp -> MCP JSON-RPC 2.0 protocol
// Auth: Bearer <mem_live_...> agent token

import { corsHeaders } from "../../backend/lib/cors.ts";
import { handleMcp } from "../../backend/routes/mcp.ts";

export default async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return handleMcp(req);
};
