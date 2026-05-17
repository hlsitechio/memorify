// Receive a finished skill from an external authoring tool (e.g. Methora).
// Auth: Authorization: Bearer <memorify_api_key>  (validated against api_keys.key_hash)
// Body: { name, slug?, description?, prompt, model?, schema?, source?, workspace_id?, status? }
// Result: inserts into public.skills under the api key's user_id, returns { ok, skill }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "skill";

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const auth = req.headers.get("authorization") ?? "";
  const key = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!key) return json(401, { error: "missing bearer api key" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const key_hash = await sha256Hex(key);
  const { data: keyRow, error: keyErr } = await admin
    .from("api_keys")
    .select("id, user_id")
    .eq("key_hash", key_hash)
    .maybeSingle();
  if (keyErr || !keyRow) return json(401, { error: "invalid api key" });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "invalid json" }); }

  const name = String(body?.name ?? "").trim();
  const prompt = String(body?.prompt ?? "").trim();
  if (!name) return json(400, { error: "name required" });
  if (!prompt) return json(400, { error: "prompt required" });

  const slug = slugify(String(body?.slug ?? name));
  const description = body?.description ? String(body.description) : null;
  const model = body?.model ? String(body.model) : "google/gemini-3-flash-preview";
  const schema = body?.schema && typeof body.schema === "object" ? body.schema : {};
  const status = body?.status === "live" || body?.status === "active" ? "live" : "draft";
  const workspace_id = body?.workspace_id ? String(body.workspace_id) : null;

  // Provenance + payload from the authoring tool (files, manifest, sources…)
  const source = {
    origin: "methora",
    received_at: new Date().toISOString(),
    ...(body?.source && typeof body.source === "object" ? body.source : {}),
  };

  const { data: skill, error: insErr } = await admin
    .from("skills")
    .insert({
      user_id: keyRow.user_id,
      workspace_id,
      name,
      slug,
      description,
      prompt,
      model,
      schema,
      status,
      source,
    })
    .select()
    .single();

  if (insErr) return json(500, { error: insErr.message });

  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

  return json(200, { ok: true, skill });
});
