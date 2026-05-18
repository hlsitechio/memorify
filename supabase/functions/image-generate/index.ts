import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });

    const ALLOWED_MODELS = new Set([
      "google/gemini-2.5-flash-image",
      "google/gemini-3-pro-image-preview",
      "google/gemini-3.1-flash-image-preview",
    ]);
    const body = await req.json();
    const prompt: string = body?.prompt;
    const requestedModel: string = body?.model || "google/gemini-2.5-flash-image";
    const model = ALLOWED_MODELS.has(requestedModel) ? requestedModel : "google/gemini-2.5-flash-image";
    if (!prompt?.trim()) return new Response(JSON.stringify({ error: "prompt required" }), { status: 400, headers: corsHeaders });

    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });
    if (!ai.ok) {
      const t = await ai.text();
      return new Response(JSON.stringify({ error: `ai: ${t}` }), { status: 502, headers: corsHeaders });
    }
    const out = await ai.json();
    const b64 = out.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? out.choices?.[0]?.message?.content;
    if (!b64 || typeof b64 !== "string") {
      return new Response(JSON.stringify({ error: "no image returned" }), { status: 502, headers: corsHeaders });
    }
    // b64 may be data url
    const dataUrl = b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;
    const base64 = dataUrl.split(",")[1];
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

    const path = `${user.id}/${crypto.randomUUID()}.png`;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error: upErr } = await admin.storage.from("images").upload(path, bytes, { contentType: "image/png" });
    if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status: 500, headers: corsHeaders });

    const { data: signed } = await admin.storage.from("images").createSignedUrl(path, 60 * 60 * 24 * 7);
    const url = signed?.signedUrl ?? path;

    const { data: row, error: insErr } = await admin.from("images").insert({
      user_id: user.id, prompt, model, url, kind: "generated", params: { storage_path: path },
    }).select().single();
    if (insErr) return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: corsHeaders });

    return new Response(JSON.stringify({ image: row }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
