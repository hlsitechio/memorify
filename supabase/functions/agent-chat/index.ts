import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ROUTES = [
  { path: "/dashboard", label: "Home" },
  { path: "/dashboard/skills", label: "Skills" },
  { path: "/dashboard/plugins", label: "Plugins" },
  { path: "/dashboard/connectors", label: "Connectors" },
  { path: "/dashboard/memory", label: "Memory" },
  { path: "/dashboard/documents", label: "Documents" },
  { path: "/dashboard/images", label: "Images" },
  { path: "/dashboard/voices", label: "Voices" },
  { path: "/dashboard/database", label: "Database" },
  { path: "/dashboard/vault", label: "Vault" },
  { path: "/dashboard/events", label: "Events" },
  { path: "/dashboard/logs", label: "Logs" },
  { path: "/dashboard/api-keys", label: "API keys" },
  { path: "/dashboard/settings", label: "Settings" },
];

const SYSTEM_PROMPT = `You are Synapse Copilot, an agent embedded in the Synapse dashboard. You help the user navigate, explain features, and operate the UI.

Available areas:
${ROUTES.map((r) => `- ${r.label} (${r.path})`).join("\n")}

You can call tools to operate the interface:
- navigate(path): jump to a dashboard route
- toast(message, variant): show a small notification
- search(query): open the command palette pre-filled with a query

Rules:
- When the user asks to "go to", "open", "show me" a section — call navigate immediately, then briefly confirm.
- Keep replies short, concrete, and in the same language as the user.
- Use markdown sparingly (lists, bold). No long preambles.`;

const tools = [
  {
    type: "function",
    function: {
      name: "navigate",
      description: "Navigate the dashboard to a specific route.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute route path, e.g. /dashboard/memory" },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "toast",
      description: "Show a small toast notification to the user.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string" },
          variant: { type: "string", enum: ["default", "success", "error"] },
        },
        required: ["message"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search",
      description: "Open the command palette pre-filled with a query.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        tools,
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Workspace > Usage." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const choice = data.choices?.[0]?.message ?? {};
    return new Response(
      JSON.stringify({
        content: choice.content ?? "",
        tool_calls: choice.tool_calls ?? [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("agent-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
