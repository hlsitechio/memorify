// routes/v1.ts — Agent gateway: POST /v1 {agent, action, input}
// Auth: Bearer <agent-token> (mem_live_...)
//
// This is the core HTTP gateway that external agents (Hermes, Claude Code, etc.)
// call to interact with Memorify. It dispatches to action handlers.

import { json } from "../lib/cors.ts";
import { verifyAgentToken, type AgentTokenPayload } from "../lib/agent-token.ts";
import { assertAgentAccess } from "../lib/agent-access.ts";
import { query, queryOne, execute } from "../lib/db.ts";
import { processDocumentForRag, searchDocuments } from "../lib/rag.ts";
import { logger } from "../lib/logger.ts";

type GatewayRequest = {
  agent: string;
  action: string;
  input?: Record<string, unknown>;
};

type AgentContext = AgentTokenPayload & {
  workspace_id: string;
  agent_id: string;
  access_level: NonNullable<AgentTokenPayload["access_level"]>;
  user_id?: string;
};

export async function handleV1(req: Request): Promise<Response> {
  const requestId = logger.generateRequestId();
  const startTime = performance.now();
  
  // Extract client info early
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";
  
  // Base logger with request correlation
  const baseLog = logger.child({ request_id: requestId, ip, user_agent: ua });
  
  if (req.method === "GET") {
    baseLog.debug("Gateway GET /v1 manifest");
    return json({
      name: "memorify-gateway",
      version: "0.1.1",
      protocol: { agent: "string", action: "string", input: "object" },
      access_levels: ["read", "write", "both", "full"],
      agents: {
        memory: ["remember", "recall", "list", "update", "delete"],
        gateway: ["ping", "manifest"],
        skills: ["list", "get", "run"],
        events: ["log", "list"],
        mcp: ["servers", "tools", "call", "sync", "add_server"],
        agents: ["list", "new", "rename", "bootstrap"],
        documents: ["list", "view", "add_from_url", "delete", "search", "vector_search"],
      },
      auth: "Bearer <mem_live_...>",
    });
  }

  if (req.method !== "POST") {
    baseLog.warn("Gateway method not allowed", { method: req.method });
    return json({ error: "method not allowed" }, 405);
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const rawToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : req.headers.get("x-agent-token") ?? "";
    
  if (!rawToken) {
    baseLog.warn("Gateway unauthorized: missing token");
    return json({ error: "unauthorized: missing token" }, 401);
  }

  const agentPayload = await verifyAgentToken(rawToken);
  if (!agentPayload) {
    baseLog.warn("Gateway unauthorized: invalid or revoked token");
    // Log auth failure to security_logs
    await logger.flush(); // Ensure buffer flush
    return json({ error: "unauthorized: invalid or revoked token" }, 401);
  }

  let body: GatewayRequest;
  try {
    body = await req.json();
  } catch {
    baseLog.warn("Gateway invalid JSON");
    return json({ error: "invalid json" }, 400);
  }

  const { agent: agentName, action, input = {} } = body;
  if (!agentName || !action) {
    baseLog.warn("Gateway missing agent or action", { agent: agentName, action });
    return json({ error: "missing 'agent' or 'action'" }, 400);
  }

  const ctx: AgentContext = {
    ...agentPayload,
    workspace_id: agentPayload.workspace_id,
    agent_id: agentPayload.agent_id,
    access_level: agentPayload.access_level ?? "full",
  };

  // Create request-scoped logger with agent/workspace context
  const log = baseLog.child({
    workspace_id: ctx.workspace_id,
    agent_id: ctx.agent_id,
    user_id: ctx.user_id,
  });

  // Fetch agent role from database for scope enforcement
  try {
    const agentRow = await queryOne<{ role: string }>(
      `SELECT role FROM agents WHERE id = $1 AND workspace_id = $2`,
      [ctx.agent_id, ctx.workspace_id],
    );
    (ctx as any).role = agentRow?.role || "full";
  } catch {
    (ctx as any).role = "full";
  }

  // SECURITY: enforce access_level before any handler runs
  try {
    assertAgentAccess(ctx.access_level, agentName, action, {
      agent_id: ctx.agent_id,
      workspace_id: ctx.workspace_id,
    });
  } catch (e) {
    const duration = Math.round(performance.now() - startTime);
    const err = e as Error & { status?: number; code?: string };
    log.error("Gateway access denied", {
      action: `${agentName}.${action}`,
      duration_ms: duration,
      status: "error",
      error_code: err.code ?? "agent_access_denied",
      error_message: err.message,
      access_level: ctx.access_level,
    });
    return json(
      {
        ok: false,
        error: err.message,
        code: err.code ?? "agent_access_denied",
        access_level: ctx.access_level,
        action: `${agentName}.${action}`,
        agent_id: ctx.agent_id,
        workspace_id: ctx.workspace_id,
      },
      err.status ?? 403,
    );
  }

  // Rate limiting check (100 requests/minute per agent)
  const rateLimitKey = `ratelimit:${ctx.workspace_id}:${ctx.agent_id}`;
  const recentCalls = await queryOne<{ count: number }>(`
    SELECT count(*) FROM agent_calls 
    WHERE workspace_id = $1 AND agent_id = $2 
    AND created_at > now() - interval '1 minute'
  `, [ctx.workspace_id, ctx.agent_id]);

  if ((recentCalls?.count ?? 0) > 100) {
    const duration = Math.round(performance.now() - startTime);
    log.warn("Gateway rate limit exceeded", {
      action: `${agentName}.${action}`,
      duration_ms: duration,
      status: "error",
      error_code: "rate_limit_exceeded",
      error_message: "Rate limit exceeded: max 100 requests per minute",
    });
    await execute(`
      INSERT INTO security_logs (workspace_id, event_type, payload, severity)
      VALUES ($1, 'rate_limit_exceeded', $2, 'warning')
    `, [ctx.workspace_id, JSON.stringify({ 
      agent_id: ctx.agent_id, 
      calls_per_minute: recentCalls?.count ?? 0 
    })]).catch(() => {});
    return json({ error: "rate limit exceeded" }, 429);
  }

  try {
    const result = await dispatch(agentName, action, input, ctx);
    const duration = Math.round(performance.now() - startTime);
    
    log.info("Gateway request completed", {
      action: `${agentName}.${action}`,
      duration_ms: duration,
      status: "ok",
    });
    
    return json({
      ok: true,
      action: `${agentName}.${action}`,
      result,
      agent: {
        id: ctx.agent_id,
        name: ctx.name,
        access_level: ctx.access_level,
      },
    });
  } catch (e) {
    const duration = Math.round(performance.now() - startTime);
    const err = e as Error;
    
    log.error("Gateway request failed", {
      action: `${agentName}.${action}`,
      duration_ms: duration,
      status: "error",
      error_code: (err as any).code ?? "internal_error",
      error_message: err.message,
    });
    
    return json({ ok: false, error: err.message });
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

  // Config
  if (agent === "config") return handleConfig(action, input, ctx);

  // Audit
  if (agent === "audit") return handleAudit(action, input, ctx);

  // Stripe
  if (agent === "stripe") return handleStripe(action, input, ctx);

  throw new Error(`unknown agent: ${agent}`);
}

// ── Memory actions ───────────────────────────────────────────
async function handleMemory(action: string, input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
  const ws = ctx.workspace_id;
  const ns = (input.namespace as string) || `agent:${ctx.agent_id}`;
  const agentRole = (ctx as any).role || "full"; // full | read | write | vault
  const scope = (input.scope as string) || "shared"; // private | shared | vault

  // Enforce role-based access
  // - read: can only read shared + own private
  // - write: can write to shared + own private, cannot read others' private
  // - full: can read/write everything including vault
  // - vault: can only access vault scope
  function canRead(memScope: string, memAgentId: string): boolean {
    if (agentRole === "full") return true;
    if (agentRole === "vault") return memScope === "vault";
    if (memScope === "vault") return agentRole === "full";
    if (memScope === "private") return memAgentId === ctx.agent_id;
    return true; // shared
  }
  function canWrite(writeScope: string): boolean {
    if (agentRole === "read") return false;
    if (agentRole === "vault") return writeScope === "vault";
    if (writeScope === "vault") return agentRole === "full";
    if (writeScope === "private") return true; // agents can write to own private
    return true; // shared
  }

  switch (action) {
    case "remember": {
      const content = input.content as string;
      if (!content) throw new Error("content required");
      const category = (input.category as string) || "general";
      const tags = (input.tags as string[]) ?? [];
      const metadata = input.metadata ?? {};
      const writeScope = scope;

      if (!canWrite(writeScope)) {
        throw new Error(`Agent role '${agentRole}' cannot write to scope '${writeScope}'`);
      }

      // For private scope, force namespace to agent's own
      const effectiveNs = writeScope === "private" ? `private:${ctx.agent_id}` : ns;
      // For vault scope, use vault namespace
      const finalNs = writeScope === "vault" ? "vault" : effectiveNs;

      const row = await queryOne<{ id: string }>(
        `INSERT INTO memories (workspace_id, namespace, content, category, tags, metadata, scope)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [ws, finalNs, content, category, tags, JSON.stringify(metadata), writeScope],
      );

      // Audit log
      await logAudit(ws, ctx.agent_id, "memory.create", row?.id ?? "", {
        category,
        scope: writeScope,
        content_length: content.length,
      });

      // Log event
      execute(
        `INSERT INTO events (workspace_id, agent_id, kind, source, payload)
         VALUES ($1, $2, 'memory.remember', $3, $4)`,
        [ws, ctx.agent_id, finalNs, JSON.stringify({ memory_id: row?.id, scope: writeScope })],
      ).catch(() => {});

      // Log access
      execute(
        `INSERT INTO memory_access_log (workspace_id, agent_id, memory_id, action, scope)
         VALUES ($1, $2, $3, 'write', $4)`,
        [ws, ctx.agent_id, row?.id, writeScope],
      ).catch(() => {});

      return { id: row?.id, content, category, tags, namespace: finalNs, scope: writeScope };
    }

    case "recall": {
      const query_text = (input.query as string) ?? "";
      const limit = Math.min(Math.max(Number(input.limit ?? 20), 1), 200);
      const recallScope = (input.scope as string) || "all"; // agent | shared | all | vault | private

      // Build scope filter based on agent role
      let scopeFilter: string;
      let params: unknown[] = [];

      if (agentRole === "vault") {
        // Vault-only agent: can only see vault scope
        scopeFilter = `scope = 'vault'`;
        params = [ws];
      } else if (recallScope === "vault" && agentRole === "full") {
        scopeFilter = `scope = 'vault'`;
        params = [ws];
      } else if (recallScope === "private") {
        // Only own private memories
        scopeFilter = `scope = 'private' AND namespace = $2`;
        params = [ws, `private:${ctx.agent_id}`];
      } else if (recallScope === "shared") {
        scopeFilter = `scope = 'shared'`;
        params = [ws];
      } else if (recallScope === "agent") {
        // Own namespace (backward compat)
        scopeFilter = `namespace = $2 AND scope != 'vault'`;
        params = [ws, ns];
      } else {
        // "all" — agent sees shared + own private (not others' private, not vault unless full)
        if (agentRole === "full") {
          scopeFilter = `(scope = 'shared' OR scope = 'private' OR scope = 'vault')`;
        } else {
          scopeFilter = `(scope = 'shared' OR (scope = 'private' AND namespace = $2))`;
          params = [ws, `private:${ctx.agent_id}`];
        }
        if (params.length === 1) params = [ws]; // all scope, no namespace param
      }

      let sql = `SELECT id, content, category, tags, namespace, scope, updated_at FROM memories
        WHERE workspace_id = $1 AND ${scopeFilter} AND archived = false`;
      if (query_text) {
        sql += ` AND content ILIKE '%' || $${params.length + 1} || '%'`;
        params.push(query_text);
      }
      sql += ` ORDER BY updated_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const results = await query(sql, params);

      // Log event (activity feed)
      execute(
        `INSERT INTO events (workspace_id, agent_id, kind, source, payload)
         VALUES ($1, $2, 'memory.recall', $3, $4)`,
        [ws, ctx.agent_id, ns, JSON.stringify({ query: query_text, scope: recallScope, count: results.length })],
      ).catch(() => {});

      // Log access
      execute(
        `INSERT INTO memory_access_log (workspace_id, agent_id, action, scope)
         VALUES ($1, $2, 'read', $3)`,
        [ws, ctx.agent_id, recallScope],
      ).catch(() => {});

      return results;
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

      // Audit log
      await logAudit(ws, ctx.agent_id, "memory.update", id, {
        content_changed: !!content,
      });

      // Log event (activity feed)
      execute(
        `INSERT INTO events (workspace_id, agent_id, kind, source, payload)
         VALUES ($1, $2, 'memory.update', $3, $4)`,
        [ws, ctx.agent_id, id, JSON.stringify({ memory_id: id, content_changed: !!content })],
      ).catch(() => {});

      return { id, updated: true };
    }

    case "delete": {
      const id = input.id as string;
      if (!id) throw new Error("id required");
      const count = await execute(
        `DELETE FROM memories WHERE id = $1 AND workspace_id = $2`,
        [id, ws],
      );

      // Audit log
      await logAudit(ws, ctx.agent_id, "memory.delete", id, {});

      // Log event (activity feed)
      execute(
        `INSERT INTO events (workspace_id, agent_id, kind, source, payload)
         VALUES ($1, $2, 'memory.delete', $3, $4)`,
        [ws, ctx.agent_id, id, JSON.stringify({ memory_id: id })],
      ).catch(() => {});

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

      // Audit log
      await logAudit(ws, ctx.agent_id, "skill.run", skill.id, { model: skill.model });

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

      // Audit log
      await logAudit(ws, ctx.agent_id, "document.create", row?.id ?? "", { source_url: url, size });

      // RAG pipeline: chunk → embed → store
      const ragResult = await processDocumentForRag(row?.id ?? "", ws, "text", "text/plain", name, content, null);

      return { id: row?.id, name, size, source_url: url, rag: ragResult };
    }

    case "delete": {
      const id = input.id as string;
      if (!id) throw new Error("id required");
      const count = await execute(
        `DELETE FROM documents WHERE id = $1 AND workspace_id = $2`,
        [id, ws],
      );

      // Audit log
      await logAudit(ws, ctx.agent_id, "document.delete", id, {});

      return { id, deleted: count > 0 };
    }

    case "search": {
      const query_text = (input.query as string) ?? (input.q as string) ?? "";
      const limit = Math.min(Math.max(Number(input.limit ?? 10), 1), 50);
      const threshold = Number(input.threshold ?? 0.5);
      if (!query_text) throw new Error("query required");
      return await searchDocuments(ws, query_text, limit, threshold);
    }

    case "vector_search": {
      const query_text = (input.query as string) ?? "";
      const limit = Math.min(Math.max(Number(input.limit ?? 10), 1), 50);
      const scope = (input.scope as string) || "all"; // memories | documents | all
      const threshold = Number(input.threshold ?? 0.7);

      if (!query_text) throw new Error("query required");

      // Generate embedding for the query
      const embedding = await generateEmbedding(query_text);
      if (!embedding) throw new Error("Failed to generate embedding");

      const results: Array<{
        id: string;
        type: "memory" | "document";
        content: string;
        similarity: number;
        metadata: Record<string, unknown>;
      }> = [];

      // Search memories (full-text + semantic)
      if (scope === "memories" || scope === "all") {
        // First try full-text search
        const memFullText = await query<{
          id: string;
          content: string;
          category: string;
          tags: string[];
          namespace: string;
        }>(
          `SELECT id, content, category, tags, namespace
           FROM memories
           WHERE workspace_id = $1
             AND archived = false
             AND search_vec @@ plainto_tsquery('english', $2)
           ORDER BY ts_rank_cd(search_vec, plainto_tsquery('english', $2)) DESC
           LIMIT $3`,
          [ws, query_text, limit],
        );

        for (const m of memFullText) {
          results.push({
            id: m.id,
            type: "memory",
            content: m.content,
            similarity: 0.9, // Full-text match gets high score
            metadata: { category: m.category, tags: m.tags, namespace: m.namespace },
          });
        }

        // Then semantic search on memories (if we add embeddings to memories later)
        // For now, memories don't have embeddings - only documents do
      }

      // Search documents (semantic via pgvector HNSW + full-text)
      if (scope === "documents" || scope === "all") {
        // Semantic search using pgvector cosine similarity
        const docSemantic = await query<{
          id: string;
          doc_id: string;
          chunk_index: number;
          text: string;
          similarity: number;
        }>(
          `SELECT dc.id, dc.doc_id, dc.chunk_index, dc.text,
                  1 - (dc.embedding <=> $1::vector) AS similarity
           FROM document_chunks dc
           JOIN documents d ON dc.doc_id = d.id
           WHERE dc.workspace_id = $2
             AND d.workspace_id = $2
             AND dc.embedding IS NOT NULL
             AND 1 - (dc.embedding <=> $1::vector) > $3
           ORDER BY dc.embedding <=> $1::vector
           LIMIT $4`,
          [JSON.stringify(embedding), ws, threshold, limit],
        );

        for (const c of docSemantic) {
          results.push({
            id: c.id,
            type: "document",
            content: c.text,
            similarity: c.similarity,
            metadata: { doc_id: c.doc_id, chunk_index: c.chunk_index },
          });
        }

        // Full-text search on documents
        const docFullText = await query<{
          id: string;
          content: string;
          name: string;
        }>(
          `SELECT id, content, name
           FROM documents
           WHERE workspace_id = $1
             AND search_vec @@ plainto_tsquery('english', $2)
           ORDER BY ts_rank_cd(search_vec, plainto_tsquery('english', $2)) DESC
           LIMIT $3`,
          [ws, query_text, limit],
        );

        for (const d of docFullText) {
          // Avoid duplicates from semantic search
          if (!results.some(r => r.id === d.id && r.type === "document")) {
            results.push({
              id: d.id,
              type: "document",
              content: d.content ?? "",
              similarity: 0.85, // Full-text match
              metadata: { name: d.name },
            });
          }
        }
      }

      // Sort by similarity descending and limit
      results.sort((a, b) => b.similarity - a.similarity);
      return results.slice(0, limit);
    }

    default:
      throw new Error(`unknown documents action: ${action}`);
  }
}

// ── Embedding generation helper ──────────────────────────────
async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiUrl = Deno.env.get("EMBEDDING_API_URL");
  const apiKey = Deno.env.get("EMBEDDING_API_KEY");

  if (!apiUrl || !apiKey) {
    console.warn("EMBEDDING_API_URL or EMBEDDING_API_KEY not set - using random vector for testing");
    // Fallback: random vector for testing (will not work for real semantic search)
    return Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
  }

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: text,
        model: "text-embedding-3-small", // 1536 dimensions
      }),
    });

    if (!res.ok) {
      console.error("Embedding API error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    return data.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.error("Embedding generation failed:", e);
    return null;
  }
}

// ── Agents actions ───────────────────────────────────────────
async function handleAgents(action: string, input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
  const ws = ctx.workspace_id;

  switch (action) {
    case "list": {
      return await query(
        `SELECT id, name, kind, status, access_level, last_seen_at, created_at
         FROM agents WHERE workspace_id = $1 ORDER BY created_at DESC`,
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

      // Audit log
      await logAudit(ws, ctx.agent_id, "agent.bootstrap", ctx.agent_id, {});

      return {
        agent: {
          id: ctx.agent_id,
          name: ctx.name,
          kind: ctx.kind,
          access_level: ctx.access_level,
        },
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

      // Audit log
      await logAudit(ws, ctx.agent_id, "agent.rename", ctx.agent_id, { new_name: name });

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
      const auth_type = (input.auth_type as string) || "none";
      const auth_config = (input.auth_config as Record<string, unknown>) ?? {};
      const enabled = input.enabled ?? true;

      const row = await queryOne<{ id: string }>(
        `INSERT INTO mcp_servers (workspace_id, name, url, transport, auth_type, auth_config, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [ws, name, url, transport, auth_type, JSON.stringify(auth_config), enabled],
      );
      
      // Audit log
      await logAudit(ws, ctx.agent_id, "mcp_server.add", row?.id ?? "", { name, url, auth_type });
      
      return { id: row?.id, name, url };
    }

    case "call": {
      // Proxy a tool call to a connected MCP server
      const serverId = input.server_id as string;
      const tool = input.tool as string;
      const args = input.arguments ?? {};
      if (!serverId || !tool) throw new Error("server_id and tool required");

      const server = await queryOne<{ url: string; auth_type: string; auth_config: Record<string, unknown> }>(
        `SELECT url, auth_type, auth_config FROM mcp_servers WHERE id = $1 AND workspace_id = $2 AND enabled = true`,
        [serverId, ws],
      );
      if (!server) throw new Error("server not found or disabled");

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (server.auth_type === "bearer" && server.auth_config?.bearer_token) {
        headers["Authorization"] = `Bearer ${server.auth_config.bearer_token}`;
      } else if (server.auth_type === "api_key" && server.auth_config?.api_key) {
        headers["X-API-Key"] = String(server.auth_config.api_key);
      } else if (server.auth_config?.headers) {
        Object.entries(server.auth_config.headers as Record<string, string>).forEach(([k, v]) => {
          headers[k] = v;
        });
      }

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

      // Audit log
      await logAudit(ws, ctx.agent_id, "mcp.tool_call", serverId, { tool, args_keys: Object.keys(args) });

      return data;
    }

    case "remove_server": {
      const id = input.id as string;
      if (!id) throw new Error("id required");
      
      // Get server info for audit log
      const server = await queryOne<{ id: string; name: string }>(
        `SELECT id, name FROM mcp_servers WHERE id = $1 AND workspace_id = $2`,
        [id, ws],
      );
      if (!server) throw new Error("server not found");
      
      const count = await execute(
        `DELETE FROM mcp_servers WHERE id = $1 AND workspace_id = $2`,
        [id, ws],
      );
      
      // Audit log
      await logAudit(ws, ctx.agent_id, "mcp_server.remove", server.id, { name: server.name });
      
      return { id, deleted: count > 0 };
    }

    default:
      throw new Error(`unknown mcp action: ${action}`);
  }
}

// ── Config actions ────────────────────────────────────────────
async function handleConfig(action: string, input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
  const ws = ctx.workspace_id;

  switch (action) {
    case "get": {
      const key = input.key as string;
      if (!key) throw new Error("key required");
      
      const row = await queryOne<{ value: unknown }>(
        `SELECT value FROM config WHERE workspace_id = $1 AND key = $2`,
        [ws, key],
      );
      return { key, value: row?.value ?? null };
    }

    case "set": {
      const key = input.key as string;
      const value = input.value ?? {};
      const description = (input.description as string) || "";
      if (!key) throw new Error("key required");
      
      // Get old value for audit
      const old = await queryOne<{ value: unknown }>(
        `SELECT value FROM config WHERE workspace_id = $1 AND key = $2`,
        [ws, key],
      );
      
      await execute(
        `INSERT INTO config (workspace_id, key, value, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (workspace_id, key) DO UPDATE SET
           value = EXCLUDED.value,
           description = EXCLUDED.description,
           updated_at = now()`,
        [ws, key, JSON.stringify(value), description],
      );
      
      // Audit log
      await logAudit(ws, ctx.agent_id, "config.set", key, { 
        old_value: old?.value ?? null, 
        new_value: value,
        description 
      });
      
      return { key, value, set: true };
    }

    case "delete": {
      const key = input.key as string;
      if (!key) throw new Error("key required");
      
      const old = await queryOne<{ value: unknown }>(
        `SELECT value FROM config WHERE workspace_id = $1 AND key = $2`,
        [ws, key],
      );
      
      const count = await execute(
        `DELETE FROM config WHERE workspace_id = $1 AND key = $2`,
        [ws, key],
      );
      
      // Audit log
      await logAudit(ws, ctx.agent_id, "config.delete", key, { 
        old_value: old?.value ?? null 
      });
      
      return { key, deleted: count > 0 };
    }

    case "list": {
      return await query(
        `SELECT key, value, description, created_at, updated_at FROM config WHERE workspace_id = $1 ORDER BY key`,
        [ws],
      );
    }

    default:
      throw new Error(`unknown config action: ${action}`);
  }
}

async function handleStripe(action: string, input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
  const ws = ctx.workspace_id;

  // Get Stripe secret key from vault or env
  const secretKey = await getStripeSecretKey(ws);
  if (!secretKey) throw new Error("Stripe secret key not configured");

  // Import Stripe dynamically from esm.sh (works in Netlify Edge Functions)
  const Stripe = (await import("https://esm.sh/stripe@17.0.0")).default;
  const stripe = new Stripe(secretKey, { apiVersion: "2024-12-18.acacia" });

  switch (action) {
    case "create_checkout_session": {
      const { price_id, success_url, cancel_url, mode = "subscription", customer_email } = input as {
        price_id: string;
        success_url: string;
        cancel_url: string;
        mode?: "payment" | "subscription";
        customer_email?: string;
      };

      if (!price_id || !success_url || !cancel_url) {
        throw new Error("price_id, success_url, and cancel_url required");
      }

      const sessionParams: any = {
        payment_method_types: ["card"],
        line_items: [{ price: price_id, quantity: 1 }],
        mode,
        success_url,
        cancel_url,
      };

      if (customer_email) sessionParams.customer_email = customer_email;

      const session = await stripe.checkout.sessions.create(sessionParams);
      return { session_id: session.id, url: session.url };
    }

    case "create_portal_session": {
      const { customer_id, return_url } = input as {
        customer_id: string;
        return_url: string;
      };

      if (!customer_id || !return_url) {
        throw new Error("customer_id and return_url required");
      }

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customer_id,
        return_url,
      });

      return { url: portalSession.url };
    }

    case "create_customer": {
      const { email, name, metadata } = input as {
        email: string;
        name?: string;
        metadata?: Record<string, string>;
      };

      if (!email) throw new Error("email required");

      const customer = await stripe.customers.create({ email, name, metadata });
      return { customer_id: customer.id, email: customer.email };
    }

    case "list_prices": {
      const { product_id, active = true, limit = 20 } = input as {
        product_id?: string;
        active?: boolean;
        limit?: number;
      };

      const prices = await stripe.prices.list({
        product: product_id,
        active,
        limit: Math.min(Math.max(Number(limit), 1), 100),
      });

      return prices.data.map((p: any) => ({
        id: p.id,
        product_id: p.product,
        unit_amount: p.unit_amount,
        currency: p.currency,
        recurring: p.recurring,
        active: p.active,
      }));
    }

    case "list_products": {
      const { active = true, limit = 20 } = input as {
        active?: boolean;
        limit?: number;
      };

      const products = await stripe.products.list({
        active,
        limit: Math.min(Math.max(Number(limit), 1), 100),
      });

      return products.data.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        active: p.active,
        metadata: p.metadata,
      }));
    }

    case "create_price": {
      const { product_id, unit_amount, currency = "usd", recurring, nickname } = input as {
        product_id: string;
        unit_amount: number;
        currency?: string;
        recurring?: { interval: "month" | "year"; interval_count?: number };
        nickname?: string;
      };

      if (!product_id || !unit_amount) throw new Error("product_id and unit_amount required");

      const price = await stripe.prices.create({
        product: product_id,
        unit_amount,
        currency,
        recurring,
        nickname,
      });

      return { id: price.id, unit_amount: price.unit_amount, currency: price.currency, recurring: price.recurring };
    }

    case "create_product": {
      const { name, description, metadata } = input as {
        name: string;
        description?: string;
        metadata?: Record<string, string>;
      };

      if (!name) throw new Error("name required");

      const product = await stripe.products.create({ name, description, metadata });
      return { id: product.id, name: product.name, description: product.description };
    }

    case "get_subscription": {
      const { subscription_id } = input as { subscription_id: string };
      if (!subscription_id) throw new Error("subscription_id required");

      const subscription = await stripe.subscriptions.retrieve(subscription_id);
      return {
        id: subscription.id,
        customer: subscription.customer,
        status: subscription.status,
        current_period_end: subscription.current_period_end,
        items: subscription.items.data.map((item: any) => ({
          price_id: item.price.id,
          quantity: item.quantity,
        })),
      };
    }

    case "cancel_subscription": {
      const { subscription_id, at_period_end = true } = input as {
        subscription_id: string;
        at_period_end?: boolean;
      };

      if (!subscription_id) throw new Error("subscription_id required");

      const subscription = await stripe.subscriptions.update(subscription_id, {
        cancel_at_period_end: at_period_end,
      });

      return { id: subscription.id, status: subscription.status, cancel_at_period_end: subscription.cancel_at_period_end };
    }

    default:
      throw new Error(`unknown stripe action: ${action}`);
  }
}

async function getStripeSecretKey(workspaceId: string): Promise<string | null> {
  // First check vault for STRIPE_SECRET_KEY
  try {
    const row = await queryOne<{ value_encrypted: Uint8Array }>(
      `SELECT value_encrypted FROM vault_secrets WHERE workspace_id = $1 AND name = 'STRIPE_SECRET_KEY'`,
      [workspaceId],
    );
    if (row?.value_encrypted) {
      // In a real implementation, decrypt the value
      // For now, we'll also check env
    }
  } catch {}

  // Fallback to environment variable
  return Deno.env.get("STRIPE_SECRET_KEY") ?? null;
}

// ── Audit actions ─────────────────────────────────────────────
async function handleAudit(action: string, input: Record<string, unknown>, ctx: AgentContext): Promise<unknown> {
  const ws = ctx.workspace_id;

  switch (action) {
    case "list": {
      const limit = Math.min(Math.max(Number(input.limit ?? 50), 1), 200);
      const action_filter = input.action as string | undefined;
      
      let sql = `SELECT id, workspace_id, agent_id, action, resource, metadata, created_at FROM audit_log WHERE workspace_id = $1`;
      const params: unknown[] = [ws];
      
      if (action_filter) {
        sql += ` AND action = $2`;
        params.push(action_filter);
      }
      
      sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);
      
      return await query(sql, params);
    }

    default:
      throw new Error(`unknown audit action: ${action}`);
  }
}

// ── Audit log helper ──────────────────────────────────────────
async function logAudit(
  workspaceId: string,
  agentId: string,
  action: string,
  resource: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await execute(
      `INSERT INTO audit_log (workspace_id, agent_id, action, resource, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [workspaceId, agentId, action, resource, JSON.stringify(metadata)],
    );
  } catch {
    // Fail silently - audit logging should never break the main operation
  }
}
