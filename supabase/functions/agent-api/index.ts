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
import { safeFetch, assertSafeUrl } from "../_shared/ssrf-guard.ts";

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

async function listAgentEvents(
  sb: ReturnType<typeof admin>,
  userId: string,
  agentId: string,
  limit: number,
) {
  const fetchLimit = Math.min(Math.max(limit * 5, 100), 500);
  const { data, error } = await sb.from("events")
    .select("id, kind, payload, source, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(fetchLimit);
  if (error) throw error;
  return (data ?? [])
    .filter((row) => row?.payload?.agent_id === agentId || row?.source === `agent:${agentId}`)
    .slice(0, limit);
}

async function resolveAgent(token: string) {
  const sb = admin();
  const { data: agent } = await sb
    .from("agents")
    .select("id, name, kind, user_id, status, metadata, token_expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!agent) return null;
  // Flip status to connected and bump last_seen_at (fire-and-forget).
  sb.rpc("agent_ping", { _token: token, _meta: { via: "agent-api" } }).then(() => {});
  return agent;
}

function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip")
    || req.headers.get("x-real-ip")
    || null;
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

## Your workspace
You have your **own private workspace** inside this user's Synapse — namespace \`agent:<your-id>\`. By default, \`memory.remember\` writes there and \`memory.recall\` reads from there, so other agents' notes won't pollute your context. Pass \`shared: true\` (write) or \`scope: "shared"\` / \`"all"\` (read) when you explicitly want to collaborate with other agents.

## Etiquette
- Don't spam memory — dedupe, prefer updating over re-adding.
- Keep private context in your own workspace; promote to \`shared\` only when other agents need it.
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
    description: "Return the connected agent's identity and its private workspace.",
    run: async (_sb, userId, _p, agent) => ({
      agent_id: agent.id,
      name: agent.name,
      kind: agent.kind,
      user_id: userId,
      workspace: {
        id: `agent:${agent.id}`,
        name: (agent.metadata?.workspace_name as string) || null,
        scope: "agent",
        shared_namespace: "default",
      },
    }),
  },
  {
    name: "memory.remember",
    description: "Store a memory in this agent's workspace (default) or a shared namespace.",
    params: { content: "string (required)", category: "string?", namespace: "string? (default: this agent's workspace)", tags: "string[]?", shared: "boolean? (true = write to 'default' shared namespace)" },
    example: `{"action":"memory.remember","params":{"content":"User prefers dark mode","tags":["preference"]}}`,
    run: async (sb, userId, p, agent) => {
      if (!p?.content) throw new Error("content required");
      const ns = p?.namespace ? String(p.namespace) : (p?.shared ? "default" : `agent:${agent.id}`);
      const { data, error } = await sb.from("memories").insert({
        user_id: userId,
        content: String(p.content),
        category: p.category || "general",
        namespace: ns,
        tags: Array.isArray(p.tags) ? p.tags : [],
        metadata: { agent_id: agent.id, agent_name: agent.name },
      }).select("id, category, namespace, content, tags, created_at").single();
      if (error) throw error;
      return data;
    },
  },
  {
    name: "memory.recall",
    description: "Search memories. Scope defaults to this agent's workspace.",
    params: { query: "string?", limit: "number? (default 10)", category: "string?", scope: "'agent'|'shared'|'all'? (default 'agent')", namespace: "string?" },
    run: async (sb, userId, p, agent) => {
      const limit = Math.min(Math.max(Number(p?.limit ?? 10), 1), 100);
      const scope = String(p?.scope ?? "agent");
      let q = sb.from("memories").select("id, content, category, namespace, tags, updated_at")
        .eq("user_id", userId).eq("archived", false)
        .order("updated_at", { ascending: false }).limit(limit);
      if (p?.namespace) q = q.eq("namespace", String(p.namespace));
      else if (scope === "agent") q = q.eq("namespace", `agent:${agent.id}`);
      else if (scope === "shared") q = q.eq("namespace", "default");
      // scope === "all" → no namespace filter
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
    params: { limit: "number? (default 20)", q: "string? (name filter)" },
    run: async (sb, userId, p) => {
      const limit = Math.min(Math.max(Number(p?.limit ?? 20), 1), 100);
      let q = sb.from("documents")
        .select("id, name, mime, size, created_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
      if (p?.q) q = q.ilike("name", `%${p.q}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  },
  {
    name: "documents.add_note",
    description: "Create a notepad note (md/txt/json) under the user's documents.",
    params: { title: "string (required)", content: "string|object (required)", format: "'md'|'txt'|'json'? (default 'md')" },
    example: `{"action":"documents.add_note","params":{"title":"meeting","content":"# Notes","format":"md"}}`,
    run: async (sb, userId, p) => {
      if (!p?.title) throw new Error("title required");
      const fmt = ["md", "txt", "json"].includes(p?.format) ? p.format : "md";
      const mime = fmt === "md" ? "text/markdown" : fmt === "json" ? "application/json" : "text/plain";
      let textContent: string;
      if (fmt === "json") {
        if (typeof p.content === "string") {
          try { textContent = JSON.stringify(JSON.parse(p.content), null, 2); }
          catch { throw new Error("content is not valid JSON"); }
        } else if (p.content && typeof p.content === "object") {
          textContent = JSON.stringify(p.content, null, 2);
        } else throw new Error("content required (string or object)");
      } else {
        if (typeof p?.content !== "string") throw new Error("content (string) required");
        textContent = p.content;
      }
      const safe = String(p.title).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "note";
      const filename = `${safe}.${fmt}`;
      const bytes = new TextEncoder().encode(textContent);
      const path = `${userId}/${crypto.randomUUID()}-${filename}`;
      const { error: upErr } = await sb.storage.from("documents").upload(path, bytes, { contentType: mime });
      if (upErr) throw upErr;
      const { data, error } = await sb.from("documents").insert({
        user_id: userId, name: filename, mime, size: bytes.byteLength, storage_path: path, status: "ready",
        metadata: { kind: "note", format: fmt },
      }).select().single();
      if (error) throw error;
      return data;
    },
  },
  {
    name: "documents.add_from_base64",
    description: "Upload a local file (PDF/DOC/DOCX/etc.) by sending its base64-encoded bytes.",
    params: { name: "string (required, filename incl. ext)", base64: "string (required)", mime: "string? (auto-detected from extension)" },
    example: `{"action":"documents.add_from_base64","params":{"name":"report.pdf","base64":"JVBERi0xLjQK..."}}`,
    run: async (sb, userId, p) => uploadBase64(sb, userId, p),
  },
  {
    name: "documents.add_from_file",
    description: "Alias of documents.add_from_base64 — agent reads local file, base64-encodes it, sends here. Use `path` (filename inferred) and `base64`.",
    params: { path: "string? (local path; basename used as name)", name: "string? (overrides path basename)", base64: "string (required)", mime: "string?" },
    example: `{"action":"documents.add_from_file","params":{"path":"C:/notes/test.txt","base64":"dGhpcyBpcyBhIG5vdGU="}}`,
    run: async (sb, userId, p) => {
      const pp = { ...p };
      if (!pp.name && pp.path) pp.name = String(pp.path).split(/[\\/]/).pop();
      return uploadBase64(sb, userId, pp);
    },
  },
  {
    name: "documents.add_from_url",
    description: "Download a document from a public https URL and store it.",
    params: { url: "string (required)", name: "string? (inferred from URL)" },
    run: async (sb, userId, p) => {
      if (!p?.url) throw new Error("url required");
      const res = await safeFetch(p.url);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      const urlName = String(p.url).split("?")[0].split("/").pop() || "download";
      const name = p.name || urlName;
      const mime = res.headers.get("content-type")?.split(";")[0] || mimeFromName(name) || "application/octet-stream";
      const path = `${userId}/${crypto.randomUUID()}-${name}`;
      const { error: upErr } = await sb.storage.from("documents").upload(path, buf, { contentType: mime });
      if (upErr) throw upErr;
      const { data, error } = await sb.from("documents").insert({
        user_id: userId, name, mime, size: buf.byteLength, storage_path: path, status: "ready",
        metadata: { source_url: p.url },
      }).select().single();
      if (error) throw error;
      return data;
    },
  },
  {
    name: "documents.delete",
    description: "Permanently delete a document (file + db row). Destructive.",
    params: { id: "uuid (required)" },
    run: async (sb, userId, p) => {
      if (!p?.id) throw new Error("id required");
      const { data: row, error: e1 } = await sb.from("documents").select("storage_path")
        .eq("id", p.id).eq("user_id", userId).single();
      if (e1) throw e1;
      if (row?.storage_path) await sb.storage.from("documents").remove([row.storage_path]);
      const { error } = await sb.from("documents").delete().eq("id", p.id).eq("user_id", userId);
      if (error) throw error;
      return { deleted: p.id };
    },
  },
  {
    name: "documents.signed_url",
    description: "Generate a short-lived signed download URL for a document.",
    params: { id: "uuid (required)", ttl: "number? (seconds, default 300, max 3600)" },
    run: async (sb, userId, p) => {
      if (!p?.id) throw new Error("id required");
      const { data: row, error: e1 } = await sb.from("documents").select("storage_path,name")
        .eq("id", p.id).eq("user_id", userId).single();
      if (e1) throw e1;
      const ttl = Math.min(Math.max(Number(p?.ttl) || 300, 30), 3600);
      const { data, error } = await sb.storage.from("documents").createSignedUrl(row.storage_path, ttl);
      if (error) throw error;
      return { url: data.signedUrl, name: row.name, ttl };
    },
  },
  {
    name: "documents.view",
    description: "Read a document's contents. Text formats (md/txt/json/csv/code/html/xml/svg) are returned inline as `text`. Binary files (pdf/docx/images/etc.) are returned as base64 in `base64` plus a short-lived `url`. Use this to actually read what's in a file.",
    params: {
      id: "uuid (required)",
      max_bytes: "number? (default 2_000_000, max 10_000_000 — caps payload size)",
      as: "'auto'|'text'|'base64'? (default 'auto')",
    },
    example: `{"action":"documents.view","params":{"id":"<doc-id>"}}`,
    run: async (sb, userId, p) => {
      if (!p?.id) throw new Error("id required");
      const { data: row, error: e1 } = await sb.from("documents").select("id,name,mime,size,storage_path")
        .eq("id", p.id).eq("user_id", userId).single();
      if (e1) throw e1;
      const cap = Math.min(Math.max(Number(p?.max_bytes) || 2_000_000, 1024), 10_000_000);
      const { data: blob, error: dlErr } = await sb.storage.from("documents").download(row.storage_path);
      if (dlErr) throw dlErr;
      const buf = new Uint8Array(await blob.arrayBuffer());
      const truncated = buf.byteLength > cap;
      const slice = truncated ? buf.subarray(0, cap) : buf;
      const mime = row.mime || "";
      const isText = ["text", "auto"].includes(p?.as ?? "auto") && (
        mime.startsWith("text/") ||
        mime === "application/json" || mime === "application/xml" || mime === "image/svg+xml" ||
        /\.(md|txt|json|csv|log|html?|xml|svg|ya?ml|toml|ini|js|ts|tsx|jsx|py|rb|go|rs|java|c|cpp|h|sql|sh|env)$/i.test(row.name)
      );
      const { data: signed } = await sb.storage.from("documents").createSignedUrl(row.storage_path, 600);
      const base: any = {
        id: row.id, name: row.name, mime: row.mime, size: row.size,
        bytes_returned: slice.byteLength, truncated,
        url: signed?.signedUrl ?? null, url_ttl: 600,
      };
      if (p?.as === "base64") {
        let bin = ""; for (let i = 0; i < slice.length; i++) bin += String.fromCharCode(slice[i]);
        return { ...base, encoding: "base64", base64: btoa(bin) };
      }
      if (isText) {
        try {
          const text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
          return { ...base, encoding: "text", text };
        } catch { /* fall through to base64 */ }
      }
      let bin = ""; for (let i = 0; i < slice.length; i++) bin += String.fromCharCode(slice[i]);
      return { ...base, encoding: "base64", base64: btoa(bin) };
    },
  },
  {
    name: "skills.list",
    description: "List skills available in this agent's workspace (workspace-scoped + user-wide).",
    run: async (sb, userId, _p, agent) => {
      const ws = `agent:${agent.id}`;
      const { data, error } = await sb.from("skills")
        .select("id, name, slug, description, status, model, workspace_id")
        .eq("user_id", userId)
        .or(`workspace_id.is.null,workspace_id.eq.${ws}`)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  },
  {
    name: "skills.get",
    description: "Get a single skill (by id or slug) available to this agent.",
    params: { id: "string?", slug: "string?" },
    run: async (sb, userId, p, agent) => {
      const ws = `agent:${agent.id}`;
      let q = sb.from("skills")
        .select("id, name, slug, description, prompt, schema, model, status, workspace_id")
        .eq("user_id", userId)
        .or(`workspace_id.is.null,workspace_id.eq.${ws}`);
      if (p?.id) q = q.eq("id", String(p.id));
      else if (p?.slug) q = q.eq("slug", String(p.slug));
      else throw new Error("id or slug required");
      const { data, error } = await q.limit(1).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("skill not found");
      return data;
    },
  },
  {
    name: "skills.run",
    description: "Execute a skill (by id or slug) with input. Runs the skill's prompt+model through Lovable AI and returns the output.",
    params: { id: "string?", slug: "string?", input: "string|object (required)", model: "string? (override)" },
    run: async (sb, userId, p, agent) => {
      const ws = `agent:${agent.id}`;
      let q = sb.from("skills").select("*")
        .eq("user_id", userId)
        .or(`workspace_id.is.null,workspace_id.eq.${ws}`);
      if (p?.id) q = q.eq("id", String(p.id));
      else if (p?.slug) q = q.eq("slug", String(p.slug));
      else throw new Error("id or slug required");
      const { data: skill, error } = await q.limit(1).maybeSingle();
      if (error) throw error;
      if (!skill) throw new Error("skill not found");

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      const input = p?.input ?? "";
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: p?.model || skill.model || "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: skill.prompt || "You are a helpful assistant." },
            { role: "user", content: typeof input === "string" ? input : JSON.stringify(input) },
          ],
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`AI gateway ${r.status}: ${t.slice(0, 300)}`);
      }
      const data = await r.json();
      const output = data.choices?.[0]?.message?.content ?? "";

      await sb.from("events").insert({
        user_id: userId,
        kind: "skill.run",
        source: `agent:${agent.id}`,
        payload: { skill_id: skill.id, slug: skill.slug, input, output, agent_id: agent.id, agent_name: agent.name },
      });
      return { skill: { id: skill.id, slug: skill.slug, name: skill.name }, output };
    },
  },
  {
    name: "events.log",
    description: "Append an event to the timeline.",
    params: { kind: "string (required)", payload: "object?", source: "string?" },
    run: async (sb, userId, p, agent) => {
      if (!p?.kind) throw new Error("kind required");
      const { data, error } = await sb.from("events").insert({
        user_id: userId, kind: String(p.kind),
        payload: {
          ...(p.payload && typeof p.payload === "object" ? p.payload : {}),
          agent_id: agent.id,
          agent_name: agent.name,
        },
        source: p.source ?? `agent:${agent.id}`,
      }).select().single();
      if (error) throw error;
      return data;
    },
  },
  {
    name: "events.list",
    description: "List recent events. Defaults to this agent's own events.",
    params: { limit: "number? (default 20)", scope: "'agent'|'all'? (default 'agent')" },
    run: async (sb, userId, p, agent) => {
      const limit = Math.min(Math.max(Number(p?.limit ?? 20), 1), 200);
      const scope = String(p?.scope ?? "agent");
      if (scope === "agent") return await listAgentEvents(sb, userId, agent.id, limit);
      const { data, error } = await sb.from("events")
        .select("id, kind, payload, source, created_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data;
    },
  },

  /* ─────────── Session rehydration ─────────── */
  {
    name: "agents.bootstrap",
    description: "Rehydrate a fresh session: returns identity, role.md (lazy-seeded), agent-scoped memories, skills, docs index, and recent events. Call this once at the start of every new session.",
    params: { memory_limit: "number? (default 50)", events_limit: "number? (default 20)", docs_limit: "number? (default 30)" },
    run: async (sb, userId, p, agent) => {
      const memLimit = Math.min(Math.max(Number(p?.memory_limit ?? 50), 1), 200);
      const evLimit = Math.min(Math.max(Number(p?.events_limit ?? 20), 1), 100);
      const docLimit = Math.min(Math.max(Number(p?.docs_limit ?? 30), 1), 100);
      const ns = `agent:${agent.id}`;

      // Lazy-seed role.md (category=identity) the first time this agent bootstraps.
      const { data: existingRole } = await sb.from("memories")
        .select("id, content, updated_at")
        .eq("user_id", userId).eq("namespace", ns).eq("category", "identity")
        .eq("archived", false).order("updated_at", { ascending: false }).limit(1).maybeSingle();

      let role = existingRole;
      if (!role) {
        const wsName = (agent.metadata?.workspace_name as string) || agent.name;
        const defaultRole = `# Role: ${agent.name}\n\nYou are **${agent.name}**, an AI agent connected to Synapse.\n\n## Workspace\n- Workspace: ${wsName}\n- Namespace: \`${ns}\`\n- Kind: ${agent.kind}\n\n## How you work\n1. At the start of every session, call \`agents.bootstrap\` to rehydrate (you just did).\n2. Use \`memory.recall\` when you need older context.\n3. Use \`memory.remember\` to persist anything the user states as preference, fact, or decision.\n4. Log meaningful actions with \`events.log\`.\n5. Read this role.md — it tells you who you are. Update it (memory.update) when your role evolves.\n\n## Personality\n_(edit this section to give yourself a personality, tone, expertise area, or constraints)_\n\n## Long-term goals\n_(edit this section to track ongoing objectives across sessions)_\n`;
        const ins = await sb.from("memories").insert({
          user_id: userId,
          namespace: ns,
          category: "identity",
          content: defaultRole,
          tags: ["role", "identity", "self"],
          metadata: { agent_id: agent.id, agent_name: agent.name, seeded: true },
        }).select("id, content, updated_at").single();
        role = ins.data;
      }

      const [memRes, skillsRes, docsRes, eventsRes] = await Promise.all([
        sb.from("memories")
          .select("id, mem_id, content, category, tags, updated_at")
          .eq("user_id", userId).eq("namespace", ns).eq("archived", false)
          .neq("category", "identity")
          .order("updated_at", { ascending: false }).limit(memLimit),
        sb.from("skills")
          .select("id, name, slug, description, status, model, workspace_id")
          .eq("user_id", userId)
          .or(`workspace_id.is.null,workspace_id.eq.${ns}`)
          .order("updated_at", { ascending: false }),
        sb.from("documents")
          .select("id, name, mime, size, created_at")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(docLimit),
        listAgentEvents(sb, userId, agent.id, evLimit),
      ]);

      return {
        identity: {
          agent_id: agent.id,
          name: agent.name,
          kind: agent.kind,
          workspace: {
            id: ns,
            name: (agent.metadata?.workspace_name as string) || null,
          },
        },
        role: role ? {
          id: role.id,
          content: role.content,
          updated_at: role.updated_at,
        } : null,
        memories: memRes.data ?? [],
        skills: skillsRes.data ?? [],
        documents: docsRes.data ?? [],
        events: eventsRes.data ?? [],
        next_steps: [
          "Read role.md carefully — that's who you are.",
          "Scan memories[] for ongoing context.",
          "Use memory.remember to persist anything new the user shares.",
        ],
      };
    },
  },

  /* ─────────── MCP: connected Model-Context-Protocol servers ─────────── */

  {
    name: "mcp.servers",
    description: "List the user's connected MCP servers (id, name, url, transport, enabled, last_handshake_at, last_error).",
    run: async (sb, userId) => {
      const { data, error } = await sb.from("mcp_servers")
        .select("id, name, url, transport, enabled, last_handshake_at, last_error, created_at")
        .eq("user_id", userId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  },
  {
    name: "mcp.tools",
    description: "List MCP tools discovered for the user. Optionally filter by server_id.",
    params: { server_id: "uuid? (filter to one server)", enabled_only: "boolean? (default false)" },
    run: async (sb, userId, p) => {
      // Join via server ownership
      const { data: servers, error: e1 } = await sb.from("mcp_servers")
        .select("id, name").eq("user_id", userId);
      if (e1) throw e1;
      const allowed = new Set(servers.map((s) => s.id));
      let q = sb.from("mcp_tools")
        .select("id, mcp_server_id, name, description, input_schema, enabled");
      if (p?.server_id) q = q.eq("mcp_server_id", String(p.server_id));
      if (p?.enabled_only) q = q.eq("enabled", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).filter((t) => allowed.has(t.mcp_server_id))
        .map((t) => ({ ...t, server_name: servers.find((s) => s.id === t.mcp_server_id)?.name }));
    },
  },
  {
    name: "mcp.sync",
    description: "Re-run the handshake on an MCP server: re-discovers its tools list. Use after the remote server adds/removes tools, or to clear last_error.",
    params: { server_id: "uuid (required)" },
    run: async (sb, userId, p) => {
      if (!p?.server_id) throw new Error("server_id required");
      const { data: server, error: e1 } = await sb.from("mcp_servers").select("*")
        .eq("id", p.server_id).eq("user_id", userId).single();
      if (e1) throw e1;
      const headers: Record<string, string> = {};
      if (server.auth?.bearer) headers.Authorization = `Bearer ${server.auth.bearer}`;
      if (server.auth?.headers) Object.assign(headers, server.auth.headers);
      try {
        const init = await mcpRpc(server.url, "initialize", {
          protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "synapse", version: "1.0.0" },
        }, headers);
        const sessionHeaders = { ...headers };
        if (init.sessionId) sessionHeaders["Mcp-Session-Id"] = init.sessionId;
        await mcpNotify(server.url, "notifications/initialized", sessionHeaders);
        const list = await mcpRpc(server.url, "tools/list", {}, sessionHeaders);
        const tools = (list.body?.result?.tools ?? list.body?.tools ?? []) as Array<{ name: string; description?: string; inputSchema?: any }>;
        await sb.from("mcp_tools").delete().eq("mcp_server_id", server.id);
        if (tools.length) {
          await sb.from("mcp_tools").insert(tools.map((t) => ({
            mcp_server_id: server.id, name: t.name, description: t.description ?? null, input_schema: t.inputSchema ?? {},
          })));
        }
        await sb.from("mcp_servers").update({ last_handshake_at: new Date().toISOString(), last_error: null }).eq("id", server.id);
        return { ok: true, server_id: server.id, name: server.name, tools_count: tools.length };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        await sb.from("mcp_servers").update({ last_error: msg, last_handshake_at: new Date().toISOString() }).eq("id", server.id);
        throw new Error(msg);
      }
    },
  },
  {
    name: "mcp.call",
    description: "Invoke a tool on a connected MCP server. Pass `server` (name or id) and `tool` (tool name) plus `arguments`. Use `mcp.tools` first to discover what's available.",
    params: { server: "string (name or uuid, required)", tool: "string (required)", arguments: "object? (tool arguments)" },
    example: `{"action":"mcp.call","params":{"server":"Netlify","tool":"list-sites","arguments":{}}}`,
    run: async (sb, userId, p) => {
      if (!p?.server) throw new Error("server (name or id) required");
      if (!p?.tool) throw new Error("tool required");
      // Resolve server by id or name
      const isUuid = /^[0-9a-f-]{36}$/i.test(String(p.server));
      const sq = sb.from("mcp_servers").select("*").eq("user_id", userId).eq("enabled", true);
      const { data: srv, error: e1 } = isUuid
        ? await sq.eq("id", p.server).maybeSingle()
        : await sq.eq("name", String(p.server)).maybeSingle();
      if (e1) throw e1;
      if (!srv) throw new Error(`MCP server not found or disabled: ${p.server}`);
      const headers: Record<string, string> = {};
      if (srv.auth?.bearer) headers.Authorization = `Bearer ${srv.auth.bearer}`;
      if (srv.auth?.headers) Object.assign(headers, srv.auth.headers);
      let sessionHeaders = { ...headers };
      try {
        const init = await mcpRpc(srv.url, "initialize", {
          protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "synapse", version: "1.0.0" },
        }, headers);
        if (init.sessionId) sessionHeaders["Mcp-Session-Id"] = init.sessionId;
        await mcpNotify(srv.url, "notifications/initialized", sessionHeaders);
      } catch { /* stateless servers ok */ }
      const out = await mcpRpc(srv.url, "tools/call", { name: String(p.tool), arguments: p.arguments ?? {} }, sessionHeaders);
      return out.body?.result ?? out.body;
    },
  },
  {
    name: "mcp.add_server",
    description: "Connect a new MCP server. Pass name, url, optional transport ('http'|'sse', default 'http'), optional auth ({bearer?, headers?}). Automatically handshakes and discovers tools.",
    params: { name: "string (required)", url: "string (required)", transport: "'http'|'sse'? (default 'http')", auth: "object? ({bearer?: string, headers?: object})", enabled: "boolean? (default true)" },
    example: `{"action":"mcp.add_server","params":{"name":"Netlify","url":"https://mcp.netlify.com/","auth":{"bearer":"nfp_xxx"}}}`,
    run: async (sb, userId, p) => {
      if (!p?.name) throw new Error("name required");
      if (!p?.url) throw new Error("url required");
      const { data: server, error } = await sb.from("mcp_servers").insert({
        user_id: userId,
        name: String(p.name),
        url: String(p.url),
        transport: String(p.transport ?? "http"),
        auth: p.auth ?? {},
        enabled: p.enabled !== false,
      }).select("id, name, url, transport, enabled").single();
      if (error) throw error;
      // Try handshake immediately
      const headers: Record<string, string> = {};
      if (p.auth?.bearer) headers.Authorization = `Bearer ${p.auth.bearer}`;
      if (p.auth?.headers) Object.assign(headers, p.auth.headers);
      try {
        const init = await mcpRpc(server.url, "initialize", {
          protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "synapse", version: "1.0.0" },
        }, headers);
        const sessionHeaders = { ...headers };
        if (init.sessionId) sessionHeaders["Mcp-Session-Id"] = init.sessionId;
        await mcpNotify(server.url, "notifications/initialized", sessionHeaders);
        const list = await mcpRpc(server.url, "tools/list", {}, sessionHeaders);
        const tools = (list.body?.result?.tools ?? list.body?.tools ?? []) as Array<{ name: string; description?: string; inputSchema?: any }>;
        if (tools.length) {
          await sb.from("mcp_tools").insert(tools.map((t) => ({
            mcp_server_id: server.id, name: t.name, description: t.description ?? null, input_schema: t.inputSchema ?? {},
          })));
        }
        await sb.from("mcp_servers").update({ last_handshake_at: new Date().toISOString(), last_error: null }).eq("id", server.id);
        return { ...server, tools_count: tools.length };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        await sb.from("mcp_servers").update({ last_error: msg, last_handshake_at: new Date().toISOString() }).eq("id", server.id);
        return { ...server, tools_count: 0, handshake_error: msg };
      }
    },
  },
  {
    name: "mcp.update_server",
    description: "Update an MCP server's name, url, transport, or auth. Pass server_id plus any fields to change.",
    params: { server_id: "uuid (required)", name: "string?", url: "string?", transport: "string?", auth: "object?", enabled: "boolean?" },
    run: async (sb, userId, p) => {
      if (!p?.server_id) throw new Error("server_id required");
      const patch: Record<string, unknown> = {};
      for (const k of ["name", "url", "transport", "auth", "enabled"] as const) {
        if (p[k] !== undefined) patch[k] = p[k];
      }
      if (!Object.keys(patch).length) throw new Error("nothing to update");
      const { data, error } = await sb.from("mcp_servers").update(patch)
        .eq("id", p.server_id).eq("user_id", userId)
        .select("id, name, url, transport, enabled, auth").single();
      if (error) throw error;
      return data;
    },
  },
  {
    name: "mcp.toggle_server",
    description: "Enable or disable an MCP server.",
    params: { server_id: "uuid (required)", enabled: "boolean (required)" },
    run: async (sb, userId, p) => {
      if (!p?.server_id) throw new Error("server_id required");
      if (typeof p?.enabled !== "boolean") throw new Error("enabled (boolean) required");
      const { data, error } = await sb.from("mcp_servers").update({ enabled: p.enabled })
        .eq("id", p.server_id).eq("user_id", userId)
        .select("id, name, enabled").single();
      if (error) throw error;
      return data;
    },
  },
  {
    name: "mcp.delete_server",
    description: "Disconnect and delete an MCP server (cascades to its tools).",
    params: { server_id: "uuid (required)" },
    run: async (sb, userId, p) => {
      if (!p?.server_id) throw new Error("server_id required");
      const { error } = await sb.from("mcp_servers").delete()
        .eq("id", p.server_id).eq("user_id", userId);
      if (error) throw error;
      return { ok: true, deleted: p.server_id };
    },
  },
  {
    name: "mcp.toggle_tool",
    description: "Enable or disable a specific MCP tool.",
    params: { tool_id: "uuid (required)", enabled: "boolean (required)" },
    run: async (sb, userId, p) => {
      if (!p?.tool_id) throw new Error("tool_id required");
      if (typeof p?.enabled !== "boolean") throw new Error("enabled (boolean) required");
      // Verify ownership via server join
      const { data: tool, error: e1 } = await sb.from("mcp_tools")
        .select("id, mcp_server_id, mcp_servers!inner(user_id)")
        .eq("id", p.tool_id).maybeSingle();
      if (e1) throw e1;
      if (!tool || (tool as any).mcp_servers?.user_id !== userId) throw new Error("tool not found");
      const { data, error } = await sb.from("mcp_tools").update({ enabled: p.enabled })
        .eq("id", p.tool_id).select("id, name, enabled").single();
      if (error) throw error;
      return data;
    },
  },

  /* ─────────── Identity: agent self-management ─────────── */
  {
    name: "agents.list",
    description: "List all agents owned by the same user.",
    params: { limit: "number? (default 50)" },
    run: async (sb, userId, p) => {
      const limit = Math.min(Math.max(Number(p?.limit ?? 50), 1), 200);
      const { data, error } = await sb.from("agents")
        .select("id, name, kind, status, metadata, created_at, last_seen_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data;
    },
  },
  {
    name: "agents.new",
    description: "Create a new agent. Defaults: kind='claude_code', name='Claude Code'.",
    params: { name: "string?", kind: "'claude_code'|'custom'? (default 'claude_code')" },
    run: async (sb, userId, p) => {
      const kind = String(p?.kind ?? "claude_code");
      const name = String(p?.name ?? (kind === "claude_code" ? "Claude Code" : "Custom agent"));
      const { data, error } = await sb.from("agents")
        .insert({ user_id: userId, name, kind, status: "pending" })
        .select("id, name, kind, status, token, created_at").single();
      if (error) throw error;
      return data;
    },
  },
  {
    name: "agents.rename",
    description: "Rename an agent. If id omitted, renames the calling agent (self).",
    params: { id: "uuid? (default: self)", name: "string (required)" },
    run: async (sb, userId, p, agent) => {
      if (!p?.name) throw new Error("name required");
      const id = String(p?.id ?? agent.id);
      const { data, error } = await sb.from("agents").update({ name: String(p.name) })
        .eq("id", id).eq("user_id", userId).select("id, name, kind").single();
      if (error) throw error;
      return data;
    },
  },
  {
    name: "agents.reset_name",
    description: "Reset an agent's name to the default for its kind (e.g. 'Claude Code'). Defaults to self.",
    params: { id: "uuid? (default: self)" },
    run: async (sb, userId, p, agent) => {
      const id = String(p?.id ?? agent.id);
      const { data: row, error: e1 } = await sb.from("agents").select("kind").eq("id", id).eq("user_id", userId).single();
      if (e1) throw e1;
      const defaultName = row.kind === "claude_code" ? "Claude Code" : "Custom agent";
      const { data, error } = await sb.from("agents").update({ name: defaultName })
        .eq("id", id).eq("user_id", userId).select("id, name, kind").single();
      if (error) throw error;
      return data;
    },
  },

  /* ─────────── Workspace (per agent; ID is immutable agent:<id>) ─────────── */
  {
    name: "workspace.set_name",
    description: "Set/change the workspace display name for an agent (stored in agent.metadata.workspace_name). ID stays agent:<id>.",
    params: { id: "uuid? (default: self)", name: "string (required)" },
    run: async (sb, userId, p, agent) => {
      if (!p?.name) throw new Error("name required");
      const id = String(p?.id ?? agent.id);
      const { data: row, error: e1 } = await sb.from("agents").select("metadata").eq("id", id).eq("user_id", userId).single();
      if (e1) throw e1;
      const meta = { ...(row.metadata || {}), workspace_name: String(p.name) };
      const { data, error } = await sb.from("agents").update({ metadata: meta })
        .eq("id", id).eq("user_id", userId).select("id, name, metadata").single();
      if (error) throw error;
      return { id: data.id, workspace: { id: `agent:${data.id}`, name: meta.workspace_name } };
    },
  },
  {
    name: "workspace.rename",
    description: "Alias of workspace.set_name.",
    params: { id: "uuid? (default: self)", name: "string (required)" },
    run: async (sb, userId, p, agent) => {
      if (!p?.name) throw new Error("name required");
      const id = String(p?.id ?? agent.id);
      const { data: row, error: e1 } = await sb.from("agents").select("metadata").eq("id", id).eq("user_id", userId).single();
      if (e1) throw e1;
      const meta = { ...(row.metadata || {}), workspace_name: String(p.name) };
      const { data, error } = await sb.from("agents").update({ metadata: meta })
        .eq("id", id).eq("user_id", userId).select("id, metadata").single();
      if (error) throw error;
      return { id: data.id, workspace: { id: `agent:${data.id}`, name: meta.workspace_name } };
    },
  },
  {
    name: "workspace.delete_name",
    description: "Clear the workspace display name. Agent keeps its immutable workspace ID agent:<id>.",
    params: { id: "uuid? (default: self)" },
    run: async (sb, userId, p, agent) => {
      const id = String(p?.id ?? agent.id);
      const { data: row, error: e1 } = await sb.from("agents").select("metadata").eq("id", id).eq("user_id", userId).single();
      if (e1) throw e1;
      const meta = { ...(row.metadata || {}) };
      delete meta.workspace_name;
      const { data, error } = await sb.from("agents").update({ metadata: meta })
        .eq("id", id).eq("user_id", userId).select("id, metadata").single();
      if (error) throw error;
      return { id: data.id, workspace: { id: `agent:${data.id}`, name: null } };
    },
  },
  {
    name: "workspace.reset",
    description: "Reset workspace identity: clears display name → falls back to immutable agent:<id>.",
    params: { id: "uuid? (default: self)" },
    run: async (sb, userId, p, agent) => {
      const id = String(p?.id ?? agent.id);
      const { data: row, error: e1 } = await sb.from("agents").select("metadata").eq("id", id).eq("user_id", userId).single();
      if (e1) throw e1;
      const meta = { ...(row.metadata || {}) };
      delete meta.workspace_name;
      const { data, error } = await sb.from("agents").update({ metadata: meta })
        .eq("id", id).eq("user_id", userId).select("id, metadata").single();
      if (error) throw error;
      return { id: data.id, workspace: { id: `agent:${data.id}`, name: null, scope: "agent", shared_namespace: "default" } };
    },
  },

  /* ─────────── Web tools (live internet access for any agent) ─────────── */
  {
    name: "web.fetch",
    description: "Fetch a URL and return clean text/markdown/html/json. No API key. Inspired by webfetch-mcp.",
    params: { url: "string (required)", format: "'markdown'|'text'|'html'|'json'? (default 'markdown')", max_chars: "number? (default 20000)" },
    run: async (_sb, _userId, p) => {
      const url = String(p?.url ?? "");
      if (!/^https?:\/\//i.test(url)) throw new Error("url must start with http(s)://");
      const format = String(p?.format ?? "markdown");
      const maxChars = Math.min(Math.max(Number(p?.max_chars ?? 20000), 500), 200000);
      const ua = "Mozilla/5.0 (compatible; MemorifyBot/1.0; +https://memorify.dev)";
      await assertSafeUrl(url);
      if (format === "markdown") {
        // r.jina.ai is a free clean-markdown reader proxy (no key)
        const res = await fetch(`https://r.jina.ai/${url}`, { headers: { "User-Agent": ua, "X-Return-Format": "markdown" } });
        const text = await res.text();
        return { url, status: res.status, format, content: text.slice(0, maxChars), truncated: text.length > maxChars };
      }
      const res = await safeFetch(url, { headers: { "User-Agent": ua, Accept: format === "json" ? "application/json" : "text/html,*/*" } });
      const ct = res.headers.get("content-type") ?? "";
      const raw = await res.text();
      let content: any = raw;
      if (format === "text") {
        content = raw.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      } else if (format === "json") {
        try { content = JSON.parse(raw); } catch { /* return raw */ }
      }
      const out = typeof content === "string" ? content.slice(0, maxChars) : content;
      return { url, status: res.status, content_type: ct, format, content: out, truncated: typeof content === "string" && content.length > maxChars };
    },
  },
  {
    name: "web.search",
    description: "Search the web via SearxNG (no API key). Returns title/url/snippet results.",
    params: { query: "string (required)", limit: "number? (default 10)", engines: "string? (comma list, e.g. 'google,duckduckgo,brave')", language: "string? (default 'en')" },
    run: async (_sb, _userId, p) => {
      const query = String(p?.query ?? "").trim();
      if (!query) throw new Error("query required");
      const limit = Math.min(Math.max(Number(p?.limit ?? 10), 1), 30);
      const base = (Deno.env.get("SEARXNG_URL") || "https://searx.be").replace(/\/+$/, "");
      const qs = new URLSearchParams({ q: query, format: "json", language: String(p?.language ?? "en") });
      if (p?.engines) qs.set("engines", String(p.engines));
      const res = await fetch(`${base}/search?${qs.toString()}`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MemorifyBot/1.0)", Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`search failed [${res.status}]: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const results = (data?.results ?? []).slice(0, limit).map((r: any) => ({
        title: r.title, url: r.url, snippet: r.content, engine: r.engine, score: r.score,
      }));
      return { query, count: results.length, results };
    },
  },
  {
    name: "web.extract",
    description: "Extract clean article content from a URL as markdown (via reader proxy). Best for blog posts & docs.",
    params: { url: "string (required)", max_chars: "number? (default 30000)" },
    run: async (_sb, _userId, p) => {
      const url = String(p?.url ?? "");
      if (!/^https?:\/\//i.test(url)) throw new Error("url must start with http(s)://");
      await assertSafeUrl(url);
      const maxChars = Math.min(Math.max(Number(p?.max_chars ?? 30000), 500), 200000);
      const res = await fetch(`https://r.jina.ai/${url}`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MemorifyBot/1.0)", "X-Return-Format": "markdown" },
      });
      const text = await res.text();
      return { url, status: res.status, markdown: text.slice(0, maxChars), truncated: text.length > maxChars };
    },
  },
];

const MCP_ACCEPT = "application/json, text/event-stream";
async function mcpRpc(url: string, method: string, params: any, headers: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: MCP_ACCEPT, ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MCP ${method} [${res.status}]: ${text.slice(0, 400)}`);
  const sessionId = res.headers.get("mcp-session-id") ?? res.headers.get("Mcp-Session-Id") ?? null;
  if (text.startsWith("event:") || text.includes("data:")) {
    const lines = text.split("\n").filter((l) => l.startsWith("data:"));
    const last = lines[lines.length - 1]?.slice(5).trim();
    return { body: last ? JSON.parse(last) : {}, sessionId };
  }
  return { body: JSON.parse(text), sessionId };
}

async function mcpNotify(url: string, method: string, headers: Record<string, string>) {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: MCP_ACCEPT, ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", method, params: {} }),
  }).then((r) => r.text()).catch(() => {});
}

function mimeFromName(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json",
    rtf: "application/rtf", odt: "application/vnd.oasis.opendocument.text",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  };
  return map[ext] ?? null;
}

async function uploadBase64(sb: ReturnType<typeof admin>, userId: string, p: any) {
  if (!p?.base64) throw new Error("base64 required");
  if (!p?.name) throw new Error("name (or path) required");
  const b64 = String(p.base64).replace(/^data:[^;]+;base64,/, "");
  let bytes: Uint8Array;
  try {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch { throw new Error("invalid base64"); }
  const mime = p.mime || mimeFromName(p.name) || "application/octet-stream";
  const path = `${userId}/${crypto.randomUUID()}-${p.name}`;
  const { error: upErr } = await sb.storage.from("documents").upload(path, bytes, { contentType: mime });
  if (upErr) throw upErr;
  const { data, error } = await sb.from("documents").insert({
    user_id: userId, name: p.name, mime, size: bytes.byteLength, storage_path: path, status: "ready",
  }).select().single();
  if (error) throw error;
  return data;
}

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

  // Reject expired tokens.
  if ((agent as any).token_expires_at && new Date((agent as any).token_expires_at).getTime() < Date.now()) {
    return json({
      ok: false,
      error: "token_expired",
      message: "This token has expired. The user must rotate it from the Memorify dashboard.",
      expired_at: (agent as any).token_expires_at,
    }, 401);
  }

  // Honor pause / revoke states set from the dashboard.
  if (agent.status === "paused") {
    return json({
      ok: false,
      error: "agent_paused",
      message: "This agent is paused by the user. Resume it from the Synapse dashboard to continue.",
    }, 423);
  }
  if (agent.status === "revoked" || agent.status === "disconnected") {
    return json({
      ok: false,
      error: "agent_disconnected",
      message: "This agent's access was revoked. Ask the user to re-pair you with a fresh token.",
    }, 401);
  }

  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent") || null;

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
      workspace: {
        id: `agent:${agent.id}`,
        name: ((agent as any).metadata?.workspace_name as string) || null,
        scope: "agent",
        shared_namespace: "default",
      },
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

  const startedAt = Date.now();
  const kind = action.split(".")[0]; // memory | documents | skills | mcp | events | ...
  try {
    const result = await cmd.run(admin(), agent.user_id, params, agent);
    const latency = Date.now() - startedAt;
    // Fire-and-forget activity log (skip noisy reads on every poll)
    admin().from("events").insert({
      user_id: agent.user_id,
      kind: `agent.${action}`,
      source: `agent:${agent.id}`,
      payload: {
        agent_id: agent.id,
        agent_name: agent.name,
        ok: true,
        duration_ms: latency,
        params: action.startsWith("memory.") || action.startsWith("events.log") ? params : undefined,
      },
    }).then(() => {});
    admin().from("agent_calls").insert({
      user_id: agent.user_id,
      agent_id: agent.id,
      kind,
      name: action,
      status: "ok",
      latency_ms: latency,
      metadata: { source: "agent-api", ip, user_agent: userAgent },
    }).then(() => {});
    return json({ ok: true, action, result, agent: { id: agent.id, name: agent.name } });
  } catch (e: any) {
    const latency = Date.now() - startedAt;
    admin().from("events").insert({
      user_id: agent.user_id,
      kind: `agent.${action}.error`,
      source: `agent:${agent.id}`,
      payload: { agent_id: agent.id, agent_name: agent.name, error: e?.message ?? "error" },
    }).then(() => {});
    admin().from("agent_calls").insert({
      user_id: agent.user_id,
      agent_id: agent.id,
      kind,
      name: action,
      status: "error",
      latency_ms: latency,
      metadata: { source: "agent-api", error: e?.message ?? "error", ip, user_agent: userAgent },
    }).then(() => {});
    return json({ ok: false, action, error: e.message ?? "error" }, 400);
  }
});
