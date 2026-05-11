// Agent Gateway: a single endpoint that speaks {agent, action, input}
// This is a public live demo. No auth required for the demo namespace.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type GatewayRequest = {
  agent: string;
  action: string;
  input?: Record<string, unknown>;
};

function ok(result: unknown, source: string) {
  return new Response(
    JSON.stringify({ status: "success", result, source, ts: new Date().toISOString() }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

function fail(message: string, code = 400) {
  return new Response(
    JSON.stringify({ status: "error", error: message }),
    { status: code, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") {
    return ok(
      {
        name: "agent-gateway",
        version: "0.1.0",
        protocol: { agent: "string", action: "string", input: "object" },
        agents: {
          memory: ["remember", "recall", "list"],
          gateway: ["ping", "manifest"],
        },
        example: {
          agent: "memory",
          action: "remember",
          input: { content: "The user prefers cyan accents", tags: ["preference"] },
        },
      },
      "gateway",
    );
  }

  // Auth: require a valid agent token (Bearer <token> or x-agent-token).
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const token = bearer || req.headers.get("x-agent-token") || "";
  if (!token) return fail("unauthorized: missing agent token", 401);
  const { data: agent } = await supabase
    .from("agents")
    .select("id, user_id")
    .eq("token", token)
    .maybeSingle();
  if (!agent) return fail("unauthorized: invalid agent token", 401);

  let body: GatewayRequest;
  try {
    body = await req.json();
  } catch {
    return fail("invalid json body");
  }

  const { agent: agentName, action, input = {} } = body ?? {};
  if (!agentName || !action) return fail("missing 'agent' or 'action'");

  try {
    if (agentName === "gateway" && action === "ping") {
      return ok({ pong: true, agent: agent.id }, "gateway");
    }

    if (agentName === "memory") {
      const namespace = (input.namespace as string) || `agent:${agent.id}`;

      if (action === "remember") {
        const content = input.content as string;
        if (!content || typeof content !== "string") return fail("input.content (string) required");
        const tags = Array.isArray(input.tags) ? (input.tags as string[]) : [];
        const metadata = (input.metadata as Record<string, unknown>) ?? {};
        const { data, error } = await supabase
          .from("memories")
          .insert({ user_id: agent.user_id, namespace, content, tags, metadata })
          .select()
          .single();
        if (error) return fail(error.message, 500);
        return ok(data, "memory");
      }

      if (action === "recall") {
        const query = (input.query as string)?.toLowerCase() ?? "";
        const limit = Math.min(Number(input.limit) || 10, 50);
        const { data, error } = await supabase
          .from("memories")
          .select("*")
          .eq("user_id", agent.user_id)
          .eq("namespace", namespace)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) return fail(error.message, 500);
        const filtered = query
          ? (data ?? []).filter((m) =>
              m.content.toLowerCase().includes(query) ||
              (m.tags ?? []).some((t: string) => t.toLowerCase().includes(query))
            )
          : data ?? [];
        return ok(filtered.slice(0, limit), "memory");
      }

      if (action === "list") {
        const limit = Math.min(Number(input.limit) || 20, 100);
        const { data, error } = await supabase
          .from("memories")
          .select("*")
          .eq("user_id", agent.user_id)
          .eq("namespace", namespace)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return fail(error.message, 500);
        return ok(data, "memory");
      }
    }

    return fail(`unknown agent.action: ${agentName}.${action}`, 404);
  } catch (e) {
    return fail((e as Error).message, 500);
  }
});
