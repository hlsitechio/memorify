// Start MCP OAuth 2.1 flow:
//   1. Discover authorization-server metadata
//   2. Dynamic Client Registration (RFC 7591) — fallback to anonymous public client
//   3. Generate PKCE + state, persist to mcp_oauth_states
//   4. Return authorize URL for the browser to open
//
// Body: { server_url: string, server_name: string, transport?: "http"|"sse", redirect_uri: string }
// Auth: user JWT
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const randomString = (n = 32) => {
  const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a);
};
const sha256 = async (s: string) => b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

async function tryFetch(url: string): Promise<any | null> {
  try { const r = await fetch(url); if (!r.ok) return null; return await r.json(); }
  catch { return null; }
}

// Discover OAuth AS metadata. Try resource metadata first, then well-known on the server.
async function discover(serverUrl: string): Promise<{ authorization_endpoint: string; token_endpoint: string; registration_endpoint?: string; scopes_supported?: string[] } | null> {
  const u = new URL(serverUrl);
  const origin = `${u.protocol}//${u.host}`;

  // 1. Try MCP protected-resource metadata (RFC 9728)
  const prm = await tryFetch(`${origin}/.well-known/oauth-protected-resource`);
  if (prm?.authorization_servers?.length) {
    for (const asUrl of prm.authorization_servers) {
      const asMeta = await tryFetch(`${asUrl.replace(/\/$/, "")}/.well-known/oauth-authorization-server`)
        ?? await tryFetch(`${asUrl.replace(/\/$/, "")}/.well-known/openid-configuration`);
      if (asMeta?.authorization_endpoint && asMeta?.token_endpoint) return asMeta;
    }
  }

  // 2. Try well-known on server origin
  for (const path of [
    "/.well-known/oauth-authorization-server",
    "/.well-known/openid-configuration",
  ]) {
    const meta = await tryFetch(`${origin}${path}`);
    if (meta?.authorization_endpoint && meta?.token_endpoint) return meta;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supaUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: ures } = await supaUser.auth.getUser();
    if (!ures.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { server_url, server_name, transport = "http", redirect_uri } = await req.json();
    if (!server_url || !server_name || !redirect_uri) throw new Error("server_url, server_name, redirect_uri required");

    const meta = await discover(server_url);
    if (!meta) throw new Error(`Could not discover OAuth metadata for ${server_url}. The server may not support OAuth — use an API key instead.`);

    // 3. Dynamic Client Registration (RFC 7591) — required, no fallback.
    console.log("[mcp-oauth-start] discovered metadata:", JSON.stringify(meta));
    let client_id: string | null = null;
    let client_secret: string | null = null;
    if (!meta.registration_endpoint) {
      throw new Error(`OAuth server at ${server_url} does not advertise a registration_endpoint. Dynamic Client Registration is required for connection without a pre-registered client. Use an API key instead.`);
    }
    const regBody: Record<string, unknown> = {
      client_name: "Synapse",
      redirect_uris: [redirect_uri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none", // public client + PKCE
    };
    console.log("[mcp-oauth-start] registering client at", meta.registration_endpoint, JSON.stringify(regBody));
    const regRes = await fetch(meta.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(regBody),
    });
    const regText = await regRes.text();
    console.log("[mcp-oauth-start] registration response", regRes.status, regText.slice(0, 500));
    if (!regRes.ok) {
      throw new Error(`Dynamic Client Registration failed [${regRes.status}]: ${regText.slice(0, 300)}`);
    }
    const reg = JSON.parse(regText);
    client_id = reg.client_id;
    client_secret = reg.client_secret ?? null;
    if (!client_id) throw new Error("Registration succeeded but no client_id returned");

    // 4. PKCE + state
    const state = randomString(32);
    const code_verifier = randomString(48);
    const code_challenge = await sha256(code_verifier);
    const scope = Array.isArray(meta.scopes_supported) && meta.scopes_supported.length
      ? meta.scopes_supported.join(" ") : undefined;

    // 5. Persist
    const supaService = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error: insErr } = await supaService.from("mcp_oauth_states").insert({
      state, user_id: ures.user.id,
      server_name, server_url, transport,
      code_verifier, client_id, client_secret,
      authorization_endpoint: meta.authorization_endpoint,
      token_endpoint: meta.token_endpoint,
      redirect_uri, scope,
    });
    if (insErr) throw insErr;

    // 6. Build authorize URL
    const authUrl = new URL(meta.authorization_endpoint);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", client_id);
    authUrl.searchParams.set("redirect_uri", redirect_uri);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", code_challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    if (scope) authUrl.searchParams.set("scope", scope);

    return new Response(JSON.stringify({ ok: true, authorize_url: authUrl.toString(), state }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "unknown" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
