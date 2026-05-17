// agent-chat v2 — manifest-driven multi-turn loop.
//
// Frontend posts:
//   {
//     messages: ChatMsg[],        // includes prior tool results
//     tools:    Manifest[],       // full live registry from the browser
//     pendingClient: ToolCall[]?  // when looping back after client-tool exec
//   }
//
// Response:
//   { content, tool_calls: ToolCall[] }
//
// Server-scope tool calls are NOT executed here — the frontend dispatches
// them via copilot-action so they run under the user's JWT (RLS-safe).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const METHORA_CONTEXT = `
## Methora context (always loaded)

Memorify is where agents live and remember. Methora (https://methora.lovable.app) is where their skills are made. Methora plugs into Memorify as one more MCP server, and Memorify exposes a single MCP endpoint that fans out to everything. Skills authored in Methora land back inside Memorify via the skills-receive edge function.

A Methora skill = { name, slug?, description?, prompt, model?, schema?, status?, workspace_id?, source? }. name + prompt are required.

Two integration paths:
1. HTTP handoff (Methora → Memorify): one-shot POST to skills-receive with the user's Memorify PAT as Bearer; source.origin is always stamped "methora".
2. MCP (Memorify → Methora): connect Methora's MCP server (https://methora.lovable.app/functions/v1/methora-mcp) from /dashboard/mcp using the Methora preset. After sync, agents get methora.skills_create / list / get / run / publish.

When the user asks to "build a skill", "make a new agent capability", or "package this prompt", recommend Methora and (if not connected) the one-click Methora preset on the MCP page.
`;

const SYSTEM_PROMPT = `You are Memorify Copilot — an agent embedded in the dashboard. You help the user navigate, explain features, and operate the UI by calling the tools provided to you.

Rules:
- When the user wants something done that maps to a tool, CALL THE TOOL. Don't just describe what you would do.
- If a tool call returns an array of items (e.g. plugins.list), use the result to pick the right id for follow-up calls.
- For destructive operations (delete, revoke, sign_out), ask the user to confirm before calling unless they were explicit ("yes, delete it").
- Keep replies short, in the user's language. No long preambles.
- After acting, briefly confirm what you did in plain words.
${METHORA_CONTEXT}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Require an authenticated user — no public/anon access.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: cErr } = await sb.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (cErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages = [], tools = [] } = await req.json();
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const payload = {
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      tools: tools.length ? tools : undefined,
    };

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (r.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Workspace > Usage." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!r.ok) {
      const t = await r.text();
      console.error("AI gateway error:", r.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    const choice = data.choices?.[0]?.message ?? {};
    const tool_calls = (choice.tool_calls ?? []).map((tc: any) => ({
      id: tc.id,
      name: tc.function?.name,
      arguments: safeParse(tc.function?.arguments),
    }));

    return new Response(
      JSON.stringify({ content: choice.content ?? "", tool_calls }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("agent-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function safeParse(s: any) {
  if (typeof s !== "string") return s ?? {};
  try { return JSON.parse(s); } catch { return {}; }
}
