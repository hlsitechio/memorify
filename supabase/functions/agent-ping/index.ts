// Synapse MCP server + agent ping endpoint.
// - GET  ?token=...           → legacy status ping (also flips status to connected)
// - POST (JSON-RPC body)      → MCP Streamable HTTP (initialize / tools/list / tools/call)
// - POST {client:"manual"}    → legacy ping (kept for backward compat)
//
// Auth: per-agent token in ?token=, x-agent-token header, or Bearer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-agent-token, accept, mcp-session-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });

const rpcErr = (id: unknown, code: number, message: string) =>
  json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

const rpcOk = (id: unknown, result: unknown) =>
  json({ jsonrpc: "2.0", id: id ?? null, result });

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function resolveAgent(
  token: string,
  meta: Record<string, unknown> = {},
  req?: Request,
) {
  const sb = admin();
  // Snapshot prior state BEFORE the RPC flips it to connected.
  const { data: prior } = await sb
    .from("agents")
    .select("id, name, kind, user_id, status, last_seen_at, metadata")
    .eq("token", token)
    .maybeSingle();

  const { data, error } = await sb.rpc("agent_ping", { _token: token, _meta: meta });
  if (error) return { error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !prior) return { error: "invalid token" };

  // Fire-and-forget security alert when this is a "new" connection:
  // either the agent was pending, or hasn't been seen for > 60 minutes.
  const RECONNECT_WINDOW_MS = 60 * 60 * 1000;
  const lastSeen = prior.last_seen_at ? new Date(prior.last_seen_at).getTime() : 0;
  const isNewConnection =
    prior.status !== "connected" || (Date.now() - lastSeen) > RECONNECT_WINDOW_MS;

  if (isNewConnection) {
    sendConnectionAlert(prior, req).catch((e) =>
      console.error("agent connection alert failed", e),
    );
  }

  return { agent: prior };
}

async function sendConnectionAlert(agent: any, req?: Request) {
  const sb = admin();
  const { data: userRes } = await sb.auth.admin.getUserById(agent.user_id);
  const recipientEmail = userRes?.user?.email;
  if (!recipientEmail) return;

  const meta = (agent.metadata ?? {}) as Record<string, any>;
  const workspaceName =
    (meta.workspace_name as string | undefined) || `agent:${agent.id}`;

  const ipAddress = req?.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req?.headers.get("cf-connecting-ip") || undefined;
  const userAgent = req?.headers.get("user-agent") || undefined;

  const connectedAt = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";

  // Idempotency: one alert per agent per hour bucket.
  const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
  const idempotencyKey = `agent-connect-${agent.id}-${hourBucket}`;

  await sb.functions.invoke("send-transactional-email", {
    body: {
      templateName: "agent-connection-alert",
      recipientEmail,
      idempotencyKey,
      templateData: {
        agentName: agent.name || agent.kind || "An agent",
        agentKind: agent.kind,
        workspaceName,
        connectedAt,
        ipAddress,
        userAgent,
        manageUrl: "https://memorify.dev/dashboard/agents",
      },
    },
  });
}

// ---------- MCP tool definitions ----------
const TOOLS = [
  {
    name: "memory_remember",
    description:
      "Store a memory in the user's Synapse workspace. Use for facts, preferences, decisions, or anything worth recalling later.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The memory text" },
        category: { type: "string", description: "Category (e.g. preference, fact). Defaults to 'general'." },
        namespace: { type: "string", description: "Namespace (defaults to 'default')." },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["content"],
    },
  },
  {
    name: "memory_recall",
    description: "Search memories in the user's Synapse workspace by substring across content/tags/category.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Substring to match" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
    },
  },
  {
    name: "memory_list",
    description: "List recent memories (most recently updated first).",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" },
        category: { type: "string" },
      },
    },
  },
  {
    name: "documents_list",
    description: "List documents uploaded in the user's workspace.",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "skills_list",
    description: "List skills (reusable prompts/tools) defined in the user's workspace.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "whoami",
    description: "Return the connected agent name and workspace metadata.",
    inputSchema: { type: "object", properties: {} },
  },
];

const text = (s: string) => ({ content: [{ type: "text", text: s }] });

async function callTool(name: string, args: Record<string, any>, userId: string, agentName: string) {
  const sb = admin();
  switch (name) {
    case "whoami":
      return text(`Connected as agent "${agentName}" · user ${userId}`);

    case "memory_remember": {
      if (!args?.content) throw new Error("content is required");
      const { data, error } = await sb.from("memories").insert({
        user_id: userId,
        content: String(args.content),
        category: args.category || "general",
        namespace: args.namespace || "default",
        tags: Array.isArray(args.tags) ? args.tags : [],
      }).select("id, category, namespace").single();
      if (error) throw error;
      return text(`Stored memory ${data.id} (${data.category}/${data.namespace}).`);
    }

    case "memory_recall": {
      const q = String(args?.query ?? "").trim();
      const limit = Math.min(Math.max(Number(args?.limit ?? 10), 1), 50);
      let query = sb.from("memories")
        .select("id, content, category, namespace, tags, updated_at")
        .eq("user_id", userId).eq("archived", false)
        .order("updated_at", { ascending: false }).limit(limit);
      if (q) query = query.ilike("content", `%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) return text(q ? `No memories matching "${q}".` : "No memories yet.");
      return text(data.map((m: any) =>
        `• [${m.category}] ${m.content}${m.tags?.length ? `  #${m.tags.join(" #")}` : ""}`
      ).join("\n"));
    }

    case "memory_list": {
      const limit = Math.min(Math.max(Number(args?.limit ?? 20), 1), 100);
      let q = sb.from("memories")
        .select("id, content, category, namespace, updated_at")
        .eq("user_id", userId).eq("archived", false)
        .order("updated_at", { ascending: false }).limit(limit);
      if (args?.category) q = q.eq("category", String(args.category));
      const { data, error } = await q;
      if (error) throw error;
      if (!data?.length) return text("No memories.");
      return text(data.map((m: any) => `• [${m.category}] ${m.content}`).join("\n"));
    }

    case "documents_list": {
      const limit = Math.min(Math.max(Number(args?.limit ?? 20), 1), 100);
      const { data, error } = await sb.from("documents")
        .select("id, name, mime, size, created_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      if (!data?.length) return text("No documents uploaded.");
      return text(data.map((d: any) =>
        `• ${d.name} (${d.mime ?? "?"}, ${d.size ?? 0} bytes)`
      ).join("\n"));
    }

    case "skills_list": {
      const { data, error } = await sb.from("skills")
        .select("id, name, slug, description, status")
        .eq("user_id", userId).order("updated_at", { ascending: false });
      if (error) throw error;
      if (!data?.length) return text("No skills defined.");
      return text(data.map((s: any) =>
        `• ${s.name} [${s.status}] — ${s.description ?? "no description"}`
      ).join("\n"));
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------- HTTP entry ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  let token = req.headers.get("x-agent-token") || url.searchParams.get("token") || "";
  const auth = req.headers.get("authorization") || "";
  if (!token && auth.toLowerCase().startsWith("bearer ")) token = auth.slice(7).trim();
  if (!token) return json({ ok: false, error: "missing token" }, 401);

  // ---- GET = legacy status ping ----
  if (req.method === "GET") {
    const r = await resolveAgent(token, {}, req);
    if ("error" in r) return json({ ok: false, error: r.error }, 401);
    return json({
      ok: true,
      agent: { id: r.agent.id, name: r.agent.name, status: "connected" },
      server: { name: "synapse", version: "1", protocol: "mcp+http" },
      tools: TOOLS.map((t) => t.name),
    });
  }

  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  // Parse body
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  // Legacy ping (non-JSON-RPC POST)
  if (!body?.jsonrpc) {
    const r = await resolveAgent(token, body ?? {}, req);
    if ("error" in r) return json({ ok: false, error: r.error }, 401);
    return json({
      ok: true,
      agent: { id: r.agent.id, name: r.agent.name, status: "connected" },
      server: { name: "synapse", version: "1" },
    });
  }

  // ---- MCP JSON-RPC ----
  const { id, method, params } = body;
  const r = await resolveAgent(token, {}, req);
  if ("error" in r) return rpcErr(id, -32001, r.error);
  const userId = r.agent.user_id;
  const agentName = r.agent.name;

  try {
    switch (method) {
      case "initialize":
        return rpcOk(id, {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "synapse", version: "1.0.0" },
          capabilities: { tools: { listChanged: false } },
        });

      case "notifications/initialized":
      case "initialized":
        // Notification — no response body required, but return 200.
        return new Response(null, { status: 204, headers: corsHeaders });

      case "tools/list":
        return rpcOk(id, { tools: TOOLS });

      case "tools/call": {
        const name = params?.name;
        const args = params?.arguments ?? {};
        if (!name) return rpcErr(id, -32602, "missing tool name");
        const startedAt = Date.now();
        try {
          const result = await callTool(name, args, userId, agentName);
          admin().from("agent_calls").insert({
            user_id: userId,
            agent_id: r.agent.id,
            kind: "mcp",
            name,
            status: "ok",
            latency_ms: Date.now() - startedAt,
            metadata: { source: "synapse-mcp" },
          }).then(() => {});
          return rpcOk(id, result);
        } catch (e: any) {
          admin().from("agent_calls").insert({
            user_id: userId,
            agent_id: r.agent.id,
            kind: "mcp",
            name,
            status: "error",
            latency_ms: Date.now() - startedAt,
            metadata: { source: "synapse-mcp", error: e?.message },
          }).then(() => {});
          return rpcOk(id, { ...text(`Error: ${e.message}`), isError: true });
        }
      }

      case "ping":
        return rpcOk(id, {});

      default:
        return rpcErr(id, -32601, `method not found: ${method}`);
    }
  } catch (e: any) {
    return rpcErr(id, -32603, e.message ?? "internal error");
  }
});
