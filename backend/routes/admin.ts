// routes/admin.ts — Admin diagnostics endpoints
// Auth: Clerk JWT (dashboard user) + admin check

import { json } from "../lib/cors.ts";
import { extractBearer, verifyClerkJwt, type ClerkClaims } from "../lib/clerk.ts";
import { query, queryOne, execute } from "../lib/db.ts";
import { logger } from "../lib/logger.ts";

type AdminAuth = {
  user_id: string;
  workspace_id: string;
  claims: ClerkClaims;
  isAdmin: boolean;
};

async function requireAdmin(req: Request): Promise<AdminAuth | Response> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  
  if (!token) {
    return json({ error: "unauthorized: missing token" }, 401);
  }

  const claims = await verifyClerkJwt(token);
  if (!claims) {
    return json({ error: "unauthorized: invalid token" }, 401);
  }

  const user_id = claims.sub;
  const workspace_id = claims.org_id || `user:${user_id}`;

  // Check if user is admin (member of admin org or has admin role)
  // For now, allow any authenticated user in the workspace
  // In production, add proper admin role check
  const isAdmin = true; // TODO: Implement proper admin check

  return { user_id, workspace_id, claims, isAdmin };
}

export async function handleAdmin(req: Request): Promise<Response> {
  const requestId = logger.generateRequestId();
  const startTime = performance.now();

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";

  const baseLog = logger.child({ request_id: requestId, ip, user_agent: ua });

  if (req.method === "OPTIONS") {
    return new Response(null, { 
      status: 204, 
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      }
    });
  }

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const path = url.pathname;

  const log = baseLog.child({
    workspace_id: auth.workspace_id,
    user_id: auth.user_id,
  });

  try {
    // Health check endpoint
    if (path === "/api/admin/health" && req.method === "GET") {
      const checks = await runHealthChecks();
      return json({ checks, timestamp: new Date().toISOString() });
    }

    // Database status
    if (path === "/api/admin/database" && req.method === "GET") {
      const status = await getDatabaseStatus();
      return json(status);
    }

    // System metrics
    if (path === "/api/admin/metrics" && req.method === "GET") {
      const metrics = await getSystemMetrics(auth.workspace_id);
      return json(metrics);
    }

    // Audit logs
    if (path === "/api/admin/audit" && req.method === "GET") {
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100), 1), 500);
      const logs = await query(
        `SELECT id, workspace_id, agent_id, action, resource, metadata, created_at 
         FROM audit_log WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [auth.workspace_id, limit]
      );
      return json({ logs });
    }

    // Agent tokens
    if (path === "/api/admin/agents" && req.method === "GET") {
      const agents = await query(
        `SELECT id, name, kind, status, access_level, last_seen_at, created_at 
         FROM agents WHERE workspace_id = $1 ORDER BY created_at DESC`,
        [auth.workspace_id]
      );
      return json({ agents });
    }

    // MCP servers
    if (path === "/api/admin/mcp" && req.method === "GET") {
      const servers = await query(
        `SELECT id, name, url, transport, enabled, last_handshake_at, last_error 
         FROM mcp_servers WHERE workspace_id = $1 ORDER BY created_at DESC`,
        [auth.workspace_id]
      );
      return json({ servers });
    }

    // Config
    if (path === "/api/admin/config" && req.method === "GET") {
      const config = await query(
        `SELECT key, value, description, created_at, updated_at 
         FROM config WHERE workspace_id = $1 ORDER BY key`,
        [auth.workspace_id]
      );
      return json({ config });
    }

    // Run custom query (admin only)
    if (path === "/api/admin/query" && req.method === "POST") {
      if (!auth.isAdmin) {
        return json({ error: "forbidden: admin required" }, 403);
      }
      const body = await req.json();
      const { sql, params = [] } = body;
      if (!sql) return json({ error: "sql required" }, 400);
      
      // Safety: only allow SELECT queries
      const trimmed = sql.trim().toLowerCase();
      if (!trimmed.startsWith("select")) {
        return json({ error: "only SELECT queries allowed" }, 400);
      }

      const start = performance.now();
      const rows = await query(sql, params);
      const duration = Math.round(performance.now() - start);
      
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      return json({ 
        columns, 
        rows: rows.map(r => columns.map(c => r[c])),
        rowCount: rows.length,
        duration,
      });
    }

    // Environment check
    if (path === "/api/admin/env" && req.method === "GET") {
      if (!auth.isAdmin) {
        return json({ error: "forbidden: admin required" }, 403);
      }
      
      const requiredVars = [
        "NEON_DATABASE_URL",
        "CLERK_PUBLISHABLE_KEY",
        "CLERK_SECRET_KEY",
        "NVIDIA_API_KEY",
        "OPENROUTER_API_KEY",
        "EMBEDDING_API_URL",
        "EMBEDDING_API_KEY",
        "GITHUB_OAUTH_CLIENT_ID",
        "GITHUB_OAUTH_CLIENT_SECRET",
        "VITE_APP_URL",
        "VITE_CLERK_PUBLISHABLE_KEY",
      ];

      const env: Record<string, { required: boolean; present: boolean; preview?: string }> = {};
      
      for (const key of requiredVars) {
        const value = Deno.env.get(key);
        env[key] = {
          required: true,
          present: !!value,
          preview: value ? `${value.substring(0, 8)}...` : undefined,
        };
      }

      // Also include all env vars (masked)
      for (const [key, value] of Object.entries(Deno.env.toObject())) {
        if (!env[key]) {
          env[key] = {
            required: false,
            present: true,
            preview: `${value.substring(0, 8)}...`,
          };
        }
      }

      return json({ env });
    }

    return json({ error: "not found", path }, 404);
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const err = error as Error;
    log.error("Admin request failed", {
      path,
      duration_ms: duration,
      error: err.message,
    });
    return json({ error: err.message }, 500);
  }
}

async function runHealthChecks() {
  const checks = [
    { id: "site", name: "Website", url: "https://memorify.dev/", category: "network" },
    { id: "api_health", name: "API Health", url: "https://memorify.dev/api/health", category: "api" },
    { id: "api_v1", name: "API v1 Gateway", url: "https://memorify.dev/api/v1", category: "api" },
    { id: "mcp_gateway", name: "MCP Gateway", url: "https://memorify.dev/mcp", category: "mcp" },
    { id: "oauth_protected", name: "OAuth Protected Resource", url: "https://memorify.dev/.well-known/oauth-protected-resource", category: "oauth" },
    { id: "oauth_auth_server", name: "OAuth Auth Server", url: "https://memorify.dev/.well-known/oauth-authorization-server", category: "oauth" },
    { id: "agent_jwt", name: "Agent JWT Endpoint", url: "https://memorify.dev/api/agent-jwt", category: "auth" },
  ];

  return Promise.all(checks.map(async (check) => {
    const start = performance.now();
    try {
      const res = await fetch(check.url, { 
        method: check.id === "api_v1" ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
        body: check.id === "api_v1" ? JSON.stringify({ agent: "gateway", action: "ping", input: {} }) : undefined,
      });
      const latencyMs = Math.round(performance.now() - start);
      
      let status: "operational" | "degraded" | "down" = "down";
      if (res.ok) status = "operational";
      else if (res.status >= 500) status = "down";
      else if (res.status >= 400) status = "degraded";

      return {
        id: check.id,
        name: check.name,
        category: check.category,
        status,
        latencyMs,
        lastChecked: new Date().toISOString(),
        error: res.ok ? null : `HTTP ${res.status}`,
        endpoint: check.url,
      };
    } catch (error) {
      return {
        id: check.id,
        name: check.name,
        category: check.category,
        status: "down" as const,
        latencyMs: Math.round(performance.now() - start),
        lastChecked: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
        endpoint: check.url,
      };
    }
  }));
}

async function getDatabaseStatus() {
  const start = performance.now();
  try {
    // Test connection
    await queryOne(`SELECT 1`);
    const latencyMs = Math.round(performance.now() - start);

    // Get table info
    const tables = await query(
      `SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::regclass)) as size 
       FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );

    // Get row counts for key tables
    const tableNames = ["memories", "documents", "document_chunks", "agents", "skills", "events", "audit_log", "config", "mcp_servers", "mcp_tools"];
    const tableInfo = [];

    for (const name of tableNames) {
      try {
        const countResult = await queryOne<{ count: string }>(`SELECT count(*) as count FROM ${name}`);
        const sizeResult = await queryOne<{ size: string }>(`SELECT pg_size_pretty(pg_total_relation_size('${name}'::regclass)) as size`);
        tableInfo.push({
          name,
          rowCount: parseInt(countResult?.count || "0"),
          size: sizeResult?.size || "unknown",
          lastAnalyzed: null,
        });
      } catch {
        tableInfo.push({ name, rowCount: 0, size: "unknown", lastAnalyzed: null });
      }
    }

    return {
      connected: true,
      poolSize: 10,
      activeConnections: 1,
      tables: tableInfo,
      error: null,
      latencyMs,
    };
  } catch (error) {
    return {
      connected: false,
      poolSize: 0,
      activeConnections: 0,
      tables: [],
      error: error instanceof Error ? error.message : "Unknown error",
      latencyMs: null,
    };
  }
}

async function getSystemMetrics(workspace_id: string) {
  // Get request counts from events
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const minuteAgo = now - 60 * 1000;

  const [totalResult, hourResult, minuteResult, errorResult] = await Promise.all([
    queryOne<{ count: string }>(`SELECT count(*) as count FROM events WHERE workspace_id = $1`, [workspace_id]),
    queryOne<{ count: string }>(`SELECT count(*) as count FROM events WHERE workspace_id = $1 AND created_at > to_timestamp($2/1000)`, [workspace_id, hourAgo]),
    queryOne<{ count: string }>(`SELECT count(*) as count FROM events WHERE workspace_id = $1 AND created_at > to_timestamp($2/1000)`, [workspace_id, minuteAgo]),
    queryOne<{ count: string }>(`SELECT count(*) as count FROM events WHERE workspace_id = $1 AND kind LIKE '%error%'`, [workspace_id]),
  ]);

  // Edge function metrics (mock for now)
  const edgeFunctions = [
    { name: "api", path: "/api/*" },
    { name: "mcp", path: "/mcp*" },
    { name: "agent-jwt", path: "/api/agent-jwt" },
    { name: "copilot-chat", path: "/api/copilot/chat" },
  ];

  const edgeFunctionMetrics = edgeFunctions.map(fn => ({
    name: fn.name,
    invocations: Math.floor(Math.random() * 10000) + 1000,
    avgDurationMs: Math.floor(Math.random() * 500) + 50,
    errors: Math.floor(Math.random() * 10),
    lastInvoked: new Date(Date.now() - Math.random() * 3600000).toISOString(),
  }));

  return {
    uptime: Date.now() - (Date.now() % (24 * 60 * 60 * 1000)),
    memoryUsage: {
      heapUsed: 45 * 1024 * 1024,
      heapTotal: 128 * 1024 * 1024,
      external: 12 * 1024 * 1024,
    },
    cpuUsage: Math.random() * 30 + 5,
    requestCount: {
      total: parseInt(totalResult?.count || "0"),
      lastMinute: parseInt(minuteResult?.count || "0"),
      lastHour: parseInt(hourResult?.count || "0"),
      errors: parseInt(errorResult?.count || "0"),
    },
    edgeFunctionMetrics,
  };
}