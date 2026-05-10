// Summarize a transcript into title, summary, and action items via Lovable AI
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { voice_id, transcript } = await req.json();
    if (!transcript || typeof transcript !== "string" || transcript.trim().length < 10) {
      return new Response(JSON.stringify({ error: "Transcript too short" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const sys = `You summarize meeting/voice-note transcripts. Return STRICT JSON with: title (<=60 chars), summary (3-5 bullet sentences as one string with newlines), action_items (array of short strings, can be empty). No prose outside JSON.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Transcript:\n\n${transcript.slice(0, 16000)}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      return new Response(JSON.stringify({ error: `AI: ${aiRes.status} ${t}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const aiJson = await aiRes.json();
    let parsed: { title?: string; summary?: string; action_items?: string[] } = {};
    try {
      parsed = JSON.parse(aiJson.choices?.[0]?.message?.content ?? "{}");
    } catch {
      parsed = { summary: aiJson.choices?.[0]?.message?.content ?? "" };
    }

    if (voice_id) {
      await supabase
        .from("voices")
        .update({
          title: parsed.title ?? undefined,
          summary: parsed.summary ?? "",
          action_items: parsed.action_items ?? [],
          status: "summarized",
        })
        .eq("id", voice_id)
        .eq("user_id", userData.user.id);
    }

    return new Response(JSON.stringify({ ok: true, ...parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
