// Public endpoint to revoke an agent connection via a signed link from
// the security alert email. No auth required — security comes from HMAC.
// GET  /agent-revoke?agent=<id>&exp=<ts>&sig=<hex>  → HTML confirmation page
// POST /agent-revoke (same query)                  → performs revoke, returns HTML
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function hmac(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signRevoke(agentId: string, ttlSeconds = 60 * 60 * 24 * 7) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = await hmac(`${agentId}.${exp}`);
  return { exp, sig };
}

function page(title: string, body: string, ok = true) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fafafa;color:#0a0a0a;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:32px;max-width:480px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,.05)}
h1{font-size:20px;margin:0 0 12px;color:${ok ? "#0a0a0a" : "#b91c1c"}}
p{color:#52525b;line-height:1.6;font-size:14px;margin:0 0 16px}
.btn{display:inline-block;background:#0a0a0a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500;border:none;cursor:pointer}
.btn.danger{background:#dc2626}
form{margin:20px 0 0}
a{color:#0a0a0a}
</style></head><body><div class="card">${body}</div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" }, status: ok ? 200 : 400 },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agent") || "";
  const exp = Number(url.searchParams.get("exp") || "0");
  const sig = url.searchParams.get("sig") || "";

  if (!agentId || !exp || !sig) {
    return page("Invalid link", `<h1>Invalid link</h1><p>This revoke link is missing required parameters.</p>`, false);
  }
  if (Math.floor(Date.now() / 1000) > exp) {
    return page("Link expired", `<h1>Link expired</h1><p>This revoke link has expired. Sign in to your Memorify dashboard to revoke the agent manually.</p><p><a class="btn" href="https://memorify.dev/dashboard/agents">Open dashboard</a></p>`, false);
  }
  const expected = await hmac(`${agentId}.${exp}`);
  if (expected !== sig) {
    return page("Invalid signature", `<h1>Invalid link</h1><p>This revoke link could not be verified.</p>`, false);
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, SECRET);
  const { data: agent } = await sb.from("agents").select("id, name").eq("id", agentId).maybeSingle();
  if (!agent) {
    return page("Agent not found", `<h1>Agent not found</h1><p>This agent no longer exists.</p>`, false);
  }

  if (req.method === "GET") {
    return page(
      "Cancel agent connection",
      `<h1>Cancel agent connection</h1>
       <p>You're about to revoke the connection for <strong>${agent.name ?? agent.id}</strong>.
       Its access token will be invalidated immediately. You can reconnect from your dashboard at any time.</p>
       <form method="POST">
         <input type="hidden" name="confirm" value="1">
         <button class="btn danger" type="submit">Yes, cancel this connection</button>
       </form>
       <p style="margin-top:16px"><a href="https://memorify.dev/dashboard/agents">Or open dashboard instead</a></p>`,
    );
  }

  if (req.method === "POST") {
    // Invalidate the agent: rotate the token to a random unusable value and mark pending.
    const newTok = crypto.randomUUID() + "-revoked";
    await sb.from("agents").update({
      token: newTok,
      status: "pending",
      token_rotated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", agentId);
    return page(
      "Connection cancelled",
      `<h1>Connection cancelled</h1>
       <p>The connection for <strong>${agent.name ?? agent.id}</strong> has been revoked.
       The agent will need a new token to connect again.</p>
       <p><a class="btn" href="https://memorify.dev/dashboard/agents">Back to dashboard</a></p>`,
    );
  }

  return new Response("Method not allowed", { status: 405 });
});
