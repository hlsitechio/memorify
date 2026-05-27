// MCP OAuth callback — receives ?code & ?state from the auth server (browser redirect).
// Exchanges code → access_token, creates an mcp_servers row with the token,
// then returns a small HTML page that closes itself (popup flow) or redirects.
//
// Public endpoint — auth is the unguessable `state` param.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// Allowed origins for postMessage back to the opener. Keeps OAuth tokens
// from being leaked to a malicious page that opened this popup.
const ALLOWED_OPENER_ORIGINS = [
  "https://memorify.dev",
  "https://www.memorify.dev",
  "https://memorify1.lovable.app",
];

function esc(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function htmlPage(status: "ok" | "error", message: string) {
  const allowedOriginsJson = JSON.stringify(ALLOWED_OPENER_ORIGINS);
  return `<!doctype html><html><head><meta charset="utf-8"><title>MCP connect</title>
<style>body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#eaeaea;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.card{max-width:420px;padding:32px;border:1px solid #222;border-radius:12px;text-align:center}
h1{font-size:18px;margin:0 0 12px;color:${status === "ok" ? "#a5b4fc" : "#f87171"}}
p{font-size:14px;color:#9ca3af;margin:0 0 20px;line-height:1.5}
button{background:#a5b4fc;color:#000;border:0;padding:8px 16px;border-radius:6px;font-weight:500;cursor:pointer}
</style></head><body><div class="card">
<h1>${status === "ok" ? "Connected" : "Connection failed"}</h1>
<p>${esc(message)}</p>
<button onclick="window.close()">Close window</button>
</div>
<script>
  if (window.opener) {
    var msg = { type: "mcp-oauth", status: "${status}", message: ${JSON.stringify(message)} };
    // Send to each known origin instead of "*" — prevents token-exfil
    // attacks from a malicious page that opened this popup.
    var origins = ${allowedOriginsJson};
    var preview = ["http://localhost:5173","http://localhost:8080","http://localhost:3000"];
    origins.concat(preview).forEach(function(o){ try { window.opener.postMessage(msg, o); } catch(_){} });
    // Also try a same-site lovable preview if the opener happens to be one.
    try {
      var openerOrigin = document.referrer ? new URL(document.referrer).origin : null;
      if (openerOrigin && /\\.lovable\\.(app|dev)$/.test(new URL(openerOrigin).host)) {
        window.opener.postMessage(msg, openerOrigin);
      }
    } catch(_){}
    setTimeout(function(){ window.close(); }, 800);
  }
</script>
</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err) return new Response(htmlPage("error", `${err}: ${url.searchParams.get("error_description") ?? ""}`), { headers: { "Content-Type": "text/html" } });
  if (!code || !state) return new Response(htmlPage("error", "Missing code or state"), { headers: { "Content-Type": "text/html" } });

  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { data: row, error: stateErr } = await supa.from("mcp_oauth_states").select("*").eq("state", state).maybeSingle();
    if (stateErr || !row) throw new Error("Invalid or expired state");

    // Consume the state immediately to prevent replay (deleted before token exchange,
    // so even a re-submitted code can't be paired with a fresh server row).
    await supa.from("mcp_oauth_states").delete().eq("state", state);

    // Exchange code → token
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: row.redirect_uri,
      client_id: row.client_id,
      code_verifier: row.code_verifier,
    });
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
    if (row.client_secret) {
      headers.Authorization = "Basic " + btoa(`${row.client_id}:${row.client_secret}`);
    }

    const tokRes = await fetch(row.token_endpoint, { method: "POST", headers, body });
    const tokText = await tokRes.text();
    if (!tokRes.ok) throw new Error(`Token exchange failed [${tokRes.status}]: ${tokText.slice(0, 300)}`);
    const tok = JSON.parse(tokText);
    if (!tok.access_token) throw new Error("No access_token in response");

    // Create the mcp_servers row
    const { data: server, error: insErr } = await supa.from("mcp_servers").insert({
      user_id: row.user_id,
      name: row.server_name,
      url: row.server_url,
      transport: row.transport,
      auth: {
        bearer: tok.access_token,
        refresh_token: tok.refresh_token ?? null,
        token_endpoint: row.token_endpoint,
        client_id: row.client_id,
        client_secret: row.client_secret,
        expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
        oauth: true,
      },
    }).select().single();
    if (insErr) throw insErr;

    // Fire-and-forget handshake to discover tools
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/mcp-handshake`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ server_id: server.id, _service: true }),
    }).catch(() => {});

    return new Response(htmlPage("ok", `${row.server_name} is now connected to Synapse. You can close this window.`), {
      headers: { "Content-Type": "text/html" },
    });
  } catch (e) {
    return new Response(htmlPage("error", e instanceof Error ? e.message : "unknown error"), {
      headers: { "Content-Type": "text/html" },
    });
  }
});
