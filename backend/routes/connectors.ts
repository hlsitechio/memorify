// backend/routes/connectors.ts
// Connectors CRUD + AgentMail webhook handler
import { json, corsHeaders, requireAuth } from "../lib/cors.ts";
import { query } from "../lib/db.ts";
import { randomUUID } from "crypto";

class Router {
  get(_path: string, _handler: (req: any) => Promise<Response>) {}
  post(_path: string, _handler: (req: any) => Promise<Response>) {}
  patch(_path: string, _handler: (req: any) => Promise<Response>) {}
  delete(_path: string, _handler: (req: any) => Promise<Response>) {}
}

function getDb() {
  return {
    query: async (sqlText: string, params: any[] = []) => {
      const rows = await query<any>(sqlText, params);
      return { rows, rowCount: rows.length };
    },
  };
}

const router = new Router();

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

export interface Connector {
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

// GET /api/v1/connectors — list all connectors for workspace
router.get("/connectors", async (req: Request): Promise<Response> => {
  const auth = await requireAuth(req);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const db = getDb();
  const connectors = await db.query(
    `SELECT * FROM connectors WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [auth.workspace_id],
  );

  // Never return sensitive config values in list
  const safe = connectors.rows.map((c: any) => ({
    ...c,
    config: Object.keys(c.config).reduce((acc, k) => {
      // Mask sensitive fields
      const sensitive = ["api_key", "secret", "token", "password", "key", "webhook_secret", "client_secret"];
      acc[k] = sensitive.some((s) => k.toLowerCase().includes(s)) ? "***" : c.config[k];
      return acc;
    }, {} as Record<string, unknown>),
  }));

  return json(safe);
});

// POST /api/v1/connectors — create new connector
router.post("/connectors", async (req: Request): Promise<Response> => {
  const auth = await requireAuth(req);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const { name, kind, config = {} } = body as { name?: string; kind?: string; config?: Record<string, unknown> };

  if (!name || !name.trim()) return json({ error: "name required" }, 400);
  if (!kind || !CONNECTOR_KINDS.includes(kind as ConnectorKind)) {
    return json({ error: `kind must be one of: ${CONNECTOR_KINDS.join(", ")}` }, 400);
  }

  const validationError = validateConfig(kind as ConnectorKind, config);
  if (validationError) return json({ error: validationError }, 400);

  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  await db.query(
    `INSERT INTO connectors (id, workspace_id, name, kind, status, config, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'inactive', $5, $6, $6)`,
    [id, auth.workspace_id, name.trim(), kind, JSON.stringify(config), now],
  );

  const result = await db.query(
    `SELECT * FROM connectors WHERE id = $1`,
    [id],
  );

  const conn = result.rows[0];
  // Mask sensitive config in response
  const safeConfig = Object.keys(conn.config).reduce((acc, k) => {
    const sensitive = ["api_key", "secret", "token", "password", "key", "webhook_secret", "client_secret"];
    acc[k] = sensitive.some((s) => k.toLowerCase().includes(s)) ? "***" : conn.config[k];
    return acc;
  }, {} as Record<string, unknown>);

  return json({ ...conn, config: safeConfig }, 201);
});

// GET /api/v1/connectors/:id — get single connector
router.get("/connectors/:id", async (req: Request): Promise<Response> => {
  const auth = await requireAuth(req);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const id = (req as any).params?.id;
  const db = getDb();
  const result = await db.query(
    `SELECT * FROM connectors WHERE id = $1 AND workspace_id = $2`,
    [id, auth.workspace_id],
  );

  if (result.rows.length === 0) return json({ error: "not found" }, 404);

  const conn = result.rows[0];
  const sensitive = ["api_key", "secret", "token", "password", "key", "webhook_secret", "client_secret"];
  const safeConfig = Object.keys(conn.config).reduce((acc, k) => {
    acc[k] = sensitive.some((s) => k.toLowerCase().includes(s)) ? "***" : conn.config[k];
    return acc;
  }, {} as Record<string, unknown>);

  return json({ ...conn, config: safeConfig });
});

// PATCH /api/v1/connectors/:id — update connector (config, status, name)
router.patch("/connectors/:id", async (req: Request): Promise<Response> => {
  const auth = await requireAuth(req);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const id = (req as any).params?.id;
  const body = await req.json().catch(() => ({}));
  const { name, kind, status, config } = body as {
    name?: string;
    kind?: string;
    status?: "active" | "inactive" | "error";
    config?: Record<string, unknown>;
  };

  const db = getDb();
  const existing = await db.query(
    `SELECT * FROM connectors WHERE id = $1 AND workspace_id = $2`,
    [id, auth.workspace_id],
  );

  if (existing.rows.length === 0) return json({ error: "not found" }, 404);

  const conn = existing.rows[0];
  const newKind = (kind || conn.kind) as ConnectorKind;
  const newConfig = config !== undefined ? config : conn.config;

  // If kind changing or config updated, validate
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

  await db.query(
    `UPDATE connectors SET ${updates.join(", ")} WHERE id = $${paramIdx++} AND workspace_id = $${paramIdx}`,
    params,
  );

  const result = await db.query(
    `SELECT * FROM connectors WHERE id = $1 AND workspace_id = $2`,
    [id, auth.workspace_id],
  );

  const updated = result.rows[0];
  const sensitive = ["api_key", "secret", "token", "password", "key", "webhook_secret", "client_secret"];
  const safeConfig = Object.keys(updated.config).reduce((acc, k) => {
    acc[k] = sensitive.some((s) => k.toLowerCase().includes(s)) ? "***" : updated.config[k];
    return acc;
  }, {} as Record<string, unknown>);

  return json({ ...updated, config: safeConfig });
});

// DELETE /api/v1/connectors/:id
router.delete("/connectors/:id", async (req: Request): Promise<Response> => {
  const auth = await requireAuth(req);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const id = (req as any).params?.id;
  const db = getDb();

  const result = await db.query(
    `DELETE FROM connectors WHERE id = $1 AND workspace_id = $2 RETURNING id`,
    [id, auth.workspace_id],
  );

  if (result.rowCount === 0) return json({ error: "not found" }, 404);

  return json({ success: true });
});

// POST /api/v1/connectors/:id/test — test connector connectivity
router.post("/connectors/:id/test", async (req: Request): Promise<Response> => {
  const auth = await requireAuth(req);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const id = (req as any).params?.id;
  const db = getDb();

  const result = await db.query(
    `SELECT * FROM connectors WHERE id = $1 AND workspace_id = $2`,
    [id, auth.workspace_id],
  );

  if (result.rows.length === 0) return json({ error: "not found" }, 404);

  const conn = result.rows[0];
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

  // Update status based on test
  const newStatus = testResult.ok ? "active" : "error";
  await db.query(
    `UPDATE connectors SET status = $1, updated_at = $2 WHERE id = $3`,
    [newStatus, new Date().toISOString(), id],
  );

  return json({ ...testResult, status: newStatus });
});

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
  const db = getDb();

  // Find active AgentMail connector for this workspace
  const connResult = await db.query(
    `SELECT * FROM connectors WHERE workspace_id = $1 AND kind = 'agentmail' AND status = 'active' LIMIT 1`,
    [workspaceId],
  );

  if (connResult.rows.length === 0) {
    return json({ error: "No active AgentMail connector" }, 404);
  }

  const connector = connResult.rows[0];
  const config = connector.config as Record<string, unknown>;
  const apiKey = config.api_key as string;
  const inboxId = config.inbox_id as string;
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
  // Handle AgentMail event types: message.received, message.sent, etc.
  const eventType = payload.type || payload.event_type;

  if (eventType === "message.received") {
    const message = payload.message;
    // Process inbound message — could trigger sub-agent here
    console.log("AgentMail message received:", message.message_id, message.thread_id);

    // For now, just acknowledge
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
  const db = getDb();

  // Find active Stripe connector for this workspace
  const connResult = await db.query(
    `SELECT * FROM connectors WHERE workspace_id = $1 AND kind = 'stripe' AND status = 'active' LIMIT 1`,
    [workspaceId],
  );

  if (connResult.rows.length === 0) {
    return json({ error: "No active Stripe connector" }, 404);
  }

  const connector = connResult.rows[0];
  const config = connector.config as Record<string, unknown>;
  const webhookSecret = config.webhook_secret as string;

  // Verify Stripe signature
  const signature = req.headers.get("stripe-signature") || "";
  const body = await req.clone().text();

  if (webhookSecret) {
    const expected = await hmacSha256(webhookSecret, body);
    // Stripe uses a different signature format: "t=timestamp,v1=signature"
    // We need to parse and verify properly
    const sigElements = signature.split(",");
    let valid = false;
    for (const element of sigElements) {
      const [key, value] = element.split("=");
      if (key === "v1" && value === expected) {
        valid = true;
        break;
      }
    }
    if (!valid) {
      // Also check for legacy format
      if (signature !== expected) {
        return json({ error: "Invalid Stripe signature" }, 401);
      }
    }
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return json({ error: "Invalid JSON payload" }, 400);
  }

  // Handle Stripe event types
  console.log("Stripe webhook received:", event.type, event.id);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      // Handle successful checkout - could create subscription, send email, etc.
      console.log("Checkout completed:", session.id, session.customer);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object;
      console.log("Subscription event:", event.type, subscription.id, subscription.status);
      // Could sync subscription status to database
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      console.log("Subscription deleted:", subscription.id);
      break;
    }
    case "invoice.payment_succeeded": {
      const invoice = event.data.object;
      console.log("Invoice payment succeeded:", invoice.id);
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      console.log("Invoice payment failed:", invoice.id);
      break;
    }
    default:
      console.log("Unhandled Stripe event type:", event.type);
  }

  return json({ received: true });
}

export default router;