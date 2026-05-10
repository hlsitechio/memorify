// AI helper for AI-Native Collections.
// Modes: "import" (parse pasted text/CSV/JSON into structured items + schema),
//        "query" (translate NL question into a JSONB filter + sort),
//        "summarize" (one-line summary + tags for an item).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

async function callAI(body: any) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  const r = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, ...body }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`AI ${r.status}: ${t}`);
  }
  return r.json();
}

function toolArgs(j: any) {
  const tc = j?.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc) throw new Error("No tool call returned");
  return JSON.parse(tc.function.arguments);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { mode, ...payload } = await req.json();

    if (mode === "import") {
      const { text, hint } = payload as { text: string; hint?: string };
      const j = await callAI({
        messages: [
          { role: "system", content: "You convert raw user input (CSV, JSON, list, free text) into a clean array of JSON objects. Infer field names. Keep values as-is. Keep the structure consistent across items." },
          { role: "user", content: `${hint ? `Context: ${hint}\n\n` : ""}Input:\n${text.slice(0, 20000)}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "import_items",
            description: "Return parsed items and the inferred schema.",
            parameters: {
              type: "object",
              properties: {
                collection_name: { type: "string", description: "Short name (2-3 words) for this collection" },
                description: { type: "string" },
                icon: { type: "string", description: "lucide-react icon name in kebab-case, e.g. 'users', 'package', 'calendar', 'file-text'" },
                schema: {
                  type: "object",
                  description: "Field name -> {type, description}",
                  additionalProperties: true,
                },
                items: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
              },
              required: ["collection_name", "schema", "items"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "import_items" } },
      });
      return new Response(JSON.stringify(toolArgs(j)), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "query") {
      const { question, schema, sample } = payload as { question: string; schema: any; sample: any[] };
      const j = await callAI({
        messages: [
          { role: "system", content: "You translate natural-language questions into a simple JSON filter for a JSONB document collection. Use only fields present in the schema. Operators: eq, neq, gt, gte, lt, lte, contains (substring, case-insensitive), in. Return at most one sort." },
          { role: "user", content: `Schema: ${JSON.stringify(schema)}\nSample item: ${JSON.stringify(sample?.[0] ?? {})}\n\nQuestion: ${question}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "build_query",
            parameters: {
              type: "object",
              properties: {
                filters: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      field: { type: "string" },
                      op: { type: "string", enum: ["eq","neq","gt","gte","lt","lte","contains","in"] },
                      value: {},
                    },
                    required: ["field","op","value"],
                    additionalProperties: false,
                  },
                },
                sort: {
                  type: "object",
                  properties: { field: {type:"string"}, dir: {type:"string", enum:["asc","desc"]} },
                  additionalProperties: false,
                },
                explanation: { type: "string" },
              },
              required: ["filters","explanation"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "build_query" } },
      });
      return new Response(JSON.stringify(toolArgs(j)), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown mode" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
