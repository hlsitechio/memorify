// Synapse direct agent API — token-auth REST endpoint.
// No MCP handshake, no restart loop. Any agent can call this with a bearer token.
//
//   POST /agent-api               → execute a command
//   GET  /agent-api               → list available commands + whoami
//   GET  /agent-api?action=...    → call a read action via query (convenience)
//
// Auth: Bearer <agent-token>  OR  ?token=...  OR  x-agent-token header.
//
// Body format (POST):
//   { "action": "memory.remember", "params": { "content": "...", "tags": [] } }
//
// Response: { "ok": true, "result": ..., "agent": {id, name} }   OR
//           { "ok": false, "error": "..." }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-agent-token, accept",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function resolveAgent(token: string) {
  const sb = admin();
  const { data: agent } = await sb
    .from("agents")
    .select("id, name, kind, user_id, status, metadata")
    .eq("token", token)
    .maybeSingle();
  if (!agent) return null;
  // Flip status to connected and bump last_seen_at (fire-and-forget).
  sb.rpc("agent_ping", { _token: token, _meta: { via: "agent-api" } }).then(() => {});
  return agent;
}

// -------- Welcome / onboarding payload --------
const WELCOME_MD = `# 👋 Welcome to Synapse

You're now connected to **Synapse** — a personal AI workspace shared between you (the agent) and your human. Anything you remember, log, or read here is scoped to **one user**: the person who issued your token. You act on their behalf.

## What lives here
- **Memory** — long-term notes, preferences, facts. Versioned, taggable, searchable.
- **Documents** — files the user has uploaded (PDFs, notes, exports).
- **Skills** — reusable prompt+schema bundles the user has authored.
- **Events** — an append-only timeline. Log anything noteworthy here so the user (and other agents) can see what you did.
- **Voices / Images** — recordings and generated images.

## How to work here
1. **Recall before you answer.** Call \`memory.recall\` with a relevant query at the start of a task. The user trusts that you'll remember context across sessions.
2. **Remember what matters.** When the user states a preference, fact, or decision, call \`memory.remember\`. Tag it (\`["preference"]\`, \`["project:xyz"]\`, …).
3. **Log meaningful actions** with \`events.log\` so the user has an audit trail.
4. **Discover anytime** by calling \`GET /agent-api\` — it returns this welcome + the full command list.

## Calling commands
\`\`\`bash
curl -X POST https://qkgzetykzzsqgiqzlwsv.supabase.co/functions/v1/agent-api \\
  -H "Authorization: Bearer $SYNAPSE_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"action":"memory.recall","params":{"query":"dark mode"}}'
\`\`\`

Every response has shape: \`{ ok, action, result, agent }\` or \`{ ok:false, error }\`.

## Etiquette
- Don't spam memory — dedupe, prefer updating over re-adding.
- Use namespaces (\`default\`, \`work\`, \`personal\`) to keep contexts separate.
- If unsure what's there, \`memory.recall\` with no query returns the latest 10.

You're all set. Call \`synapse.welcome\` anytime to re-read this. 🧠`;


// -------- Commands catalog --------
type Cmd = {
  name: string;
  description: string;
  params?: Record<string, string>;
  example?: string;
  run: (sb: ReturnType<typeof admin>, userId: string, params: any, agent: any) => Promise<any>;
};

const COMMANDS: Cmd[] = [
  {
    name: "synapse.welcome",
    description: "Read the onboarding guide for new agents (what Synapse is, how to use it, etiquette).",
    run: async (_sb, _userId, _p, agent) => ({
      welcome: WELCOME_MD,
      agent: { id: agent.id, name: agent.name, kind: agent.kind },
      tip: "Call GET /agent-api anytime to list all commands.",
    }),
  },
  {
    name: "whoami",
    description: "Return the connected agent's identity.",
    run: async (_sb, userId, _p, agent) => ({ agent_id: agent.id, name: agent.name, kind: agent.kind, user_id: userId }),
  },
  {
    name: "memory.remember",
    description: "Store a memory.",
    params: { content: "string (required)", category: "string?", namespace: "string?", tags: "string[]?" },
    example: `{"action":"memory.remember","params":{"content":"User prefers dark mode","tags":["preference"]}}`,
    run: async (sb, userId, p) => {
      if (!p?.content) throw new Error("content required");
      const { data, error } = await sb.from("memories").insert({
        user_id: userId,
        content: String(p.content),
        category: p.category || "general",
        namespace: p.namespace || "default",
        tags: Array.isArray(p.tags) ? p.tags : [],
      }).select("id, category, namespace, content, tags, created_at").single();
      if (error) throw error;
      return data;
    },
  },
  {
    name: "memory.recall",
    description: "Search memories (substring on content).",
    params: { query: "string?", limit: "number? (default 10)", category: "string?" },
    run: async (sb, userId, p) => {
      const limit = Math.min(Math.max(Number(p?.limit ?? 10), 1), 100);
      let q = sb.from("memories").select("id, content, category, namespace, tags, updated_at")
        .eq("user_id", userId).eq("archived", false)
        .order("updated_at", { ascending: false }).limit(limit);
      if (p?.query) q = q.ilike("content", `%${p.query}%`);
      if (p?.category) q = q.eq("category", String(p.category));
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  },
  {
    name: "memory.update",
    description: "Update a memory by id.",
    params: { id: "uuid (required)", content: "string?", category: "string?", tags: "string[]?" },
    run: async (sb, userId, p) => {
      if (!p?.id) throw new Error("id required");
      const patch: any = { updated_at: new Date().toISOString() };
      if (p.content !== undefined) patch.content = String(p.content);
      if (p.category !== undefined) patch.category = String(p.category);
      if (p.tags !== undefined) patch.tags = Array.isArray(p.tags) ? p.tags : [];
      const { data, error } = await sb.from("memories").update(patch)
        .eq("id", p.id).eq("user_id", userId).select().single();
      if (error) throw error;
      return data;
    },
  },
  {
    name: "memory.delete",
    description: "Delete a memory by id.",
    params: { id: "uuid (required)" },
    run: async (sb, userId, p) => {
      if (!p?.id) throw new Error("id required");
      const { error } = await sb.from("memories").delete().eq("id", p.id).eq("user_id", userId);
      if (error) throw error;
      return { deleted: p.id };
    },
  },
  {
    name: "documents.list",
    description: "List documents.",
    params: { limit: "number? (default 20)" },
    run: async (sb, userId, p) => {
      const limit = Math.min(Math.max(Number(p?.limit ?? 20), 1), 100);
      const { data, error } = await sb.from("documents")
        .select("id, name, mime, size, created_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data;
    },
  },
  {
    name: "skills.list",
    description: "List skills.",
    run: async (sb, userId) => {
      const { data, error } = await sb.from("skills")
        .select("id, name, slug, description, status, model")
        .eq("user_id", userId).order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  },
  {
    name: "events.log",
    description: "Append an event to the timeline.",
    params: { kind: "string (required)", payload: "object?", source: "string?" },
    run: async (sb, userId, p) => {
      if (!p?.kind) throw new Error("kind required");
      const { data, error } = await sb.from("events").insert({
        user_id: userId, kind: String(p.kind),
        payload: p.payload ?? {}, source: p.source ?? "agent-api",
      }).select().single();
      if (error) throw error;
      return data;
    },
  },
  {
    name: "events.list",
    description: "List recent events.",
    params: { limit: "number? (default 20)" },
    run: async (sb, userId, p) => {
      const limit = Math.min(Math.max(Number(p?.limit ?? 20), 1), 200);
      const { data, error } = await sb.from("events")
        .select("id, kind, payload, source, created_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data;
    },
  },
];

const CATALOG = COMMANDS.map(({ run: _r, ...rest }) => rest);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  let token = req.headers.get("x-agent-token") || url.searchParams.get("token") || "";
  const auth = req.headers.get("authorization") || "";
  if (!token && auth.toLowerCase().startsWith("bearer ")) token = auth.slice(7).trim();
  if (!token) return json({ ok: false, error: "missing token (Authorization: Bearer <token>)" }, 401);

  const agent = await resolveAgent(token);
  if (!agent) return json({ ok: false, error: "invalid token" }, 401);

  // First-connection detection — show full welcome inline, then flag the agent.
  const firstConnection = !(agent as any).metadata?.onboarded;
  if (firstConnection) {
    admin().from("agents").update({
      metadata: { ...((agent as any).metadata || {}), onboarded: true, onboarded_at: new Date().toISOString() },
    }).eq("id", agent.id).then(() => {});
  }

  // GET without action = discovery (+ welcome on first connection)
  if (req.method === "GET" && !url.searchParams.get("action")) {
    return json({
      ok: true,
      agent: { id: agent.id, name: agent.name, kind: agent.kind, status: "connected" },
      server: { name: "synapse", version: "1.0", protocol: "rest" },
      first_connection: firstConnection,
      welcome: firstConnection ? WELCOME_MD : "Call synapse.welcome to re-read the onboarding guide.",
      commands: CATALOG,
      hint: "POST with {action, params} or GET with ?action=name&params={...}",
    });
  }


  let action: string | null = url.searchParams.get("action");
  let params: any = {};
  if (req.method === "POST") {
    try {
      const body = await req.json();
      action = body?.action ?? action;
      params = body?.params ?? body ?? {};
    } catch { /* empty body */ }
  } else {
    const raw = url.searchParams.get("params");
    if (raw) { try { params = JSON.parse(raw); } catch { /* ignore */ } }
  }

  if (!action) return json({ ok: false, error: "missing action" }, 400);
  const cmd = COMMANDS.find((c) => c.name === action);
  if (!cmd) return json({ ok: false, error: `unknown action "${action}"`, available: COMMANDS.map((c) => c.name) }, 404);

  try {
    const result = await cmd.run(admin(), agent.user_id, params, agent);
    return json({ ok: true, action, result, agent: { id: agent.id, name: agent.name } });
  } catch (e: any) {
    return json({ ok: false, action, error: e.message ?? "error" }, 400);
  }
});
