// Invoke a tool on a connected MCP server (JSON-RPC `tools/call`).
// Body: { server_id: uuid, tool: string, arguments?: object }
// Auth: user JWT (RLS scopes to the server's owner).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { safeFetch } from "../_shared/ssrf-guard.ts";

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
  const res = await safeFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: MCP_ACCEPT, ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
  }, { httpsOnly: true });
  const text = await res.text();
  if (!res.ok) throw new Error(`MCP ${method} [${res.status}]: ${text.slice(0, 400)}`);
  const sessionId = res.headers.get("mcp-session-id") ?? res.headers.get("Mcp-Session-Id") ?? null;
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
  await safeFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: MCP_ACCEPT, ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", method, params: {} }),
  }, { httpsOnly: true }).then((r) => r.text()).catch(() => {});
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

    const { server_id, tool, arguments: args } = await req.json();
    if (!server_id || !tool) throw new Error("server_id and tool required");

    // Only select the columns we need — keeps stored OAuth refresh_token / client_secret
    // out of any future log or error serialization.
    const { data: server, error } = await supa
      .from("mcp_servers")
      .select("id, url, enabled, auth, name")
      .eq("id", server_id)
      .single();
    if (error || !server) throw new Error("Server not found");
    if (!server.enabled) throw new Error("Server disabled");

    const headers: Record<string, string> = {};
    if (server.auth?.bearer) headers.Authorization = `Bearer ${server.auth.bearer}`;
    if (server.auth?.headers) Object.assign(headers, server.auth.headers);

    // Initialize session — Streamable HTTP servers (Notion, etc.) require this.
    let sessionHeaders = { ...headers };
    try {
      const init = await mcpRpc(server.url, "initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "memorify", version: "1.0.0" },
      }, headers);
      if (init.sessionId) sessionHeaders["Mcp-Session-Id"] = init.sessionId;
      await mcpNotify(server.url, "notifications/initialized", sessionHeaders);
    } catch { /* stateless servers — proceed without session */ }

    const out = await mcpRpc(server.url, "tools/call", { name: tool, arguments: args ?? {} }, sessionHeaders);
    const result = out.body?.result ?? out.body;
    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "unknown" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
