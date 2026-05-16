import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MCP_ACCEPT = "application/json, text/event-stream";

async function mcpRpc(
  url: string,
  method: string,
  params: any,
  headers: Record<string, string>,
): Promise<{ body: any; sessionId: string | null }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: MCP_ACCEPT, ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
  });
  const text = await res.text();
  const allHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => { allHeaders[k] = v; });
  console.log(`[mcp-handshake] ${method} -> ${res.status}`, JSON.stringify(allHeaders), text.slice(0, 200));
  if (!res.ok) throw new Error(`MCP ${method} failed [${res.status}]: ${text.slice(0, 300)}`);
  const sessionId =
    res.headers.get("mcp-session-id") ?? res.headers.get("Mcp-Session-Id") ?? null;
  let body: any = {};
  if (text.startsWith("event:") || text.includes("data:")) {
    const lines = text.split("\n").filter((l) => l.startsWith("data:"));
    const last = lines[lines.length - 1]?.slice(5).trim();
    body = last ? JSON.parse(last) : {};
  } else if (text.trim()) {
    body = JSON.parse(text);
  }
  return { body, sessionId };
}

async function mcpNotify(url: string, method: string, headers: Record<string, string>) {
  // Notifications have no id; servers respond 202 with no body.
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: MCP_ACCEPT, ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", method, params: {} }),
  }).then((r) => r.text()).catch(() => {});
}

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : "unknown";
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
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "synapse", version: "1.0.0" },
      }, headers);

      // Streamable HTTP servers (Notion, etc.) return a session id we must echo back.
      const sessionHeaders = { ...headers };
      if (init.sessionId) sessionHeaders["Mcp-Session-Id"] = init.sessionId;

      // Required by MCP spec — must be sent after initialize before any other call.
      await mcpNotify(server.url, "notifications/initialized", sessionHeaders);

      const list = await mcpRpc(server.url, "tools/list", {}, sessionHeaders);
      const tools = (list.body?.result?.tools ?? list.body?.tools ?? []) as Array<{ name: string; description?: string; inputSchema?: any }>;

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

      return new Response(JSON.stringify({ ok: true, count: tools.length, server: init.body?.result?.serverInfo ?? init.body?.serverInfo }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      const msg = getErrorMessage(err);
      await supa.from("mcp_servers").update({ last_error: msg, last_handshake_at: new Date().toISOString() }).eq("id", server_id);
      return new Response(JSON.stringify({ ok: false, error: msg }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: getErrorMessage(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
