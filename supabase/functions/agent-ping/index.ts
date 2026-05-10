// Public ping endpoint for AI agents (Claude Code, etc.).
// Authenticated by a per-agent token (not JWT). Marks the agent as connected.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Token can come from the Bearer header, x-agent-token header, or ?token= query.
  const url = new URL(req.url);
  let token =
    req.headers.get("x-agent-token") ||
    url.searchParams.get("token") ||
    "";
  const auth = req.headers.get("authorization") || "";
  if (!token && auth.toLowerCase().startsWith("bearer ")) token = auth.slice(7).trim();
  if (!token) return json({ ok: false, error: "missing token" }, 401);

  let meta: Record<string, unknown> = {};
  if (req.method === "POST") {
    try { meta = await req.json(); } catch { /* ignore */ }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase.rpc("agent_ping", {
    _token: token,
    _meta: meta ?? {},
  });
  if (error) return json({ ok: false, error: error.message }, 500);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return json({ ok: false, error: "invalid token" }, 401);

  return json({
    ok: true,
    agent: { id: row.id, name: row.name, status: row.status },
    server: { name: "synapse", version: "1" },
  });
});
