// backend/routes/connectors.ts
// Connectors CRUD + AgentMail & Stripe webhook handlers
import { json, corsHeaders, requireAuth } from "../lib/cors.ts";
import { query, queryOne, execute } from "../lib/db.ts";

// Connector kinds supported
export const CONNECTOR_KINDS = [
  "http",
  "slack",
  "github",
  "postgres",
  "stripe",
  "notion",
  "gmail",
  "agentmail",
  "custom",
] as const;

export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];

export interface Connector extends Record<string, unknown> {
  id: string;
  workspace_id: string;
  name: string;
  kind: ConnectorKind;
  status: "active" | "inactive" | "error";
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Validation schemas per kind
const KIND_CONFIG_SCHEMA: Record<ConnectorKind, string[]> = {
  http: ["url"],
  slack: ["webhook_url", "bot_token"],
  github: ["token", "repo"],
  postgres: ["connection_string"],
  stripe: ["secret_key", "webhook_secret"],
  notion: ["token", "database_id"],
  gmail: ["client_id", "client_secret", "refresh_token"],
  agentmail: ["api_key", "inbox_id", "webhook_url"],
  custom: [],
};

function validateConfig(kind: ConnectorKind, config: Record<string, unknown>): string | null {
  const required = KIND_CONFIG_SCHEMA[kind] || [];
  for (const field of required) {
    if (!config[field] || (typeof config[field] === "string" && !config[field].trim())) {
      return `Missing required config field: ${field}`;
    }
  }
  return null;
}

function maskConfig(config: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!config || typeof config !== "object") return {};
  const sensitive = ["api_key", "secret", "token", "password", "key", "webhook_secret", "client_secret"];
  return Object.keys(config).reduce((acc, k) => {
    acc[k] = sensitive.some((s) => k.toLowerCase().includes(s)) ? "***" : config[k];
    return acc;
  }, {} as Record<string, unknown>);
}

export async function handleConnectors(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireAuth(req);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Match e.g. /api/connectors or /api/v1/connectors
  const connIndex = pathParts.indexOf("connectors");
  const id = connIndex !== -1 && pathParts[connIndex + 1] ? pathParts[connIndex + 1] : null;
  const isTest = connIndex !== -1 && pathParts[connIndex + 2] === "test";

  // POST /api/connectors/:id/test
  if (id && isTest && req.method === "POST") {
    const conn = await queryOne<Connector>(
      `SELECT * FROM connectors WHERE id = $1 AND workspace_id = $2`,
      [id, auth.workspace_id],
    );
    if (!conn) return json({ error: "not found" }, 404);

    let testResult: { ok: boolean; detail: string };
    try {
      switch (conn.kind) {
        case "agentmail":
          testResult = await testAgentMail(conn.config as Record<string, unknown>);
          break;
        case "http":
          testResult = await testHttp(conn.config as Record<string, unknown>);
          break;
        case "slack":
          testResult = await testSlack(conn.config as Record<string, unknown>);
          break;
        case "github":
          testResult = await testGitHub(conn.config as Record<string, unknown>);
          break;
        default:
          testResult = { ok: true, detail: "Test not implemented for this kind" };
      }
    } catch (e) {
      testResult = { ok: false, detail: String(e) };
    }

    const newStatus = testResult.ok ? "active" : "error";
    await execute(
      `UPDATE connectors SET status = $1, updated_at = $2 WHERE id = $3`,
      [newStatus, new Date().toISOString(), id],
    );

    return json({ ...testResult, status: newStatus });
  }

  // GET /api/connectors/:id
  if (id && req.method === "GET") {
    const conn = await queryOne<Connector>(
      `SELECT * FROM connectors WHERE id = $1 AND workspace_id = $2`,
      [id, auth.workspace_id],
    );
    if (!conn) return json({ error: "not found" }, 404);
    return json({ ...conn, config: maskConfig(conn.config) });
  }

  // PATCH /api/connectors/:id
  if (id && req.method === "PATCH") {
    const conn = await queryOne<Connector>(
      `SELECT * FROM connectors WHERE id = $1 AND workspace_id = $2`,
      [id, auth.workspace_id],
    );
    if (!conn) return json({ error: "not found" }, 404);

    const body = await req.json().catch(() => ({}));
    const { name, kind, status, config } = body as {
      name?: string;
      kind?: string;
      status?: "active" | "inactive" | "error";
      config?: Record<string, unknown>;
    };

    const newKind = (kind || conn.kind) as ConnectorKind;
    const newConfig = config !== undefined ? config : conn.config;

    if (kind && kind !== conn.kind) {
      const err = validateConfig(newKind, newConfig);
      if (err) return json({ error: err }, 400);
    } else if (config !== undefined) {
      const err = validateConfig(conn.kind as ConnectorKind, newConfig);
      if (err) return json({ error: err }, 400);
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIdx++}`);
      params.push(name.trim());
    }
    if (kind !== undefined) {
      updates.push(`kind = $${paramIdx++}`);
      params.push(kind);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIdx++}`);
      params.push(status);
    }
    if (config !== undefined) {
      updates.push(`config = $${paramIdx++}`);
      params.push(JSON.stringify(newConfig));
    }

    if (updates.length === 0) return json({ error: "no fields to update" }, 400);

    updates.push(`updated_at = $${paramIdx++}`);
    params.push(new Date().toISOString());

    params.push(id, auth.workspace_id);

    await execute(
      `UPDATE connectors SET ${updates.join(", ")} WHERE id = $${paramIdx++} AND workspace_id = $${paramIdx}`,
      params,
    );

    const updated = await queryOne<Connector>(
      `SELECT * FROM connectors WHERE id = $1 AND workspace_id = $2`,
      [id, auth.workspace_id],
    );

    return json({ ...updated, config: maskConfig(updated?.config) });
  }

  // DELETE /api/connectors/:id
  if (id && req.method === "DELETE") {
    const deletedCount = await execute(
      `DELETE FROM connectors WHERE id = $1 AND workspace_id = $2`,
      [id, auth.workspace_id],
    );
    if (deletedCount === 0) return json({ error: "not found" }, 404);
    return json({ success: true });
  }

  // GET /api/connectors — list all
  if (req.method === "GET") {
    const connectors = await query<Connector>(
      `SELECT * FROM connectors WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [auth.workspace_id],
    );
    const safe = connectors.map((c) => ({
      ...c,
      config: maskConfig(c.config),
    }));
    return json(safe);
  }

  // POST /api/connectors — create connector
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const { name, kind, config = {} } = body as { name?: string; kind?: string; config?: Record<string, unknown> };

    if (!name || !name.trim()) return json({ error: "name required" }, 400);
    if (!kind || !CONNECTOR_KINDS.includes(kind as ConnectorKind)) {
      return json({ error: `kind must be one of: ${CONNECTOR_KINDS.join(", ")}` }, 400);
    }

    const validationError = validateConfig(kind as ConnectorKind, config);
    if (validationError) return json({ error: validationError }, 400);

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    await execute(
      `INSERT INTO connectors (id, workspace_id, name, kind, status, config, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'inactive', $5, $6, $6)`,
      [newId, auth.workspace_id, name.trim(), kind, JSON.stringify(config), now],
    );

    const conn = await queryOne<Connector>(
      `SELECT * FROM connectors WHERE id = $1`,
      [newId],
    );

    return json({ ...conn, config: maskConfig(conn?.config) }, 201);
  }

  return json({ error: "method not allowed" }, 405);
}

// Test functions
async function testAgentMail(config: Record<string, unknown>): Promise<{ ok: boolean; detail: string }> {
  const apiKey = config.api_key as string;
  const inboxId = config.inbox_id as string;

  if (!apiKey || !inboxId) return { ok: false, detail: "Missing api_key or inbox_id" };

  const url = `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });

  if (res.ok) return { ok: true, detail: "AgentMail inbox reachable" };
  return { ok: false, detail: `AgentMail API error: ${res.status}` };
}

async function testHttp(config: Record<string, unknown>): Promise<{ ok: boolean; detail: string }> {
  const url = config.url as string;
  if (!url) return { ok: false, detail: "Missing url" };

  try {
    const res = await fetch(url, { method: "HEAD" });
    return { ok: res.ok, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

async function testSlack(config: Record<string, unknown>): Promise<{ ok: boolean; detail: string }> {
  const webhookUrl = config.webhook_url as string;
  if (!webhookUrl) return { ok: false, detail: "Missing webhook_url" };

  try {
    const res = await fetch(webhookUrl, { method: "POST", body: JSON.stringify({ text: "test" }) });
    return { ok: res.ok, detail: `Slack webhook ${res.ok ? "delivered" : "failed: " + res.status}` };
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

async function testGitHub(config: Record<string, unknown>): Promise<{ ok: boolean; detail: string }> {
  const token = config.token as string;
  const repo = config.repo as string;
  if (!token || !repo) return { ok: false, detail: "Missing token or repo" };

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    return { ok: res.ok, detail: res.ok ? "GitHub repo accessible" : `GitHub error: ${res.status}` };
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

// AgentMail webhook handler — called by Netlify edge function
export async function handleAgentMailWebhook(req: Request, workspaceId: string): Promise<Response> {
  const conn = await queryOne<Connector>(
    `SELECT * FROM connectors WHERE workspace_id = $1 AND kind = 'agentmail' AND status = 'active' LIMIT 1`,
    [workspaceId],
  );

  if (!conn) {
    return json({ error: "No active AgentMail connector" }, 404);
  }

  const config = conn.config as Record<string, unknown>;
  const webhookSecret = config.webhook_secret as string;

  // Verify HMAC signature if secret configured
  if (webhookSecret) {
    const signature = req.headers.get("x-agentmail-signature") || "";
    const body = await req.clone().text();
    const expected = await hmacSha256(webhookSecret, body);
    if (signature !== expected) {
      return json({ error: "Invalid signature" }, 401);
    }
  }

  const payload = await req.json();
  const eventType = payload.type || payload.event_type;

  if (eventType === "message.received") {
    const message = payload.message;
    console.log("AgentMail message received:", message?.message_id, message?.thread_id);
    return json({ received: true });
  }

  return json({ ok: true });
}

// HMAC helper
async function hmacSha256(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Stripe webhook handler — called by Netlify edge function
export async function handleStripeWebhook(req: Request, workspaceId: string): Promise<Response> {
  const conn = await queryOne<Connector>(
    `SELECT * FROM connectors WHERE workspace_id = $1 AND kind = 'stripe' AND status = 'active' LIMIT 1`,
    [workspaceId],
  );

  if (!conn) {
    return json({ error: "No active Stripe connector" }, 404);
  }

  const config = conn.config as Record<string, unknown>;
  const webhookSecret = config.webhook_secret as string;

  const signature = req.headers.get("stripe-signature") || "";
  const body = await req.clone().text();

  if (webhookSecret) {
    const expected = await hmacSha256(webhookSecret, body);
    const sigElements = signature.split(",");
    let valid = false;
    for (const element of sigElements) {
      const [key, value] = element.split("=");
      if (key === "v1" && value === expected) {
        valid = true;
        break;
      }
    }
    if (!valid && signature !== expected) {
      return json({ error: "Invalid Stripe signature" }, 401);
    }
  }

  let event: { type?: string; id?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(body);
  } catch {
    return json({ error: "Invalid JSON payload" }, 400);
  }

  console.log("Stripe webhook received:", event.type, event.id);
  return json({ received: true });
}