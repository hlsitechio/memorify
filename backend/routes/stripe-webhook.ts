// backend/routes/stripe-webhook.ts
// Stripe payments webhook — auto-provisions memory credits for one-time packs.
// POST /api/stripe/webhook — called server-to-server by Stripe; signature-verified.
//
// Attribution: client_reference_id (workspace id) when present, else the buyer's
// checkout email is matched against app_users → workspace_members (org admins first).
// Idempotent: one ledger row per Stripe event id (unique constraint).

import { json } from "../lib/cors.ts";
import { execute, query, queryOne } from "../lib/db.ts";

/** Live payment-link amounts (cents) → memory credits. */
const PACK_CREDITS: Record<number, { credits: number; pack: string }> = {
  199: { credits: 500, pack: "starter" },
  499: { credits: 2500, pack: "popular" },
  999: { credits: 10000, pack: "value" },
};

const SIGNATURE_TOLERANCE_SECONDS = 300;

let tablesEnsured = false;
async function ensureTables(): Promise<void> {
  if (tablesEnsured) return;
  await execute(`
    CREATE TABLE IF NOT EXISTS credit_ledger (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id text,
      event_id text UNIQUE NOT NULL,
      session_id text,
      email text,
      amount_total integer,
      credits integer NOT NULL DEFAULT 0,
      status text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  tablesEnsured = true;
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time string comparison (both inputs are hex digests). */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type StripeSession = {
  id?: string;
  amount_total?: number | null;
  client_reference_id?: string | null;
  customer_email?: string | null;
  payment_status?: string | null;
  customer_details?: { email?: string | null } | null;
};


/** Resolve the workspace that should receive credits. */
async function resolveWorkspaceId(session: StripeSession): Promise<string | null> {
  // 1. Explicit workspace reference (payment link ?client_reference_id=…)
  const ref = typeof session.client_reference_id === "string" ? session.client_reference_id.trim() : "";
  if (ref) {
    const ws = await queryOne<{ id: string }>(`SELECT id FROM workspaces WHERE id = $1`, [ref]);
    if (ws) return ws.id;
  }

  // 2. Buyer email → app_users → workspace_members (admins first, then oldest workspace)
  const email =
    session.customer_details?.email?.trim().toLowerCase() ||
    (typeof session.customer_email === "string" ? session.customer_email.trim().toLowerCase() : "");
  if (!email) return null;

  const row = await queryOne<{ workspace_id: string }>(
    `SELECT m.workspace_id
     FROM app_users u
     JOIN workspace_members m ON m.user_id = u.id
     JOIN workspaces w ON w.id = m.workspace_id
     WHERE lower(u.email) = $1
     ORDER BY (m.role = 'org:admin') DESC, w.created_at ASC
     LIMIT 1`,
    [email],
  );
  return row?.workspace_id ?? null;
}

/** Record one ledger row. Returns false when the event was already processed. */
async function recordLedger(input: {
  eventId: string;
  sessionId: string | null;
  workspaceId: string | null;
  email: string | null;
  amountTotal: number | null;
  credits: number;
  status: string;
}): Promise<boolean> {
  await ensureTables();
  // ON CONFLICT (event_id) DO NOTHING + RETURNING → idempotent across Stripe retries.
  const rows = await query<{ id: string }>(
    `INSERT INTO credit_ledger (workspace_id, event_id, session_id, email, amount_total, credits, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id`,
    [input.workspaceId, input.eventId, input.sessionId, input.email, input.amountTotal, input.credits, input.status],
  );
  return rows.length > 0;
}


async function provisionCredits(eventId: string, session: StripeSession): Promise<void> {
  const amountTotal = typeof session.amount_total === "number" ? session.amount_total : null;
  const email =
    session.customer_details?.email?.trim().toLowerCase() ||
    (typeof session.customer_email === "string" ? session.customer_email.trim().toLowerCase() : null) ||
    null;
  const pack = amountTotal !== null ? PACK_CREDITS[amountTotal] : undefined;

  // Async payment methods fire completed with payment_status=unpaid; wait for
  // checkout.session.async_payment_succeeded before crediting.
  if (session.payment_status === "unpaid") {
    await recordLedger({
      eventId,
      sessionId: session.id ?? null,
      workspaceId: null,
      email,
      amountTotal,
      credits: 0,
      status: "pending_async_payment",
    });
    console.log("[stripe] session", session.id, "pending async payment — not credited yet");
    return;
  }

  const workspaceId = await resolveWorkspaceId(session);

  if (!pack) {
    await recordLedger({
      eventId,
      sessionId: session.id ?? null,
      workspaceId,
      email,
      amountTotal,
      credits: 0,
      status: "unmatched_amount",
    });
    console.log("[stripe] unmatched amount", amountTotal, "for session", session.id, "— recorded for manual review");
    return;
  }

  if (!workspaceId) {
    await recordLedger({
      eventId,
      sessionId: session.id ?? null,
      workspaceId: null,
      email,
      amountTotal,
      credits: 0,
      status: "unmatched_buyer",
    });
    console.log("[stripe] no workspace for buyer", email, "— recorded for manual review");
    return;
  }

  const inserted = await recordLedger({
    eventId,
    sessionId: session.id ?? null,
    workspaceId,
    email,
    amountTotal,
    credits: pack.credits,
    status: "credited",
  });
  if (!inserted) {
    console.log("[stripe] duplicate event", eventId, "— skipped");
    return;
  }

  // Surface the purchase in the workspace Activity feed (/dashboard/events).
  execute(
    `INSERT INTO events (workspace_id, agent_id, kind, source, payload)
     VALUES ($1, NULL, 'system.payment', 'stripe', $2::jsonb)`,
    [
      workspaceId,
      JSON.stringify({
        credits: pack.credits,
        pack: pack.pack,
        amount_usd: amountTotal !== null ? amountTotal / 100 : null,
        email,
        session_id: session.id ?? null,
      }),
    ],
  ).catch(() => {});

  console.log("[stripe] credited", pack.credits, "to workspace", workspaceId, "(pack:", pack.pack + ")");
}

export async function handleStripePaymentsWebhook(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return json({ error: "stripe_webhook_not_configured" }, 503);

  const body = await req.text();
  const sigHeader = req.headers.get("stripe-signature") ?? "";

  // Stripe header format: "t=timestamp,v1=sig[,v1=sig…]"
  let timestamp = "";
  const v1Sigs: string[] = [];
  for (const part of sigHeader.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = value;
    else if (key === "v1") v1Sigs.push(value);
  }
  if (!timestamp || v1Sigs.length === 0) return json({ error: "missing_signature" }, 400);

  const ts = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > SIGNATURE_TOLERANCE_SECONDS) {
    return json({ error: "signature_timestamp_out_of_tolerance" }, 400);
  }

  const expected = await hmacHex(secret, `${timestamp}.${body}`);
  if (!v1Sigs.some((sig) => timingSafeEqualHex(sig, expected))) {
    return json({ error: "invalid_signature" }, 401);
  }

  let event: { id?: string; type?: string; data?: { object?: StripeSession } };
  try {
    event = JSON.parse(body);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const type = event.type ?? "";
  if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
    try {
      await provisionCredits(event.id ?? `evt_${crypto.randomUUID()}`, event.data?.object ?? {});
    } catch (e) {
      // Return 500 so Stripe retries with backoff.
      console.error("[stripe] provisioning failed:", e);
      return json({ error: "provisioning_failed" }, 500);
    }
  } else {
    console.log("[stripe] event", type, event.id ?? "");
  }

  return json({ received: true });
}

