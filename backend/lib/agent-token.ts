// lib/agent-token.ts — Mint / verify / revoke HMAC JWT agent tokens
// Agent tokens are self-rolled HS256 JWTs signed with MEMORIFY_AGENT_TOKEN_SECRET.
// They never expire unless explicitly revoked (hash stored in agents table).
// Format: mem_live_<base64url-jwt>

import { SignJWT, jwtVerify, type JWTPayload } from "https://esm.sh/jose@5.10.0";
import { query, queryOne, execute } from "./db.ts";

const SECRET = () => new TextEncoder().encode(Deno.env.get("MEMORIFY_AGENT_TOKEN_SECRET") ?? "");
export const TOKEN_PREFIX = "mem_live_";

export type AgentTokenPayload = {
  agent_id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  kind: string;
  iat: number;
};

// ── Hash a token (SHA-256 hex) for storage ──
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Mint a new agent token ──
export async function mintAgentToken(params: {
  workspace_id: string;
  user_id: string;
  name: string;
  kind?: string;
}): Promise<string> {
  const kind = params.kind ?? "custom";
  const agent_id = crypto.randomUUID();

  const jwt = await new SignJWT({
    agent_id,
    workspace_id: params.workspace_id,
    user_id: params.user_id,
    name: params.name,
    kind,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("memorify")
    .setSubject(agent_id)
    .sign(SECRET());

  const token = TOKEN_PREFIX + jwt;
  const tokenHash = await sha256Hex(token);

  // Store agent in DB with hash (not the raw token)
  await query(
    `INSERT INTO agents (id, workspace_id, user_id, name, kind, status, token_hash, token_alg)
     VALUES ($1, $2, $3, $4, $5, 'connected', $6, 'HS256')`,
    [agent_id, params.workspace_id, params.user_id, params.name, kind, tokenHash],
  );

  return token;
}

// ── Verify a raw token string ──
export async function verifyAgentToken(rawToken: string): Promise<AgentTokenPayload | null> {
  // Strip prefix
  let jwt = rawToken;
  if (jwt.startsWith(TOKEN_PREFIX)) {
    jwt = jwt.slice(TOKEN_PREFIX.length);
  }

  try {
    const { payload } = await jwtVerify(jwt, SECRET(), {
      issuer: "memorify",
    });

    const agentId = (payload as JWTPayload & { agent_id?: string }).agent_id ?? payload.sub ?? "";
    const workspace_id = (payload as JWTPayload & { workspace_id?: string }).workspace_id ?? "";
    const user_id = (payload as JWTPayload & { user_id?: string }).user_id ?? "";
    const name = (payload as JWTPayload & { name?: string }).name ?? "";
    const kind = (payload as JWTPayload & { kind?: string }).kind ?? "custom";

    // Verify the token hash exists in DB (not revoked)
    const tokenHash = await sha256Hex(rawToken);
    const agent = await queryOne<{ id: string; status: string }>(
      `SELECT id, status FROM agents WHERE token_hash = $1`,
      [tokenHash],
    );

    if (!agent || agent.status === "disconnected") return null;

    // Bump last_seen_at (fire-and-forget)
    execute(
      `UPDATE agents SET last_seen_at = now() WHERE id = $1`,
      [agentId],
    ).catch(() => {});

    return {
      agent_id: agentId,
      workspace_id,
      user_id,
      name,
      kind,
      iat: payload.iat ?? 0,
    };
  } catch {
    return null;
  }
}

// ── Revoke an agent token (by agent_id) ──
export async function revokeAgent(agentId: string): Promise<void> {
  await execute(
    `UPDATE agents SET status = 'disconnected' WHERE id = $1`,
    [agentId],
  );
}

// ── Check if a raw string looks like an agent token ──
export function isAgentToken(s: string): boolean {
  return s.startsWith(TOKEN_PREFIX);
}