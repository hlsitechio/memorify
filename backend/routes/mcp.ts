// routes/mcp.ts — MCP JSON-RPC 2.0 over HTTP
// Auth: Bearer <mem_live_...> (agent token)
//
// Methods: initialize, ping, tools/list, tools/call
// Tool calls are dispatched to the v1 gateway actions.

import { json, corsHeaders } from "../lib/cors.ts";
import { verifyAgentToken } from "../lib/agent-token.ts";
import { handleV1 } from "./v1.ts";
import { createAgentToken, revokeAgentToken, listAgentTokens, type Scope } from "../lib/agent-token.ts";
import { query, queryOne } from "../lib/db.ts";
import { verifyClerkJwt } from "../lib/clerk.ts";

const ZAPIER_MCP_URL = "https://mcp.zapier.com/api/v1/connect";
const ZAPIER_OLD_MCP_URL = "https://mcp.zapier.com/api/mcp/mcp";

// ── MCP tool definitions ──────────────────────────────────────
type ToolDef = {
  name: string;
  description: string;
  action: string;        // maps to v1 {agent, action}
  agent: string;          // "memory" | "skills" | "events" | "documents" | "agents" | "mcp"
  inputSchema: Record<string, unknown>;
};

type DynamicTool = {
  alias: string;
  tool_name: string;
  description: string | null;
  input_schema: Record<string, unknown>;
  server_id: string;
  server_name: string;
};

const TOOLS: ToolDef[] = [
  {
    name: "whoami",
    description: "Return info about the connected agent + workspace.",
    action: "ping",
    agent: "gateway",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "memory_remember",
    description: "Save a memory for this workspace. Scope: shared (default), private (only this agent), vault (admin-only).",
    action: "remember",
    agent: "memory",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "What to remember" },
        category: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        scope: { type: "string", description: "shared | private | vault", enum: ["shared", "private", "vault"] },
      },
      required: ["content"],
    },
  },
  {
    name: "memory_recall",
    description: "Search memories by query string. Scope: all (default), shared, private, vault, agent.",
    action: "recall",
    agent: "memory",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
        scope: { type: "string", description: "all | shared | private | vault | agent", enum: ["all", "shared", "private", "vault", "agent"] },
      },
    },
  },
  {
    name: "memory_update",
    description: "Update an existing memory by id.",
    action: "update",
    agent: "memory",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, content: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "memory_delete",
    description: "Delete a memory by id.",
    action: "delete",
    agent: "memory",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "memory_list",
    description: "List recent memories.",
    action: "list",
    agent: "memory",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "documents_list",
    description: "List documents in the workspace.",
    action: "list",
    agent: "documents",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "documents_view",
    description: "Fetch a document's content.",
    action: "view",
    agent: "documents",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "documents_add_from_url",
    description: "Import a document from a URL. The text is extracted, chunked, and embedded for RAG search.",
    action: "add_from_url",
    agent: "documents",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" }, name: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "documents_search",
    description: "Semantic + full-text search across all documents in the workspace. Returns cited chunks with similarity scores — use this to find information in uploaded PDFs, notes, and files (RAG).",
    action: "search",
    agent: "documents",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language search query" },
        limit: { type: "number", description: "Max results (default 10, max 50)" },
        threshold: { type: "number", description: "Minimum similarity score 0-1 (default 0.5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "skills_list",
    description: "List skills in this workspace.",
    action: "list",
    agent: "skills",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "skills_get",
    description: "Get a skill's full definition by id or slug.",
    action: "get",
    agent: "skills",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, slug: { type: "string" } },
    },
  },
  {
    name: "skills_run",
    description: "Run a skill by id or slug. Returns the prompt + model for execution.",
    action: "run",
    agent: "skills",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        slug: { type: "string" },
        input: { description: "String or object passed as user message." },
        model: { type: "string" },
      },
      required: ["input"],
    },
  },
  {
    name: "events_log",
    description: "Log an event from the agent.",
    action: "log",
    agent: "events",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string" },
        message: { type: "string" },
        metadata: { type: "object" },
      },
      required: ["kind"],
    },
  },
  {
    name: "events_list",
    description: "List recent events.",
    action: "list",
    agent: "events",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "mcp_servers",
    description: "List connected MCP servers.",
    action: "servers",
    agent: "mcp",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "mcp_tools",
    description: "List tools across connected MCP servers.",
    action: "tools",
    agent: "mcp",
    inputSchema: { type: "object", properties: { server_id: { type: "string" } } },
  },
  {
    name: "mcp_call",
    description: "Call a tool on a connected MCP server (transparent proxy).",
    action: "call",
    agent: "mcp",
    inputSchema: {
      type: "object",
      properties: {
        server_id: { type: "string" },
        tool: { type: "string" },
        arguments: { type: "object" },
      },
      required: ["server_id", "tool"],
    },
  },
  {
    name: "vector_search",
    description: "Hybrid semantic + full-text search over memories and documents using pgvector HNSW.",
    action: "vector_search",
    agent: "documents",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query text" },
        limit: { type: "number", description: "Max results (default 10, max 50)" },
        scope: { type: "string", description: "memories | documents | all (default: all)" },
        threshold: { type: "number", description: "Cosine similarity threshold for semantic search (default: 0.7)" },
      },
      required: ["query"],
    },
  },
  {
    name: "agents_bootstrap",
    description: "Rehydrate a session: returns memories, skills, events for this agent.",
    action: "bootstrap",
    agent: "agents",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "agent_token_create",
    description: "Mint a new scoped agent token (Ed25519 JWT). Returns plaintext token once.",
    action: "token_create",
    agent: "agents",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Agent ID to associate token with" },
        scopes: {
          type: "array",
          items: { type: "string", enum: ["memory:read", "memory:write", "skills:read", "skills:write", "documents:read", "documents:write", "events:read", "events:write", "workspace:admin", "tokens:admin"] },
          description: "List of scopes to grant",
        },
        expires_in_seconds: { type: "number", description: "Token lifetime in seconds (0 = never expires, default: 86400)" },
      },
      required: ["agent_id", "scopes"],
    },
  },
  {
    name: "agent_token_revoke",
    description: "Revoke agent token(s) by jti or prefix.",
    action: "token_revoke",
    agent: "agents",
    inputSchema: {
      type: "object",
      properties: {
        jti: { type: "string", description: "Specific JWT ID to revoke" },
        prefix: { type: "string", description: "Revoke all tokens with jti starting with this prefix" },
      },
    },
  },
  {
    name: "agent_token_list",
    description: "List all agent tokens for the workspace.",
    action: "token_list",
    agent: "agents",
    inputSchema: { type: "object", properties: {} },
  },
];

// ── JSON-RPC helpers ──────────────────────────────────────────
function rpc(id: unknown, result?: unknown, error?: { code: number; message: string }): unknown {
  return error
    ? { jsonrpc: "2.0", id, error }
    : { jsonrpc: "2.0", id, result };
}

function textOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function slugToolName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 90) || "tool";
}

function remoteToolAlias(serverName: string, toolName: string): string {
  return `remote_${slugToolName(serverName)}_${slugToolName(toolName)}`.slice(0, 120);
}

async function listDynamicTools(workspaceId: string): Promise<DynamicTool[]> {
  const rows = await query<{
    name: string;
    description: string | null;
    input_schema: Record<string, unknown> | null;
    mcp_server_id: string;
    server_name: string;
  }>(
    `SELECT t.name, t.description, t.input_schema, t.mcp_server_id, s.name AS server_name
     FROM mcp_tools t
     JOIN mcp_servers s ON s.id = t.mcp_server_id
     WHERE s.workspace_id = $1 AND s.enabled = true AND t.enabled = true
     ORDER BY s.name ASC, t.name ASC`,
    [workspaceId],
  );
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const base = remoteToolAlias(row.server_name, row.name);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return {
      alias: n ? `${base}_${n + 1}` : base,
      tool_name: row.name,
      description: row.description,
      input_schema: objectOrEmpty(row.input_schema),
      server_id: row.mcp_server_id,
      server_name: row.server_name,
    };
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret =
    Deno.env.get("MEMORIFY_AGENT_TOKEN_SECRET") ||
    Deno.env.get("NEON_JWT_PRIVATE_KEY") ||
    "";
  if (!secret) throw new Error("server_secret_not_configured");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
}

async function decryptSecret(payload: unknown, workspaceId: string): Promise<string | null> {
  const value = objectOrEmpty(payload);
  if (value.alg !== "AES-GCM-256" || typeof value.iv !== "string" || typeof value.ciphertext !== "string") {
    return null;
  }
  const key = await encryptionKey();
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(value.iv),
      additionalData: new TextEncoder().encode(workspaceId),
    },
    key,
    base64ToBytes(value.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

async function remoteAuthHeaders(server: { auth_type: string; auth_config: Record<string, unknown> }, workspaceId: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  };
  const config = objectOrEmpty(server.auth_config);
  if (server.auth_type === "bearer" && config.bearer_token) {
    headers.Authorization = `Bearer ${String(config.bearer_token)}`;
  } else if (server.auth_type === "bearer" && config.bearer_token_encrypted) {
    const token = await decryptSecret(config.bearer_token_encrypted, workspaceId);
    if (token) headers.Authorization = `Bearer ${token}`;
  } else if (server.auth_type === "oauth") {
    const encrypted = config.access_token_encrypted ?? config.token_encrypted;
    const token = encrypted ? await decryptSecret(encrypted, workspaceId) : textOrEmpty(config.access_token);
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const customHeaders = objectOrEmpty(config.headers);
  for (const [key, value] of Object.entries(customHeaders)) {
    if (typeof value === "string") headers[key] = value;
  }
  return headers;
}

async function remoteMcpRequestUrl(url: string, authConfig: Record<string, unknown>, workspaceId: string): Promise<string> {
  let requestUrl = url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "mcp.zapier.com" && parsed.pathname === new URL(ZAPIER_OLD_MCP_URL).pathname) {
      requestUrl = ZAPIER_MCP_URL;
    }
  } catch {
    requestUrl = url;
  }
  const encrypted = authConfig.query_token_encrypted;
  if (!encrypted) return requestUrl;
  const token = await decryptSecret(encrypted, workspaceId);
  if (!token) return requestUrl;
  const parsed = new URL(requestUrl);
  parsed.searchParams.set("token", token);
  return parsed.toString();
}

async function readRemoteMcpJson(res: Response) {
  const text = await res.text();
  if (!text.trim()) return {};
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) return JSON.parse(text);

  const messages: unknown[] = [];
  let dataLines: string[] = [];
  const flush = () => {
    if (!dataLines.length) return;
    const data = dataLines.join("\n").trim();
    dataLines = [];
    if (!data || data === "[DONE]") return;
    try {
      messages.push(JSON.parse(data));
    } catch {
      messages.push(data);
    }
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  flush();
  return [...messages].reverse().find((message) => message && typeof message === "object") ?? {};
}

async function initializeRemoteMcpSession(url: string, headers: Record<string, string>): Promise<Record<string, string>> {
  const initRes = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "memorify-mcp-proxy", version: "0.1.0" },
      },
    }),
  }).catch(() => null);
  if (!initRes) return headers;

  const sessionId = initRes.headers.get("MCP-Session-Id") || initRes.headers.get("Mcp-Session-Id") || initRes.headers.get("mcp-session-id");
  await readRemoteMcpJson(initRes).catch(() => null);
  if (!sessionId) return headers;

  const sessionHeaders = { ...headers, "MCP-Session-Id": sessionId };
  await fetch(url, {
    method: "POST",
    headers: sessionHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }),
  }).catch(() => null);
  return sessionHeaders;
}

async function callDynamicTool(workspaceId: string, dynamicTool: DynamicTool, args: Record<string, unknown>) {
  const server = await queryOne<{ url: string; auth_type: string; auth_config: Record<string, unknown> }>(
    `SELECT url, auth_type, auth_config
     FROM mcp_servers
     WHERE id = $1 AND workspace_id = $2 AND enabled = true`,
    [dynamicTool.server_id, workspaceId],
  );
  if (!server) throw new Error("remote MCP server not found or disabled");

  let headers = await remoteAuthHeaders(server, workspaceId);
  const requestUrl = await remoteMcpRequestUrl(server.url, server.auth_config, workspaceId);
  headers = await initializeRemoteMcpSession(requestUrl, headers);
  const res = await fetch(requestUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name: dynamicTool.tool_name, arguments: args },
    }),
  });
  const data = await readRemoteMcpJson(res) as Record<string, unknown>;
  if (!res.ok || data.error) {
    const message = textOrEmpty(objectOrEmpty(data.error).message) || `remote MCP call failed: HTTP ${res.status}`;
    throw new Error(message);
  }
  return objectOrEmpty(data.result);
}

// ── Route handler ─────────────────────────────────────────────
export async function handleMcp(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // ── OAuth 2.0 endpoints (no auth required) ───────────────
  if (pathname === "/mcp/.well-known/oauth-protected-resource" || pathname === "/.well-known/oauth-protected-resource") {
    return handleProtectedResourceMetadata(req);
  }
  if (pathname === "/mcp/.well-known/oauth-authorization-server" || pathname === "/.well-known/oauth-authorization-server") {
    return handleAuthorizationServerMetadata(req);
  }
  if (pathname === "/mcp/oauth/authorize") {
    if (req.method === "POST") {
      return handleOAuthAuthorizePost(req);
    }
    return handleOAuthAuthorize(req);
  }
  if (pathname === "/mcp/oauth/token") {
    return handleOAuthToken(req);
  }
  if (pathname === "/mcp/oauth/register") {
    return handleOAuthRegister(req);
  }
  if (pathname === "/mcp/oauth/revoke") {
    return handleOAuthRevoke(req);
  }

  // GET → discovery
  if (req.method === "GET") {
    return json({
      name: "memorify-mcp",
      version: "0.1.0",
      protocol: "mcp/jsonrpc-2.0",
      transport: "streamable-http",
      docs: "POST JSON-RPC 2.0 with Authorization: Bearer ***",
      tools: TOOLS.map((t) => t.name),
    });
  }

  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  // ── Auth ──────────────────────────────────────────────────
  const auth = req.headers.get("authorization") ?? "";
  const rawToken = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!rawToken) {
    return new Response(
      JSON.stringify(rpc(null, undefined, { code: -32001, message: "missing bearer token (mem_live_... or Clerk JWT)" })),
      {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "WWW-Authenticate": 'Bearer resource_metadata="https://memorify.dev/.well-known/oauth-protected-resource", scope="mcp:read mcp:write"',
        },
      },
    );
  }

  // Try to verify as mem_live_ agent token first
  let agentPayload = await verifyAgentToken(rawToken);

  // If not a valid agent token, try to verify as Clerk JWT
  if (!agentPayload) {
    try {
      // Verify the Clerk JWT using the same logic as the agent-jwt endpoint
      // We need to import verifyClerkJwt
      const { verifyClerkJwt } = await import("../lib/clerk.ts");
      const clerkPayload = await verifyClerkJwt(rawToken);
      if (clerkPayload) {
        // Convert Clerk payload to agent-like payload for MCP handlers
        const now = Math.floor(Date.now() / 1000);
        agentPayload = {
          workspace_id: clerkPayload.org_id || clerkPayload.workspace_id,
          agent_id: clerkPayload.agent_id || clerkPayload.sub,
          access_level: "full", // Clerk JWT agents get full access
          scopes: ["memory:read", "memory:write", "documents:read", "documents:write", "events:read", "events:write", "skills:read", "skills:write"],
          exp: now + 3600, // 1 hour
          iat: now,
          jti: crypto.randomUUID(),
        };
      }
    } catch {
      // Not a valid Clerk JWT either
    }
  }

  if (!agentPayload) {
    return new Response(
      JSON.stringify(rpc(null, undefined, { code: -32001, message: "invalid or revoked token (must be mem_live_... or valid Clerk JWT)" })),
      {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "WWW-Authenticate": 'Bearer resource_metadata="https://memorify.dev/.well-known/oauth-protected-resource", error="invalid_token"',
        },
      },
    );
  }

  // ── Parse JSON-RPC ────────────────────────────────────────
  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify(rpc(null, undefined, { code: -32700, message: "parse error" })),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { id = null, method, params = {} } = body;
  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // ── initialize ──────────────────────────────────────────
    if (method === "initialize") {
      return new Response(JSON.stringify(rpc(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "memorify",
          version: "0.1.0",
          description: "Memorify MCP — memory, skills, documents, events, MCP proxy. Agent token required.",
        },
      })), { headers });
    }

    // ── ping ────────────────────────────────────────────────
    if (method === "ping") {
      return new Response(JSON.stringify(rpc(id, {})), { headers });
    }

    // ── tools/list ──────────────────────────────────────────
    if (method === "tools/list") {
      const dynamicTools = await listDynamicTools(agentPayload.workspace_id);
      return new Response(JSON.stringify(rpc(id, {
        tools: [
          ...TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
          ...dynamicTools.map((t) => ({
            name: t.alias,
            description: `[${t.server_name}] ${t.description || t.tool_name}`,
            inputSchema: t.input_schema,
          })),
        ],
      })), { headers });
    }

    // ── tools/call ──────────────────────────────────────────
    if (method === "tools/call") {
      const toolName = (params as Record<string, unknown>).name as string;
      const args = ((params as Record<string, unknown>).arguments ?? {}) as Record<string, unknown>;
      const def = TOOLS.find((t) => t.name === toolName);

      if (!def) {
        const dynamicTool = (await listDynamicTools(agentPayload.workspace_id)).find((t) => t.alias === toolName);
        if (!dynamicTool) {
          return new Response(JSON.stringify(rpc(id, undefined, {
            code: -32602,
            message: `unknown tool: ${toolName}`,
          })), { status: 400, headers });
        }
        try {
          const result = await callDynamicTool(agentPayload.workspace_id, dynamicTool, args);
          return new Response(JSON.stringify(rpc(id, {
            content: Array.isArray(result.content)
              ? result.content
              : [{ type: "text", text: JSON.stringify(result, null, 2) }],
          })), { headers });
        } catch (e) {
          return new Response(JSON.stringify(rpc(id, {
            isError: true,
            content: [{ type: "text", text: (e as Error).message }],
          })), { headers });
        }
      }

      // Handle token management tools directly (not via v1)
      if (toolName === "agent_token_create") {
        // Require tokens:admin scope
        if (!agentPayload.scopes.includes("tokens:admin")) {
          return new Response(JSON.stringify(rpc(id, {
            isError: true,
            content: [{ type: "text", text: "Insufficient scope: tokens:admin required" }],
          })), { headers });
        }

        const { agent_id, scopes, expires_in_seconds } = args as {
          agent_id: string;
          scopes: string[];
          expires_in_seconds?: number;
        };

        try {
          const result = await createAgentToken({
            workspace_id: agentPayload.workspace_id,
            agent_id,
            scopes: scopes as Scope[],
            expiresInSeconds: expires_in_seconds ?? 86_400,
          });
          return new Response(JSON.stringify(rpc(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          })), { headers });
        } catch (e) {
          return new Response(JSON.stringify(rpc(id, {
            isError: true,
            content: [{ type: "text", text: (e as Error).message }],
          })), { headers });
        }
      }

      if (toolName === "agent_token_revoke") {
        // Require tokens:admin scope
        if (!agentPayload.scopes.includes("tokens:admin")) {
          return new Response(JSON.stringify(rpc(id, {
            isError: true,
            content: [{ type: "text", text: "Insufficient scope: tokens:admin required" }],
          })), { headers });
        }

        const { jti, prefix } = args as { jti?: string; prefix?: string };

        try {
          const revoked = await revokeAgentToken({
            workspace_id: agentPayload.workspace_id,
            jti,
            prefix,
          });
          return new Response(JSON.stringify(rpc(id, {
            content: [{ type: "text", text: JSON.stringify({ revoked }, null, 2) }],
          })), { headers });
        } catch (e) {
          return new Response(JSON.stringify(rpc(id, {
            isError: true,
            content: [{ type: "text", text: (e as Error).message }],
          })), { headers });
        }
      }

      if (toolName === "agent_token_list") {
        // Require tokens:admin or workspace:admin scope
        if (!agentPayload.scopes.includes("tokens:admin") && !agentPayload.scopes.includes("workspace:admin")) {
          return new Response(JSON.stringify(rpc(id, {
            isError: true,
            content: [{ type: "text", text: "Insufficient scope: tokens:admin or workspace:admin required" }],
          })), { headers });
        }

        try {
          const tokens = await listAgentTokens(agentPayload.workspace_id);
          return new Response(JSON.stringify(rpc(id, {
            content: [{ type: "text", text: JSON.stringify(tokens, null, 2) }],
          })), { headers });
        } catch (e) {
          return new Response(JSON.stringify(rpc(id, {
            isError: true,
            content: [{ type: "text", text: (e as Error).message }],
          })), { headers });
        }
      }

      // Dispatch directly to the v1 handler (no HTTP roundtrip)
            const v1Req = new Request("https://memorify.dev/v1", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${rawToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                agent: def.agent,
                action: def.action,
                input: args,
              }),
            });
      const v1Res = await handleV1(v1Req);
      const v1Data = await v1Res.json();

      if (!v1Data?.ok) {
        return new Response(JSON.stringify(rpc(id, {
          isError: true,
          content: [{ type: "text", text: v1Data?.error ?? "tool call failed" }],
        })), { headers });
      }

      return new Response(JSON.stringify(rpc(id, {
        content: [{ type: "text", text: JSON.stringify(v1Data.result, null, 2) }],
      })), { headers });
    }

    // ── notifications (no id) → 204 ─────────────────────────
    if (id === null || id === undefined) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    return new Response(JSON.stringify(rpc(id, undefined, {
          code: -32601,
          message: `method not found: ${method}`,
        })), { status: 400, headers });
      } catch (e) {
        return new Response(JSON.stringify(rpc(id, undefined, {
          code: -32000,
          message: (e as Error).message,
        })), { status: 500, headers });
      }
    }

    // ── OAuth 2.1 Handlers ────────────────────────────────────────

    async function handleProtectedResourceMetadata(req: Request): Promise<Response> {
      const baseUrl = new URL(req.url).origin;
      return json({
        resource: `${baseUrl}/mcp`,
        authorization_servers: [`${baseUrl}/mcp`],
        scopes_supported: ["mcp:read", "mcp:write"],
        bearer_methods_supported: ["header"],
      });
    }

    async function handleAuthorizationServerMetadata(req: Request): Promise<Response> {
      const baseUrl = new URL(req.url).origin;
      return json({
        issuer: `${baseUrl}/mcp`,
        authorization_endpoint: `${baseUrl}/mcp/oauth/authorize`,
        token_endpoint: `${baseUrl}/mcp/oauth/token`,
        revocation_endpoint: `${baseUrl}/mcp/oauth/revoke`,
        registration_endpoint: `${baseUrl}/mcp/oauth/register`,
        scopes_supported: ["mcp:read", "mcp:write"],
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
        service_documentation: "https://memorify.dev/docs/mcp",
      });
    }

    // ── Dynamic Client Registration (RFC 7591) ───────────────────
    // Gemini calls this to register itself as an OAuth client
    async function handleOAuthRegister(req: Request): Promise<Response> {
      if (req.method !== "POST") {
        return json({ error: "method_not_allowed" }, 405);
      }

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return json({ error: "invalid_request", error_description: "Invalid JSON body" }, 400);
      }

      const clientName = textOrEmpty(body.client_name) || "unnamed-client";
      const redirectUris = Array.isArray(body.redirect_uris)
        ? (body.redirect_uris as string[]).filter((u) => typeof u === "string")
        : [];
      const scopes = textOrEmpty(body.scope) ? textOrEmpty(body.scope).split(" ") : ["mcp:read", "mcp:write"];

      if (redirectUris.length === 0) {
        return json({ error: "invalid_redirect_uri", error_description: "At least one redirect_uri required" }, 400);
      }

      // Generate client credentials
      const clientId = `mem_client_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const clientSecret = `mem_secret_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;

      // Hash the secret before storing (SHA-256 for Edge compatibility)
      const secretHash = await sha256Hex(clientSecret);

      // Find or create a default workspace for OAuth clients
      // Use a fixed workspace_id for OAuth-registered clients
      const workspaceId = "oauth_public";

      await query(
        `INSERT INTO mcp_oauth_clients (workspace_id, client_id, client_secret, name, redirect_uris, scopes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [workspaceId, clientId, secretHash, clientName, redirectUris, scopes],
      );

      return json({
        client_id: clientId,
        client_secret: clientSecret,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_secret_expires_at: 0, // never expires
        redirect_uris: redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "client_secret_post",
        scope: scopes.join(" "),
      }, 201);
    }

    // ── Authorization Endpoint ───────────────────────────────────
    // Gemini redirects user here → we serve an HTML page that loads Clerk JS,
    // gets the session JWT, then generates an auth code and redirects back.
    async function handleOAuthAuthorize(req: Request): Promise<Response> {
      const url = new URL(req.url);
      const clientId = url.searchParams.get("client_id") || "";
      const redirectUri = url.searchParams.get("redirect_uri") || "";
      const responseType = url.searchParams.get("response_type") || "";
      const state = url.searchParams.get("state") || "";
      const scope = url.searchParams.get("scope") || "mcp:read mcp:write";
      const codeChallenge = url.searchParams.get("code_challenge") || "";
      const codeChallengeMethod = url.searchParams.get("code_challenge_method") || "";

      // Validate required params
      if (!clientId || !redirectUri || responseType !== "code") {
        return json({ error: "invalid_request", error_description: "Missing client_id, redirect_uri, or response_type != code" }, 400);
      }

      // Look up the client
      const client = await queryOne<{ id: string; name: string; redirect_uris: string[]; workspace_id: string }>(
        `SELECT id, name, redirect_uris, workspace_id FROM mcp_oauth_clients WHERE client_id = $1`,
        [clientId],
      );
      if (!client) {
        return json({ error: "invalid_client", error_description: "Unknown client_id" }, 400);
      }

      // Validate redirect_uri
      if (!client.redirect_uris.includes(redirectUri)) {
        return json({ error: "invalid_redirect_uri", error_description: "redirect_uri not registered" }, 400);
      }

      // Serve an HTML page that:
      // 1. Loads Clerk JS from clerk.memorify.dev
      // 2. Gets the session JWT
      // 3. POSTs it back to this same endpoint with all the OAuth params
      // 4. The POST handler generates the auth code and redirects back
      const html = `<!DOCTYPE html>
<html>
<head><title>Memorify — Authorize</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { background: #0a0a0b; color: #fafafa; font-family: -apple-system, system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
  .card { background: #131316; border: 1px solid #27272a; border-radius: 12px; padding: 32px; max-width: 420px; width: 90%; text-align: center; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { color: #a1a1aa; font-size: 14px; margin: 0 0 24px; }
  .spinner { width: 32px; height: 32px; border: 3px solid #27272a; border-top-color: #2dd4bf; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  button { background: #2dd4bf; color: #0a0a0b; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; }
  button:hover { background: #14b8a6; }
  .error { color: #ef4444; font-size: 13px; margin-top: 12px; }
  a { color: #2dd4bf; text-decoration: none; }
</style>
</head>
<body>
<div class="card">
  <h1>Authorizing ${client.name}</h1>
  <p>Connecting to Memorify memory, tools, and documents.</p>
  <div id="loading">
    <div class="spinner"></div>
    <p style="font-size: 13px;">Checking your session...</p>
  </div>
  <div id="signin" style="display:none">
    <p>You need to sign in to Memorify first.</p>
    <a href="https://memorify.dev/auth?redirect_url=${encodeURIComponent(url.toString())}"><button>Sign in to Memorify</button></a>
  </div>
  <div id="error" style="display:none"></div>
</div>
<script>
  // Load Clerk browser SDK from the Clerk Frontend API (first-party context)
  const clerkScript = document.createElement("script");
  clerkScript.src = "https://clerk.memorify.dev/npm/@clerk/clerk-js@4/dist/clerk.browser.js";
  clerkScript.setAttribute("data-clerk-publishable-key", "pk_live_Y2xlcmsubWVtb3JpZnkuZGV2JA");
  clerkScript.async = true;
  document.head.appendChild(clerkScript);

  clerkScript.onload = async () => {
    try {
      // Wait for Clerk to load
      await window.Clerk.load();
      if (!window.Clerk.session) {
        document.getElementById("loading").style.display = "none";
        document.getElementById("signin").style.display = "block";
        return;
      }
      // Get a fresh JWT
      const jwt = await window.Clerk.session.getToken();
      if (!jwt) {
        document.getElementById("loading").style.display = "none";
        document.getElementById("signin").style.display = "block";
        return;
      }
      // POST the JWT back to generate auth code
      const params = new URLSearchParams(window.location.search);
      const body = new URLSearchParams();
      body.set("clerk_jwt", jwt);
      body.set("client_id", params.get("client_id") || "");
      body.set("redirect_uri", params.get("redirect_uri") || "");
      body.set("response_type", params.get("response_type") || "");
      body.set("state", params.get("state") || "");
      body.set("scope", params.get("scope") || "mcp:read mcp:write");
      body.set("code_challenge", params.get("code_challenge") || "");
      body.set("code_challenge_method", params.get("code_challenge_method") || "");

      const res = await fetch(window.location.pathname, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });

      if (res.redirected) {
        window.location.href = res.url;
        return;
      }
      if (res.status === 302) {
        const loc = res.headers.get("location");
        if (loc) { window.location.href = loc; return; }
      }
      const data = await res.json().catch(() => ({}));
      document.getElementById("loading").style.display = "none";
      const err = document.getElementById("error");
      err.style.display = "block";
      err.innerHTML = '<div class="error">' + (data.error_description || data.error || "Authorization failed") + "</div>";
    } catch (e) {
      document.getElementById("loading").style.display = "none";
      const err = document.getElementById("error");
      err.style.display = "block";
      err.innerHTML = '<div class="error">' + e.message + "</div>";
    }
  };

  clerkScript.onerror = () => {
    document.getElementById("loading").style.display = "none";
    const err = document.getElementById("error");
    err.style.display = "block";
    err.innerHTML = '<div class="error">Failed to load Clerk SDK</div>';
  };
</script>
</body>
</html>`;

      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html", ...corsHeaders },
      });
    }

    // ── Authorization Code POST handler (called by the HTML page above) ──
    async function handleOAuthAuthorizePost(req: Request): Promise<Response> {
      const formData = await req.formData();
      const clerkJwt = (formData.get("clerk_jwt") as string) || "";
      const clientId = (formData.get("client_id") as string) || "";
      const redirectUri = (formData.get("redirect_uri") as string) || "";
      const state = (formData.get("state") as string) || "";
      const scope = (formData.get("scope") as string) || "mcp:read mcp:write";
      const codeChallenge = (formData.get("code_challenge") as string) || "";
      const codeChallengeMethod = (formData.get("code_challenge_method") as string) || "";

      if (!clerkJwt) {
        return json({ error: "access_denied", error_description: "No Clerk session" }, 403);
      }

      // Verify Clerk JWT
      let claims;
      try {
        claims = await verifyClerkJwt(clerkJwt);
      } catch {
        return json({ error: "access_denied", error_description: "Invalid Clerk session" }, 403);
      }

      // Look up the client
      const client = await queryOne<{ id: string; workspace_id: string }>(
        `SELECT id, workspace_id FROM mcp_oauth_clients WHERE client_id = $1`,
        [clientId],
      );
      if (!client) {
        return json({ error: "invalid_client", error_description: "Unknown client_id" }, 400);
      }

      const userId = claims.sub;
      const workspaceId = claims.org_id || client.workspace_id;

      // Generate authorization code (random, short-lived: 10 minutes)
      const code = `mem_code_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      await query(
        `INSERT INTO mcp_oauth_auth_codes (code, client_id, workspace_id, user_id, workspace_id_claim, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          code,
          client.id,
          workspaceId,
          userId,
          workspaceId,
          redirectUri,
          scope.split(" "),
          codeChallenge || null,
          codeChallengeMethod || null,
          expiresAt,
        ],
      );

      // Redirect back to client with auth code
      const callbackUrl = new URL(redirectUri);
      callbackUrl.searchParams.set("code", code);
      if (state) callbackUrl.searchParams.set("state", state);

      return Response.redirect(callbackUrl.toString(), 302);
    }

    // ── Token Endpoint ────────────────────────────────────────────
    // Gemini exchanges auth code for access token here
    async function handleOAuthToken(req: Request): Promise<Response> {
      if (req.method !== "POST") {
        return json({ error: "method_not_allowed" }, 405);
      }

      // Parse body (form-urlencoded or JSON)
      const contentType = req.headers.get("content-type") || "";
      let params: Record<string, string>;

      if (contentType.includes("application/json")) {
        try {
          params = await req.json() as Record<string, string>;
        } catch {
          return json({ error: "invalid_request", error_description: "Invalid JSON" }, 400);
        }
      } else {
        const formData = await req.formData();
        params = Object.fromEntries(formData.entries()) as Record<string, string>;
      }

      const grantType = params.grant_type || "";
      const clientId = params.client_id || "";
      const clientSecret = params.client_secret || "";
      const code = params.code || "";
      const redirectUri = params.redirect_uri || "";

      // Validate client credentials
      const client = await queryOne<{ id: string; client_secret: string; workspace_id: string; scopes: string[] }>(
        `SELECT id, client_secret, workspace_id, scopes FROM mcp_oauth_clients WHERE client_id = $1`,
        [clientId],
      );
      if (!client) {
        return json({ error: "invalid_client", error_description: "Unknown client_id" }, 401);
      }

      // Verify client secret
      const secretHash = await sha256Hex(clientSecret);
      if (secretHash !== client.client_secret) {
        return json({ error: "invalid_client", error_description: "Invalid client_secret" }, 401);
      }

      if (grantType === "authorization_code") {
        // Look up the auth code
        const authCode = await queryOne<{
          id: string;
          workspace_id: string;
          user_id: string;
          workspace_id_claim: string;
          redirect_uri: string;
          scopes: string[];
          code_challenge: string | null;
          code_challenge_method: string | null;
          expires_at: string;
          consumed_at: string | null;
        }>(
          `SELECT id, workspace_id, user_id, workspace_id_claim, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at, consumed_at
           FROM mcp_oauth_auth_codes WHERE code = $1 AND client_id = $2`,
          [code, client.id],
        );

        if (!authCode) {
          return json({ error: "invalid_grant", error_description: "Invalid authorization code" }, 400);
        }

        if (authCode.consumed_at) {
          return json({ error: "invalid_grant", error_description: "Authorization code already used" }, 400);
        }

        if (new Date(authCode.expires_at) < new Date()) {
          return json({ error: "invalid_grant", error_description: "Authorization code expired" }, 400);
        }

        if (redirectUri && redirectUri !== authCode.redirect_uri) {
          return json({ error: "invalid_grant", error_description: "redirect_uri mismatch" }, 400);
        }

        // Mark code as consumed
        await query(`UPDATE mcp_oauth_auth_codes SET consumed_at = now() WHERE id = $1`, [authCode.id]);

        // Find or create an agent for this OAuth client
        let agent = await queryOne<{ id: string }>(
          `SELECT id FROM agents WHERE workspace_id = $1 AND name = $2`,
          [authCode.workspace_id_claim, `oauth_${clientId.slice(0, 16)}`],
        );

        if (!agent) {
          // Create a new agent for this OAuth client
          const newAgent = await queryOne<{ id: string }>(
            `INSERT INTO agents (workspace_id, name, kind, status, access_level)
             VALUES ($1, $2, 'custom', 'active', 'both')
             RETURNING id`,
            [authCode.workspace_id_claim, `oauth_${clientId.slice(0, 16)}`],
          );
          agent = newAgent;
        }

        if (!agent) {
          return json({ error: "server_error", error_description: "Could not create agent" }, 500);
        }

        // Create a Memorify agent token (the access token)
        const tokenResult = await createAgentToken({
          workspace_id: authCode.workspace_id_claim,
          agent_id: agent.id,
          scopes: ["memory:read", "memory:write", "skills:read", "skills:write", "documents:read", "documents:write", "events:read", "events:write"],
          expiresInSeconds: 86400, // 24 hours
        });

        // Generate refresh token
        const refreshToken = `mem_refresh_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;
        const refreshHash = await sha256Hex(refreshToken);

        await query(
          `INSERT INTO mcp_oauth_refresh_tokens (token_hash, client_id, workspace_id, user_id, workspace_id_claim, scopes, access_token_jti, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '30 days')`,
          [refreshHash, client.id, authCode.workspace_id_claim, authCode.user_id, authCode.workspace_id_claim, authCode.scopes, tokenResult.jti],
        );

        return json({
          access_token: tokenResult.token,
          token_type: "Bearer",
          expires_in: 86400,
          refresh_token: refreshToken,
          scope: authCode.scopes.join(" "),
        });

      } else if (grantType === "refresh_token") {
        const refreshToken = params.refresh_token || "";
        if (!refreshToken) {
          return json({ error: "invalid_request", error_description: "refresh_token required" }, 400);
        }

        const refreshHash = await sha256Hex(refreshToken);
        const stored = await queryOne<{ id: string; workspace_id: string; user_id: string; workspace_id_claim: string; scopes: string[]; access_token_jti: string | null; revoked_at: string | null }>(
          `SELECT id, workspace_id, user_id, workspace_id_claim, scopes, access_token_jti, revoked_at
           FROM mcp_oauth_refresh_tokens WHERE token_hash = $1 AND client_id = $2`,
          [refreshHash, client.id],
        );

        if (!stored || stored.revoked_at) {
          return json({ error: "invalid_grant", error_description: "Invalid or revoked refresh token" }, 400);
        }

        // Revoke old refresh token
        await query(`UPDATE mcp_oauth_refresh_tokens SET revoked_at = now() WHERE id = $1`, [stored.id]);

        // Find or create agent
        let agent = await queryOne<{ id: string }>(
          `SELECT id FROM agents WHERE workspace_id = $1 AND name = $2`,
          [stored.workspace_id_claim, `oauth_${clientId.slice(0, 16)}`],
        );

        if (!agent) {
          const newAgent = await queryOne<{ id: string }>(
            `INSERT INTO agents (workspace_id, name, kind, status, access_level)
             VALUES ($1, $2, 'custom', 'active', 'both')
             RETURNING id`,
            [stored.workspace_id_claim, `oauth_${clientId.slice(0, 16)}`],
          );
          agent = newAgent;
        }

        if (!agent) {
          return json({ error: "server_error", error_description: "Could not find agent" }, 500);
        }

        // Issue new access token
        const tokenResult = await createAgentToken({
          workspace_id: stored.workspace_id_claim,
          agent_id: agent.id,
          scopes: ["memory:read", "memory:write", "skills:read", "skills:write", "documents:read", "documents:write", "events:read", "events:write"],
          expiresInSeconds: 86400,
        });

        // Issue new refresh token
        const newRefreshToken = `mem_refresh_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;
        const newRefreshHash = await sha256Hex(newRefreshToken);

        await query(
          `INSERT INTO mcp_oauth_refresh_tokens (token_hash, client_id, workspace_id, user_id, workspace_id_claim, scopes, access_token_jti, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '30 days')`,
          [newRefreshHash, client.id, stored.workspace_id_claim, stored.user_id, stored.workspace_id_claim, stored.scopes, tokenResult.jti],
        );

        return json({
          access_token: tokenResult.token,
          token_type: "Bearer",
          expires_in: 86400,
          refresh_token: newRefreshToken,
          scope: stored.scopes.join(" "),
        });

      } else if (grantType === "client_credentials") {
        // Machine-to-machine: issue a token directly for the client's workspace
        let agent = await queryOne<{ id: string }>(
          `SELECT id FROM agents WHERE workspace_id = $1 AND name = $2`,
          [client.workspace_id, `oauth_${clientId.slice(0, 16)}`],
        );

        if (!agent) {
          const newAgent = await queryOne<{ id: string }>(
            `INSERT INTO agents (workspace_id, name, kind, status, access_level)
             VALUES ($1, $2, 'custom', 'active', 'both')
             RETURNING id`,
            [client.workspace_id, `oauth_${clientId.slice(0, 16)}`],
          );
          agent = newAgent;
        }

        if (!agent) {
          return json({ error: "server_error", error_description: "Could not create agent" }, 500);
        }

        const tokenResult = await createAgentToken({
          workspace_id: client.workspace_id,
          agent_id: agent.id,
          scopes: ["memory:read", "memory:write", "documents:read", "documents:write"],
          expiresInSeconds: 86400,
        });

        return json({
          access_token: tokenResult.token,
          token_type: "Bearer",
          expires_in: 86400,
          scope: "mcp:read mcp:write",
        });
      }

      return json({ error: "unsupported_grant_type", error_description: `Grant type ${grantType} not supported` }, 400);
    }

    // ── Token Revocation (RFC 7009) ──────────────────────────────
    async function handleOAuthRevoke(req: Request): Promise<Response> {
      if (req.method !== "POST") {
        return json({ error: "method_not_allowed" }, 405);
      }

      const formData = await req.formData();
      const token = formData.get("token") as string || "";
      const tokenTypeHint = formData.get("token_type_hint") as string || "";

      if (!token) {
        return new Response(null, { status: 200 });
      }

      // If it's a refresh token, revoke it
      const refreshHash = await sha256Hex(token);
      const refreshResult = await query(
        `UPDATE mcp_oauth_refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL RETURNING id`,
        [refreshHash],
      );
      if (refreshResult.length > 0) {
        return new Response(null, { status: 200 });
      }

      // If it's an access token (mem_live_...), revoke the agent token
      try {
        // Need to extract workspace_id and jti from the token
        // For simplicity, revoke by prefix if we can't parse
        await revokeAgentToken({ workspace_id: "", prefix: "" }); // This needs proper implementation
      } catch {
        // Token might be invalid — still return 200 per RFC 7009
      }

      return new Response(null, { status: 200 });
    }

    // ── Helpers ──────────────────────────────────────────────────

    function extractClerkTokenFromCookie(req: Request): string | null {
      const cookie = req.headers.get("cookie") || "";
      const match = cookie.match(/__client=([^;]+)/) || cookie.match(/__clerk_db_jwt=([^;]+)/);
      if (!match) return null;
      // Clerk stores the JWT in the cookie value — extract it
      const value = decodeURIComponent(match[1]);
      // The cookie value might be a JSON object with "jwt" or just the token
      try {
        const parsed = JSON.parse(value);
        return parsed.jwt || parsed.token || parsed || null;
      } catch {
        // Not JSON — might be the raw JWT
        if (value.startsWith("eyJ")) return value;
        return null;
      }
    }

    async function sha256Hex(input: string): Promise<string> {
      const data = new TextEncoder().encode(input);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }

