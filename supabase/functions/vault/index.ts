// Vault — encrypted secrets store.
// AES-GCM encryption with key derived from SUPABASE_SERVICE_ROLE_KEY via HKDF-SHA256.
//
// Auth: user JWT (from supabase auth) — caller must own user_id.
//
// Actions: list, set, delete, reveal, import_env, resolve (for agents)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-agent-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// --- Crypto ---
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (a: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(a as any)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let keyPromise: Promise<CryptoKey> | null = null;
async function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const ikm = enc.encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const baseKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey"]);
      return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: enc.encode("synapse-vault-v1"), info: enc.encode("aes-gcm-256") },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    })();
  }
  return keyPromise;
}

async function encrypt(plain: string): Promise<{ value: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getKey();
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain));
  return { value: b64(ct), iv: b64(iv) };
}

async function decrypt(value: string, iv: string): Promise<string> {
  const key = await getKey();
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, key, fromB64(value));
  return dec.decode(pt);
}

// --- Auth helpers ---
async function userFromJWT(req: Request): Promise<{ user_id: string } | null> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await sb.auth.getUser();
  return data.user ? { user_id: data.user.id } : null;
}

async function agentFromToken(token: string): Promise<{ user_id: string; id: string } | null> {
  const sb = admin();
  const { data } = await sb.from("agents").select("id, user_id").eq("token", token).maybeSingle();
  return data ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid json" }, 400); }
  const action: string = body?.action ?? "";
  const sb = admin();

  // Agent-scoped action (for skills/connectors at runtime)
  if (action === "resolve") {
    const agentToken = req.headers.get("x-agent-token") || "";
    const agent = agentToken ? await agentFromToken(agentToken) : null;
    if (!agent) return json({ ok: false, error: "agent token required" }, 401);
    const name = String(body?.name ?? "");
    const scope = String(body?.scope ?? "dev");
    if (!name) return json({ ok: false, error: "name required" }, 400);
    const { data: row } = await sb.from("vault_secrets")
      .select("id, value_encrypted, iv")
      .eq("user_id", agent.user_id).eq("name", name).eq("scope", scope).maybeSingle();
    if (!row) return json({ ok: false, error: "secret not found" }, 404);
    const value = await decrypt(row.value_encrypted, row.iv);
    sb.from("vault_secrets").update({ last_used_at: new Date().toISOString(), last_used_by_agent_id: agent.id }).eq("id", row.id).then(() => {});
    sb.from("events").insert({ user_id: agent.user_id, kind: "vault.resolve", source: `agent:${agent.id}`, payload: { name, scope } }).then(() => {});
    return json({ ok: true, value });
  }

  // User-scoped actions
  const u = await userFromJWT(req);
  if (!u) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    switch (action) {
      case "list": {
        const { data } = await sb.from("vault_secrets")
          .select("id, name, scope, description, last_used_at, last_used_by_agent_id, created_at, updated_at")
          .eq("user_id", u.user_id).order("name", { ascending: true });
        return json({ ok: true, items: data ?? [] });
      }

      case "set": {
        const name = String(body?.name ?? "").trim();
        const value = String(body?.value ?? "");
        const scope = String(body?.scope ?? "dev");
        const description = body?.description ? String(body.description) : null;
        if (!name || !value) return json({ ok: false, error: "name and value required" }, 400);
        const enc1 = await encrypt(value);
        const { data, error } = await sb.from("vault_secrets")
          .upsert({
            user_id: u.user_id, name, scope, description,
            value_encrypted: enc1.value, iv: enc1.iv,
          }, { onConflict: "user_id,name,scope" })
          .select("id, name, scope").single();
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, item: data });
      }

      case "delete": {
        const id = String(body?.id ?? "");
        if (!id) return json({ ok: false, error: "id required" }, 400);
        const { error } = await sb.from("vault_secrets").delete().eq("id", id).eq("user_id", u.user_id);
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true });
      }

      case "reveal": {
        const id = String(body?.id ?? "");
        if (!id) return json({ ok: false, error: "id required" }, 400);
        const { data: row } = await sb.from("vault_secrets")
          .select("value_encrypted, iv, name").eq("id", id).eq("user_id", u.user_id).maybeSingle();
        if (!row) return json({ ok: false, error: "not found" }, 404);
        const value = await decrypt(row.value_encrypted, row.iv);
        sb.from("events").insert({ user_id: u.user_id, kind: "vault.reveal", source: "ui", payload: { id, name: row.name } }).then(() => {});
        return json({ ok: true, value });
      }

      case "import_env": {
        const text = String(body?.text ?? "");
        const scope = String(body?.scope ?? "dev");
        if (!text) return json({ ok: false, error: "text required" }, 400);
        const lines = text.split(/\r?\n/);
        const items: Array<{ name: string; value: string }> = [];
        for (const ln of lines) {
          const line = ln.trim();
          if (!line || line.startsWith("#")) continue;
          const eq = line.indexOf("=");
          if (eq < 1) continue;
          let name = line.slice(0, eq).trim();
          if (name.startsWith("export ")) name = name.slice(7).trim();
          let value = line.slice(eq + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
          items.push({ name, value });
        }
        let imported = 0;
        for (const it of items) {
          const enc1 = await encrypt(it.value);
          const { error } = await sb.from("vault_secrets").upsert({
            user_id: u.user_id, name: it.name, scope, value_encrypted: enc1.value, iv: enc1.iv,
          }, { onConflict: "user_id,name,scope" });
          if (!error) imported++;
        }
        return json({ ok: true, imported, total: items.length });
      }

      default:
        return json({ ok: false, error: `unknown action: ${action}` }, 400);
    }
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? "internal error" }, 500);
  }
});
