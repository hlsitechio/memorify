import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MCP_ACCEPT = "application/json, text/event-stream";

async function mcpRpc(url: string, method: string, params: any, headers: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: MCP_ACCEPT, ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MCP ${method} failed [${res.status}]: ${text.slice(0, 300)}`);
  // Server may stream SSE; take last data: line
  if (text.startsWith("event:") || text.includes("data:")) {
    const lines = text.split("\n").filter((l) => l.startsWith("data:"));
    const last = lines[lines.length - 1]?.slice(5).trim();
    return last ? JSON.parse(last) : {};
  }
  return JSON.parse(text);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: ures } = await supa.auth.getUser();
    if (!ures.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { server_id } = await req.json();
    const { data: server, error: e1 } = await supa.from("mcp_servers").select("*").eq("id", server_id).single();
    if (e1 || !server) throw new Error("Server not found");

    const headers: Record<string, string> = {};
    if (server.auth?.bearer) headers.Authorization = `Bearer ${server.auth.bearer}`;
    if (server.auth?.headers) Object.assign(headers, server.auth.headers);

    try {
      const init = await mcpRpc(server.url, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "synapse", version: "1.0.0" },
      }, headers);

      const list = await mcpRpc(server.url, "tools/list", {}, headers);
      const tools = (list?.result?.tools ?? list?.tools ?? []) as Array<{ name: string; description?: string; inputSchema?: any }>;

      // Replace tools
      await supa.from("mcp_tools").delete().eq("mcp_server_id", server_id);
      if (tools.length) {
        await supa.from("mcp_tools").insert(tools.map((t) => ({
          mcp_server_id: server_id,
          name: t.name,
          description: t.description ?? null,
          input_schema: t.inputSchema ?? {},
        })));
      }
      await supa.from("mcp_servers").update({ last_handshake_at: new Date().toISOString(), last_error: null }).eq("id", server_id);

      return new Response(JSON.stringify({ ok: true, count: tools.length, server: init?.result?.serverInfo ?? init?.serverInfo }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      await supa.from("mcp_servers").update({ last_error: msg, last_handshake_at: new Date().toISOString() }).eq("id", server_id);
      return new Response(JSON.stringify({ ok: false, error: msg }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
