// routes/v1.ts — Agent gateway: POST /v1 {agent, action, input}
// Auth: Bearer <agent-token> (mem_live_...)
//
// This is the core HTTP gateway that external agents (Hermes, Claude Code, etc.)
// call to interact with Memorify. It dispatches to action handlers.

import { json } from "../lib/cors.ts";
import { verifyAgentToken, type AgentTokenPayload } from "../lib/agent-token.ts";
import { query, queryOne, execute } from "../lib/db.ts";

type GatewayRequest = {
  agent: string;
  action: string;
  input?: Record<string, unknown>;
};

type AgentContext = AgentTokenPayload & {
  workspace_id: string;
  agent_id: string;
};

export async function handleV1(req: Request): Promise<Response> {
  if (req.method === "GET") {
    return json({
      name: "memorify-gateway",
      version: "0.1.0",
      protocol: { agent: "string", action: "string", input: "object" },
      agents: {
        memory: ["remember", "recall", "list", "update", "delete"],
        gateway: ["ping", "manifest"],
        skills: ["list", "get", "run"],
        events: ["log", "list"],
        mcp: ["servers", "tools", "call", "sync", "add_server"],
        agents: ["list", "new", "rename", "bootstrap"],
        documents: ["list", "view", "add_from_url", "delete"],
      },
      auth: "Bearer <mem_live_...>",
    });
  }

  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  // ── Auth ──────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const rawToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : req.headers.get("x-agent-token") ?? "";
  if (!rawToken) return json({ error: "unauthorized: missing token" }, 401);

  const agentPayload = await verifyAgentToken(rawToken);
  if (!agentPayload) return json({ error: "unauthorized: invalid or revoked token" }, 401);

  // ── Parse body ────────────────────────────────────────────
  let body: GatewayRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const { agent: agentName, action, input = {} } = body;
  if (!agentName || !action) return json({ error: "missing 'agent' or 'action'" }, 400);

  const ctx: AgentContext = {
    ...agentPayload,
    workspace_id: agentPayload.workspace_id,
    agent_id: agentPayload.agent_id,
  };

  // ── Dispatch ──────────────────────────────────────────────
  try {
    const result = await dispatch(agentName, action, input, ctx);
    return json({ ok: true, action: `${agentName}.${action}`, result, agent: { id: ctx.agent_id, name: ctx.name } });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message });
  }
}

// ── Action dispatch ──────────────────────────────────────────
// deno-lint-ignore require-await
async function dispatch(agent: string, action: string, input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
  // Gateway
  if (agent === "gateway" && action === "ping") return { pong: true, agent: ctx.agent_id };
  if (agent === "gateway" && action === "manifest") {
    return {
      agents: ["memory", "skills", "events", "mcp", "documents", "agents"],
      version: "0.1.0",
    };
  }

  // Memory
  if (agent === "memory") return handleMemory(action, input, ctx);

  // Skills
  if (agent === "skills") return handleSkills(action, input, ctx);

  // Events
  if (agent === "events") return handleEvents(action, input, ctx);

  // Documents
  if (agent === "documents") return handleDocuments(action, input, ctx);

  // Agents
  if (agent === "agents") return handleAgents(action, input, ctx);

  // MCP
  if (agent === "mcp") return handleMcp(action, input, ctx);

  throw new Error(`unknown agent: ${agent}`);
}

// ── Memory actions ───────────────────────────────────────────
async function handleMemory(action: string, input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
  const ws = ctx.workspace_id;
  const ns = (input.namespace as string) || `agent:${ctx.agent_id}`;

  switch (action) {
    case "remember": {
      const content = input.content as string;
      if (!content) throw new Error("content required");
      const category = (input.category as string) || "general";
      const tags = (input.tags as string[]) ?? [];
      const metadata = input.metadata ?? {};

      const row = await queryOne<{ id: string }>(
        `INSERT INTO memories (workspace_id, namespace, content, category, tags, metadata)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [ws, ns, content, category, tags, JSON.stringify(metadata)],
      );

      // Log event
      execute(
        `INSERT INTO events (workspace_id, agent_id, kind, source, payload)
         VALUES ($1, $2, 'memory.remember', $3, $4)`,
        [ws, ctx.agent_id, `agent:${ctx.agent_id}`, JSON.stringify({ memory_id: row?.id })],
      ).catch(() => {});

      return { id: row?.id, content, category, tags, namespace: ns };
    }

    case "recall": {
      const query_text = (input.query as string) ?? "";
      const limit = Math.min(Math.max(Number(input.limit ?? 20), 1), 200);
      const scope = (input.scope as string) || "agent"; // agent | shared | all

      let nsFilter = `namespace = $2`;
      let params: unknown[] = [ws, ns];
      if (scope === "shared") {
        nsFilter = `namespace = 'shared'`;
        params = [ws];
      } else if (scope === "all") {
        nsFilter = `namespace IN ($2, 'shared', 'default')`;
        params = [ws, ns];
      }

      let sql = `SELECT id, content, category, tags, namespace, updated_at FROM memories
        WHERE workspace_id = $1 AND ${nsFilter} AND archived = false`;
      if (query_text) {
        sql += ` AND content ILIKE '%' || $${params.length + 1} || '%'`;
        params.push(query_text);
      }
      sql += ` ORDER BY updated_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      return await query(sql, params);
    }

    case "update": {
      const id = input.id as string;
      const content = input.content as string;
      if (!id) throw new Error("id required");

      // Save old version
      const old = await queryOne<{ content: string }>(
        `SELECT content FROM memories WHERE id = $1 AND workspace_id = $2`,
        [id, ws],
      );
      if (!old) throw new Error("memory not found");

      if (content) {
        await execute(
          `INSERT INTO memory_versions (memory_id, content) VALUES ($1, $2)`,
          [id, old.content],
        );
        await execute(
          `UPDATE memories SET content = $1 WHERE id = $2 AND workspace_id = $3`,
          [content, id, ws],
        );
      }

      return { id, updated: true };
    }

    case "delete": {
      const id = input.id as string;
      if (!id) throw new Error("id required");
      const count = await execute(
        `DELETE FROM memories WHERE id = $1 AND workspace_id = $2`,
        [id, ws],
      );
      return { id, deleted: count > 0 };
    }

    case "list": {
      const limit = Math.min(Math.max(Number(input.limit ?? 50), 1), 200);
      return await query(
        `SELECT id, content, category, tags, namespace, updated_at FROM memories
         WHERE workspace_id = $1 AND archived = false ORDER BY updated_at DESC LIMIT $2`,
        [ws, limit],
      );
    }

    default:
      throw new Error(`unknown memory action: ${action}`);
  }
}

// ── Skills actions ──────────────────────────────────────────
async function handleSkills(action: string, input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
  const ws = ctx.workspace_id;

  switch (action) {
    case "list": {
      return await query(
        `SELECT id, name, slug, description, status, model, version FROM skills WHERE workspace_id = $1 ORDER BY created_at DESC`,
        [ws],
      );
    }

    case "get": {
      const id = input.id as string;
      const slug = input.slug as string;
      if (!id && !slug) throw new Error("id or slug required");

      if (id) {
        return await queryOne(
          `SELECT * FROM skills WHERE id = $1 AND workspace_id = $2`,
          [id, ws],
        );
      }
      return await queryOne(
        `SELECT * FROM skills WHERE slug = $1 AND workspace_id = $2`,
        [slug, ws],
      );
    }

    case "run": {
      const id = input.id as string;
      const slug = input.slug as string;
      const userInput = input.input as string;
      const modelOverride = input.model as string | undefined;
      if (!userInput) throw new Error("input required");

      const skill = id
        ? await queryOne<{ id: string; prompt: string; model: string; name: string }>(
          `SELECT id, prompt, model, name FROM skills WHERE id = $1 AND workspace_id = $2`,
          [id, ws],
        )
        : await queryOne<{ id: string; prompt: string; model: string; name: string }>(
          `SELECT id, prompt, model, name FROM skills WHERE slug = $1 AND workspace_id = $2`,
          [slug, ws],
        );

      if (!skill) throw new Error("skill not found");

      // Log the run
      execute(
        `INSERT INTO events (workspace_id, agent_id, kind, source, payload)
         VALUES ($1, $2, 'skill.run', $3, $4)`,
        [ws, ctx.agent_id, skill.name, JSON.stringify({ skill_id: skill.id })],
      ).catch(() => {});

      // Return the skill's prompt + model so the caller can execute it
      // (actual LLM execution happens on the caller side or via a future AI gateway)
      return {
        skill_id: skill.id,
        name: skill.name,
        model: modelOverride ?? skill.model,
        prompt: skill.prompt,
        input: userInput,
      };
    }

    default:
      throw new Error(`unknown skills action: ${action}`);
  }
}

// ── Events actions ──────────────────────────────────────────
async function handleEvents(action: string, input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
  const ws = ctx.workspace_id;

  switch (action) {
    case "log": {
      const kind = input.kind as string;
      const message = input.message as string | undefined;
      const metadata = input.metadata ?? {};
      if (!kind) throw new Error("kind required");

      const row = await queryOne<{ id: string }>(
        `INSERT INTO events (workspace_id, agent_id, kind, source, payload)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [ws, ctx.agent_id, kind, `agent:${ctx.agent_id}`, JSON.stringify({ message, ...metadata })],
      );
      return { id: row?.id };
    }

    case "list": {
      const limit = Math.min(Math.max(Number(input.limit ?? 20), 1), 100);
      return await query(
        `SELECT id, kind, source, payload, created_at FROM events WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [ws, limit],
      );
    }

    default:
      throw new Error(`unknown events action: ${action}`);
  }
}

// ── Documents actions ────────────────────────────────────────
async function handleDocuments(action: string, input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
  const ws = ctx.workspace_id;

  switch (action) {
    case "list": {
      const limit = Math.min(Math.max(Number(input.limit ?? 50), 1), 200);
      return await query(
        `SELECT id, name, kind, size, source_url, created_at FROM documents WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [ws, limit],
      );
    }

    case "view": {
      const id = input.id as string;
      if (!id) throw new Error("id required");
      return await queryOne(
        `SELECT * FROM documents WHERE id = $1 AND workspace_id = $2`,
        [id, ws],
      );
    }

    case "add_from_url": {
      const url = input.url as string;
      const name = (input.name as string) || url;
      if (!url) throw new Error("url required");

      // Fetch the URL content
      const res = await fetch(url);
      const content = await res.text();
      const size = content.length;

      const row = await queryOne<{ id: string }>(
        `INSERT INTO documents (workspace_id, name, kind, size, content, source_url)
         VALUES ($1, $2, 'text', $3, $4, $5) RETURNING id`,
        [ws, name, size, content, url],
      );

      return { id: row?.id, name, size, source_url: url };
    }

    case "delete": {
      const id = input.id as string;
      if (!id) throw new Error("id required");
      const count = await execute(
        `DELETE FROM documents WHERE id = $1 AND workspace_id = $2`,
        [id, ws],
      );
      return { id, deleted: count > 0 };
    }

    default:
      throw new Error(`unknown documents action: ${action}`);
  }
}

// ── Agents actions ───────────────────────────────────────────
async function handleAgents(action: string, input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
  const ws = ctx.workspace_id;

  switch (action) {
    case "list": {
      return await query(
        `SELECT id, name, kind, status, last_seen_at, created_at FROM agents WHERE workspace_id = $1 ORDER BY created_at DESC`,
        [ws],
      );
    }

    case "bootstrap": {
      // Return agent context for session rehydration
      const [memories, skills, events] = await Promise.all([
        query(
          `SELECT id, content, category, tags FROM memories WHERE workspace_id = $1 AND namespace = $2 AND archived = false ORDER BY updated_at DESC LIMIT 50`,
          [ws, `agent:${ctx.agent_id}`],
        ),
        query(
          `SELECT id, name, slug, description, status FROM skills WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 20`,
          [ws],
        ),
        query(
          `SELECT id, kind, payload, created_at FROM events WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 20`,
          [ws],
        ),
      ]);

      return {
        agent: { id: ctx.agent_id, name: ctx.name, kind: ctx.kind },
        workspace_id: ws,
        memories,
        skills,
        events,
      };
    }

    case "rename": {
      const name = input.name as string;
      if (!name) throw new Error("name required");
      await execute(
        `UPDATE agents SET name = $1 WHERE id = $2 AND workspace_id = $3`,
        [name, ctx.agent_id, ws],
      );
      return { updated: true };
    }

    default:
      throw new Error(`unknown agents action: ${action}`);
  }
}

// ── MCP actions (proxy to connected servers) ────────────────
async function handleMcp(action: string, input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
  const ws = ctx.workspace_id;

  switch (action) {
    case "servers": {
      return await query(
        `SELECT id, name, url, transport, enabled, last_handshake_at, last_error FROM mcp_servers WHERE workspace_id = $1 ORDER BY created_at DESC`,
        [ws],
      );
    }

    case "tools": {
      const serverId = input.server_id as string | undefined;
      let sql = `SELECT t.id, t.name, t.description, t.enabled, t.mcp_server_id, s.name AS server_name FROM mcp_tools t JOIN mcp_servers s ON t.mcp_server_id = s.id WHERE s.workspace_id = $1 AND s.enabled = true`;
      const params: unknown[] = [ws];
      if (serverId) {
        sql += ` AND t.mcp_server_id = $2`;
        params.push(serverId);
      }
      return await query(sql, params);
    }

    case "add_server": {
      const name = input.name as string;
      const url = input.url as string;
      if (!name || !url) throw new Error("name and url required");
      const transport = (input.transport as string) || "http";
      const auth = input.auth ?? {};
      const enabled = input.enabled ?? true;

      const row = await queryOne<{ id: string }>(
        `INSERT INTO mcp_servers (workspace_id, name, url, transport, auth, enabled)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [ws, name, url, transport, JSON.stringify(auth), enabled],
      );
      return { id: row?.id, name, url };
    }

    case "call": {
      // Proxy a tool call to a connected MCP server
      const serverId = input.server_id as string;
      const tool = input.tool as string;
      const args = input.arguments ?? {};
      if (!serverId || !tool) throw new Error("server_id and tool required");

      const server = await queryOne<{ url: string; auth: { bearer?: string } }>(
        `SELECT url, auth FROM mcp_servers WHERE id = $1 AND workspace_id = $2 AND enabled = true`,
        [serverId, ws],
      );
      if (!server) throw new Error("server not found or disabled");

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (server.auth?.bearer) headers["Authorization"] = `Bearer ${server.auth.bearer}`;

      const res = await fetch(server.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: "tools/call",
          params: { name: tool, arguments: args },
        }),
      });
      const data = await res.json();
      return data;
    }

    default:
      throw new Error(`unknown mcp action: ${action}`);
  }
}