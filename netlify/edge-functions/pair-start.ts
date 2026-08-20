// netlify/edge-functions/pair-start.ts — POST /api/pair/start
// Device-flow entry point for agents. Org-blind: no workspace context exists yet.
// SECURITY: unauthenticated → IP-hash ladder (10/hour, 50/day → 429 + Retry-After).
//           Device code is 256-bit, returned ONCE, stored only as sha256 hash.

import { json } from "../../backend/lib/cors.ts";
import { queryOne, execute } from "../../backend/lib/db.ts";
import {
  generateDeviceCode,
  generateUserCode,
  sha256Hex,
  clientIpHash,
  checkIpStartLadder,
  recordAttempt,
  defaultScopesForKind,
  PAIRING_TTL_SECONDS,
  PAIRING_POLL_INTERVAL,
} from "../../backend/lib/pairing.ts";

const ALLOWED_KINDS = new Set([
  "claude_code", "github_copilot", "openai_codex", "opencode", "cline",
  "kilo_code", "hermes", "openclaw", "pi", "custom",
  // legacy kinds kept so existing agents keep validating
  "cursor", "claude_desktop", "chatgpt", "grok", "windsurf", "vscode", "zed",
]);

export default async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    const ipHash = await clientIpHash(req);

    // Ladder check BEFORE any write
    const verdict = await checkIpStartLadder(ipHash);
    if (verdict.blocked) {
      return json(
        { error: "rate_limited", reason: verdict.reason, retry_after: verdict.retry_after },
        429,
        { "Retry-After": String(verdict.retry_after) },
      );
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      body = {};
    }

    const agentName = typeof body.agent_name === "string"
      ? body.agent_name.trim().slice(0, 80)
      : "Unnamed agent";
    const agentKind = typeof body.agent_kind === "string" && ALLOWED_KINDS.has(body.agent_kind)
      ? body.agent_kind
      : "custom";
    const fingerprint = typeof body.fingerprint === "string"
      ? body.fingerprint.slice(0, 120)
      : null;

    // Ensure uniqueness of user_code among pending rows (retry loop)
    let userCode = "";
    for (let i = 0; i < 5; i++) {
      const candidate = generateUserCode();
      const clash = await queryOne<{ id: string }>(
        `SELECT id FROM pairings WHERE user_code = $1 AND status = 'pending' AND expires_at > now() LIMIT 1`,
        [candidate],
      );
      if (!clash) {
        userCode = candidate;
        break;
      }
    }
    if (!userCode) return json({ error: "code_generation_failed" }, 500);

    const deviceCode = await generateDeviceCode();
    const deviceCodeHash = await sha256Hex(deviceCode);

    await execute(
      `INSERT INTO pairings (user_code, device_code_hash, agent_name, agent_kind, requested_scopes, fingerprint, ip_hash, interval_seconds, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '${PAIRING_TTL_SECONDS} seconds')`,
      [userCode, deviceCodeHash, agentName, agentKind, defaultScopesForKind(agentKind), fingerprint, ipHash, PAIRING_POLL_INTERVAL],
    );

    await recordAttempt({ ip_hash: ipHash, fingerprint, outcome: "start" });

    return json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: "https://memorify.dev/pair",
      expires_in: PAIRING_TTL_SECONDS,
      interval: PAIRING_POLL_INTERVAL,
    });
  } catch (e) {
    console.error("pair-start error:", e);
    return json({ error: "internal_error" }, 500);
  }
};
