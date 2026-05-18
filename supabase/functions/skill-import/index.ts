// Import a skill from any URL.
// Body: { url: string, workspace_id?: string | null }
// Auth: requires logged-in user (uses Authorization header).
// Flow: fetch URL (best-effort markdown), ask Lovable AI to extract a Skill,
// insert into public.skills scoped to (user_id, workspace_id).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { safeFetch, assertSafeUrl } from "../_shared/ssrf-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "skill";

// Best-effort fetch: try raw GitHub if a github.com URL, else fetch HTML and strip tags.
async function fetchAsText(rawUrl: string): Promise<{ text: string; finalUrl: string }> {
  let url = rawUrl;
  // github.com/<o>/<r>/blob/<branch>/<path>  ->  raw.githubusercontent.com/...
  const blob = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
  if (blob) {
    url = `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}/${blob[4]}`;
  }
  // github.com/<o>/<r>/tree/<branch>/<path>  -> try SKILL.md inside it
  const tree = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/);
  if (tree) {
    url = `https://raw.githubusercontent.com/${tree[1]}/${tree[2]}/${tree[3]}/${tree[4]}/SKILL.md`;
  }
  // github.com/<o>/<r>  -> try repo README.md on main then master
  const repo = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/);
  if (repo) {
    for (const br of ["main", "master"]) {
      const candidate = `https://raw.githubusercontent.com/${repo[1]}/${repo[2]}/${br}/README.md`;
      const r = await fetch(candidate);
      if (r.ok) {
        const t = await r.text();
        return { text: t, finalUrl: candidate };
      }
    }
  }

  const res = await fetch(url, { headers: { "user-agent": "memorify-skill-import/1.0" } });
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url}`);
  const ctype = res.headers.get("content-type") || "";
  const body = await res.text();
  if (ctype.includes("text/html")) {
    // Strip scripts/styles then tags.
    const stripped = body
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { text: stripped.slice(0, 40000), finalUrl: url };
  }
  return { text: body.slice(0, 40000), finalUrl: url };
}

async function extractWithAI(text: string, sourceUrl: string) {
  const sys = `Extract a single AI agent "skill" from the supplied document.
Return STRICT JSON matching this schema (no prose, no markdown fences):
{
  "name": string,                     // 2-60 chars, Title Case
  "description": string,              // 1-2 sentences, what it does + when to use
  "prompt": string,                   // the full system prompt / instructions for the skill (markdown allowed). If the doc has a SKILL.md body, use that body verbatim.
  "tags": string[],                   // 1-6 short kebab-case tags
  "suggested_model": "google/gemini-3-flash-preview" | "google/gemini-2.5-flash" | "google/gemini-2.5-pro" | "openai/gpt-5-mini" | "openai/gpt-5"
}
If the document is an Anthropic-style SKILL.md, honor its frontmatter (name, description) verbatim and put the body in "prompt".`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${LOVABLE_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Source URL: ${sourceUrl}\n\n---\n${text}` },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI extract failed ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? "{}";
  let parsed: any;
  try { parsed = JSON.parse(content); } catch { throw new Error("AI returned non-JSON"); }
  if (!parsed?.name || !parsed?.prompt) throw new Error("AI missed required fields");
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: ue } = await sb.auth.getUser();
    if (ue || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const url: string = (body?.url || "").trim();
    const workspace_id: string | null = body?.workspace_id ?? null;
    if (!/^https?:\/\//i.test(url)) {
      return new Response(JSON.stringify({ error: "valid URL required" }), {
        status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const { text, finalUrl } = await fetchAsText(url);
    if (text.length < 40) throw new Error("source too short to extract a skill");
    const extracted = await extractWithAI(text, finalUrl);

    const name: string = String(extracted.name).slice(0, 80);
    const slug = slugify(name);
    const insert = {
      user_id: userId,
      workspace_id,
      name,
      slug,
      description: String(extracted.description ?? "").slice(0, 500),
      prompt: String(extracted.prompt),
      model: String(extracted.suggested_model || "google/gemini-3-flash-preview"),
      status: "active",
      schema: { tags: Array.isArray(extracted.tags) ? extracted.tags.slice(0, 6) : [] },
      source: { url: finalUrl, requested_url: url, imported_at: new Date().toISOString() },
    };

    const { data, error } = await sb.from("skills").insert(insert).select("*").single();
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, skill: data }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
