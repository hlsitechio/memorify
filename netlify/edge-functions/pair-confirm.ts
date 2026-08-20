// netlify/edge-functions/pair-confirm.ts — POST /api/pair/confirm
// The HUMAN side: enter code at memorify.dev/pair, see who's asking, pick the org, approve/deny.
// SECURITY: Clerk-authenticated (fail closed). Pairing is org-blind until approval —
//           the human chooses which workspace the agent joins.
// Miss ladder (per authenticated user): 3/hr→60s, 6/hr→300s, 10/hr→30min, 25/24h→1h freeze.
// Generic errors — never reveal whether a code exists.

import { json } from "../../backend/lib/cors.ts";
import { queryOne, execute } from "../../backend/lib/db.ts";
import { verifyClerkJwt, extractBearer } from "../../backend/lib/clerk.ts";
import {
  normalizeUserCode,
  clientIpHash,
  checkUserMissLadder,
  recordAttempt,
} from "../../backend/lib/pairing.ts";

const CLERK_SECRET_KEY = Deno.env.get("CLERK_SECRET_KEY") ?? "";

type PendingPairing = {
  id: string;
  agent_name: string | null;
  agent_kind: string | null;
  requested_scopes: string[] | null;
  fingerprint: string | null;
  created_at: string;
  expires_at: string;
};

async function findPending(userCode: string): Promise<PendingPairing | null> {
  return await queryOne<PendingPairing>(
    `SELECT id, agent_name, agent_kind, requested_scopes, fingerprint, created_at::text, expires_at::text
     FROM pairings
     WHERE user_code = $1 AND status = 'pending' AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [userCode],
  );
}

/** Verify the approver actually belongs to the Clerk org they selected. Fail closed.
 *  VERIFIED LIVE: GET api.clerk.com/v1/organizations/{org}/memberships?user_id={uid} → { data: [...] }
 *  Fallback on Clerk API ambiguity: workspace_members row in Neon (synced by useNeonBootstrap). */
async function userInOrg(userId: string, orgId: string): Promise<boolean> {
  if (!CLERK_SECRET_KEY) return false;
  try {
    const res = await fetch(
      `https://api.clerk.com/v1/organizations/${encodeURIComponent(orgId)}/memberships?user_id=${encodeURIComponent(userId)}&limit=1`,
      { headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` } },
    );
    if (res.ok) {
      const body = await res.json();
      const list = Array.isArray(body) ? body : (body.data ?? []);
      return Array.isArray(list) && list.length > 0;
    }
    if (res.status === 404) return false;
    // Network/auth ambiguity → fall through to Neon check rather than hard-failing humans
  } catch {
    // fall through
  }
  try {
    const row = await queryOne<{ user_id: string }>(
      `SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 LIMIT 1`,
      [orgId, userId],
    );
    return !!row;
  } catch {
    return false;
  }
}

export default async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    // 1) Fail closed on auth
    const token = extractBearer(req);
    if (!token) return json({ error: "unauthorized" }, 401);
    let userId: string;
    let userEmail: string | undefined;
    try {
      const claims = await verifyClerkJwt(token);
      userId = claims.sub;
      userEmail = claims.email;
    } catch {
      return json({ error: "unauthorized" }, 401);
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return json({ error: "invalid_request" }, 400);
    }

    const rawCode = typeof body.code === "string" ? body.code : "";
    const action = body.action === "decide" ? "decide" : "lookup";
    const ipHash = await clientIpHash(req);

    // 2) Ladder check BEFORE code evaluation
    const verdict = await checkUserMissLadder(userId);
    if (verdict.blocked) {
      await recordAttempt({ user_id: userId, ip_hash: ipHash, outcome: "ladder_block:" + verdict.reason });
      return json(
        { error: "rate_limited", reason: verdict.reason, retry_after: verdict.retry_after },
        429,
        { "Retry-After": String(verdict.retry_after) },
      );
    }

    // 3) Normalize + find pending pairing
    const code = normalizeUserCode(rawCode);
    if (!code) {
      return json({ error: "invalid_code", error_description: "codes are 6 characters (letters and digits)" }, 400);
    }
    const pairing = await findPending(code);

    if (!pairing) {
      // MISS — record + generic response. Attacker learns nothing about code existence.
      await recordAttempt({ user_id: userId, ip_hash: ipHash, outcome: "miss" });
      return json({ error: "code_not_found" }, 404);
    }

    // 4) LOOKUP — show the human who's asking (reveal only what code-holders could know)
    if (action === "lookup") {
      await recordAttempt({ pairing_id: pairing.id, user_id: userId, ip_hash: ipHash, outcome: "lookup_ok" });
      return json({
        ok: true,
        pairing: {
          agent_name: pairing.agent_name,
          agent_kind: pairing.agent_kind,
          requested_scopes: pairing.requested_scopes ?? [],
          fingerprint: pairing.fingerprint,
          created_at: pairing.created_at,
          expires_at: pairing.expires_at,
        },
      });
    }

    // 5) DECIDE — approve or deny. Human picks the org here (org-blind until this moment).
    const decision = body.decision === "approve" ? "approve" : body.decision === "deny" ? "deny" : null;
    if (!decision) return json({ error: "invalid_request", error_description: "decision must be approve|deny" }, 400);

    if (decision === "deny") {
      const n = await execute(
        `UPDATE pairings SET status = 'denied', completed_at = now()
         WHERE id = $1 AND status = 'pending'`,
        [pairing.id],
      );
      if (n === 0) return json({ error: "code_not_found" }, 404);
      await recordAttempt({ pairing_id: pairing.id, user_id: userId, ip_hash: ipHash, outcome: "denied" });
      await execute(
        `INSERT INTO audit_log (workspace_id, agent_id, action, resource, metadata)
         VALUES (NULL, NULL, 'pairing.deny', $1, $2)`,
        [pairing.id, JSON.stringify({ user_id: userId })],
      ).catch(() => {});
      return json({ ok: true, status: "denied" });
    }

    // APPROVE
    const orgId = typeof body.org_id === "string" ? body.org_id.trim() : "";
    if (!orgId || !/^org_[A-Za-z0-9]+$/.test(orgId)) {
      return json({ error: "invalid_request", error_description: "org_id required" }, 400);
    }

    // Membership check — fail closed. Humans can only pair into orgs they belong to.
    if (!(await userInOrg(userId, orgId))) {
      await recordAttempt({ pairing_id: pairing.id, user_id: userId, ip_hash: ipHash, outcome: "approve_denied_not_member" });
      return json({ error: "not_an_org_member" }, 403);
    }

    // Ensure the approver's app_users row exists (FK target for workspaces/members/agents).
    // /pair is a standalone route — useNeonBootstrap may never have run for this user.
    await execute(
      `INSERT INTO app_users (id, email, last_seen_at)
       VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET email = COALESCE(EXCLUDED.email, app_users.email),
         last_seen_at = now(), updated_at = now()`,
      [userId, userEmail ?? null],
    );

    // Ensure the workspace row exists + approver is a member (mirror bootstrap-agent)
    const org = await queryOne<{ name: string | null }>(
      `SELECT name FROM workspaces WHERE id = $1`,
      [orgId],
    );
    await execute(
      `INSERT INTO workspaces (id, name, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
      [orgId, org?.name ?? "Workspace", userId],
    );
    await execute(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'org:admin')
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET updated_at = now()`,
      [orgId, userId],
    );

    // Create the agent row (pending until the agent polls and the token is minted)
    const agentId = crypto.randomUUID();
    await execute(
      `INSERT INTO agents (id, workspace_id, user_id, name, kind, status, access_level, token_hash, token_alg)
       VALUES ($1, $2, $3, $4, $5, 'pending', 'full', $6, 'HS256')`,
      [agentId, orgId, userId, pairing.agent_name ?? "Paired agent", pairing.agent_kind ?? "custom", "dev-dummy-" + crypto.randomUUID()],
    );

    // Atomic pending → approved (guards double-click / race)
    const claimed = await queryOne<{ id: string }>(
      `UPDATE pairings SET status = 'approved', org_id = $2, agent_id = $3, approved_by = $4, approved_at = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [pairing.id, orgId, agentId, userId],
    );
    if (!claimed) {
      // Lost the race — roll back the agent row
      await execute(`DELETE FROM agents WHERE id = $1`, [agentId]).catch(() => {});
      return json({ error: "code_not_found" }, 404);
    }

    await recordAttempt({ pairing_id: pairing.id, user_id: userId, ip_hash: ipHash, outcome: "approved" });
    await execute(
      `INSERT INTO audit_log (workspace_id, agent_id, action, resource, metadata)
       VALUES ($1, $2, 'pairing.approve', $3, $4)`,
      [orgId, agentId, pairing.id, JSON.stringify({ approved_by: userId, agent_kind: pairing.agent_kind })],
    ).catch(() => {});

    return json({
      ok: true,
      status: "approved",
      agent_id: agentId,
      workspace_id: orgId,
      note: "Agent will receive its token on next poll",
    });

  } catch (e) {
    console.error("pair-confirm error:", e);
    return json({ error: "internal_error" }, 500);
  }
};
