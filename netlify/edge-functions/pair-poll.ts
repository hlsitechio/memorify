// netlify/edge-functions/pair-poll.ts — POST /api/pair/poll
// Agent polls with its device_code (the only secret it holds).
// Returns device-flow states: authorization_pending | slow_down | access_token | access_denied | expired_token | killed.
// SECURITY: interval enforced (slow_down); rapid-poll abuse kills THIS PAIRING only —
//           running agents are never touched. Token mint is atomic (approved → consumed).

import { json } from "../../backend/lib/cors.ts";
import { queryOne, execute } from "../../backend/lib/db.ts";
import { sha256Hex, recordAttempt } from "../../backend/lib/pairing.ts";
import { createAgentToken, VALID_SCOPES, type Scope } from "../../backend/lib/agent-token.ts";

type Pairing = {
  id: string;
  status: string;
  org_id: string | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_kind: string | null;
  requested_scopes: string[] | null;
  interval_seconds: number;
  poll_count: number;
  poll_abuse: number;
  last_polled_at: string | null;
  expires_at: string;
};

const RAPID_POLL_WINDOW_MS = 1000; // polls faster than this count as abuse
const POLL_ABUSE_KILL_AT = 5;

export default async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return json({ error: "invalid_request" }, 400);
    }

    const deviceCode = typeof body.device_code === "string" ? body.device_code.trim() : "";
    if (!deviceCode || deviceCode.length > 200) {
      return json({ error: "invalid_request", error_description: "device_code required" }, 400);
    }

    const deviceCodeHash = await sha256Hex(deviceCode);
    const pairing = await queryOne<Pairing>(
      `SELECT id, status, org_id, agent_id, agent_name, agent_kind, requested_scopes,
              interval_seconds, poll_count, poll_abuse, last_polled_at::text, expires_at::text
       FROM pairings WHERE device_code_hash = $1 LIMIT 1`,
      [deviceCodeHash],
    );

    // Device code is 256-bit random — a miss here is not a guessing surface; be generic.
    if (!pairing) {
      return json({ error: "invalid_grant", error_description: "unknown device code" }, 400);
    }

    const now = Date.now();

    // Terminal states first — no interval bookkeeping needed
    if (pairing.status === "denied") {
      await recordAttempt({ pairing_id: pairing.id, outcome: "denied_seen" });
      return json({ error: "access_denied" }, 403);
    }
    if (pairing.status === "killed" || pairing.status === "cancelled") {
      // Server-triggered kill → client-executed cleanup
      return json({ status: "killed" }, 200);
    }
    if (pairing.status === "consumed") {
      return json({ error: "invalid_grant", error_description: "code already used" }, 400);
    }

    // Expiry (any non-terminal state)
    if (new Date(pairing.expires_at).getTime() <= now) {
      await execute(
        `UPDATE pairings SET status = 'expired' WHERE id = $1 AND status = 'pending'`,
        [pairing.id],
      ).catch(() => {});
      return json({ error: "expired_token" }, 400);
    }

    if (pairing.status === "approved") {
      // Atomic consume — exactly one poller mints the token
      const claimed = await queryOne<{ id: string }>(
        `UPDATE pairings SET status = 'consumed', completed_at = now()
         WHERE id = $1 AND status = 'approved'
         RETURNING id`,
        [pairing.id],
      );
      if (!claimed) {
        return json({ error: "invalid_grant", error_description: "code already used" }, 400);
      }

      const scopes = ((pairing.requested_scopes ?? [...VALID_SCOPES]) as string[])
        .filter((s) => (VALID_SCOPES as readonly string[]).includes(s)) as Scope[];

      const { token } = await createAgentToken({
        workspace_id: pairing.org_id!,
        agent_id: pairing.agent_id!,
        scopes,
        expiresInSeconds: 0, // long-lived pairing token; rotation via dashboard
      });

      // Connect the agent row now that a token exists
      await execute(
        `UPDATE agents SET status = 'connected', updated_at = now() WHERE id = $1 AND status <> 'disconnected'`,
        [pairing.agent_id],
      ).catch(() => {});
      await recordAttempt({ pairing_id: pairing.id, outcome: "consumed" });

      return json({
        status: "approved",
        access_token: token,
        token_type: "Bearer",
        agent_id: pairing.agent_id,
        agent_name: pairing.agent_name,
        workspace_id: pairing.org_id,
        mcp_url: "https://memorify.dev/mcp",
      });
    }

    // status === 'pending' → enforce poll interval + abuse ladder
    const intervalMs = pairing.interval_seconds * 1000;
    const lastPolled = pairing.last_polled_at ? new Date(pairing.last_polled_at).getTime() : 0;
    const sinceLast = now - lastPolled;

    if (sinceLast < intervalMs) {
      // Count rapid-fire (< 1s apart) polls; kill the pairing at threshold
      const abuse = sinceLast < RAPID_POLL_WINDOW_MS ? pairing.poll_abuse + 1 : pairing.poll_abuse;
      if (abuse >= POLL_ABUSE_KILL_AT) {
        await execute(`UPDATE pairings SET status = 'killed' WHERE id = $1 AND status = 'pending'`, [pairing.id]);
        await recordAttempt({ pairing_id: pairing.id, outcome: "killed_poll_abuse" });
        return json({ status: "killed" }, 200);
      }
      await execute(
        `UPDATE pairings SET poll_abuse = $2, last_polled_at = now(), poll_count = poll_count + 1 WHERE id = $1`,
        [pairing.id, abuse],
      ).catch(() => {});
      return json({ error: "slow_down", interval: pairing.interval_seconds }, 429, { "Retry-After": String(pairing.interval_seconds) });
    }

    // Normal pending poll
    await execute(
      `UPDATE pairings SET poll_count = poll_count + 1, poll_abuse = 0, last_polled_at = now() WHERE id = $1`,
      [pairing.id],
    ).catch(() => {});
    return json({ status: "authorization_pending", interval: pairing.interval_seconds });

  } catch (e) {
    console.error("pair-poll error:", e);
    return json({ error: "internal_error" }, 500);
  }
};
