// lib/agent-token.ts — Mint / verify / revoke Ed25519 JWT agent tokens
// Agent tokens are Ed25519-signed JWTs. Private key in NEON_JWT_PRIVATE_KEY (base64),
// public key in NEON_JWT_PUBLIC_KEY (base64).
// Format: mem_live_<base64url(jti)>.<base64url(payload)>.<base64url(sig)>
// Store only hash (SHA-256) in agent_tokens table.

import { query, queryOne, execute, withTransaction } from "./db.ts";
import {
  normalizeAccessLevel,
  type AccessLevel,
  isAccessLevel,
} from "./agent-access.ts";

const TOKEN_PREFIX = "mem_live_";

// ── Scope enum ────────────────────────────────────────────────────
export const VALID_SCOPES = [
  "memory:read",
  "memory:write",
  "skills:read",
  "skills:write",
  "documents:read",
  "documents:write",
  "events:read",
  "events:write",
  "workspace:admin",
  "tokens:admin",
] as const;

export type Scope = (typeof VALID_SCOPES)[number];

export function isValidScope(s: string): s is Scope {
  return VALID_SCOPES.includes(s as Scope);
}

export function validateScopes(scopes: string[]): { valid: Scope[]; invalid: string[] } {
  const valid: Scope[] = [];
  const invalid: string[] = [];
  for (const s of scopes) {
    if (isValidScope(s)) valid.push(s);
    else invalid.push(s);
  }
  return { valid, invalid };
}

// ── Rate limiting (in-memory, sliding window) ─────────────────────
// Max 100 tokens per workspace
const TOKEN_RATE_LIMIT = 100;
const tokenCounts = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(workspaceId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const windowMs = 60_000; // 1 minute sliding window
  const entry = tokenCounts.get(workspaceId);

  if (!entry || now - entry.windowStart >= windowMs) {
    tokenCounts.set(workspaceId, { count: 1, windowStart: now });
    return { allowed: true, remaining: TOKEN_RATE_LIMIT - 1 };
  }

  if (entry.count >= TOKEN_RATE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: TOKEN_RATE_LIMIT - entry.count };
}

// ── Key management ────────────────────────────────────────────────
function getPrivateKey(): Promise<CryptoKey | null> | null {
  const b64 = Deno.env.get("NEON_JWT_PRIVATE_KEY") ?? "";
  if (!b64) return null;
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    raw.buffer,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
}

function getPublicKey(): Promise<CryptoKey | null> | null {
  const b64 = Deno.env.get("NEON_JWT_PUBLIC_KEY") ?? "";
  if (!b64) return null;
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "raw",
    raw.buffer,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
}

// Lazy-loaded keys
let privateKeyPromise: Promise<CryptoKey | null> | null = null;
let publicKeyPromise: Promise<CryptoKey | null> | null = null;

async function getSigningKey(): Promise<CryptoKey | null> {
  if (!privateKeyPromise) {
    privateKeyPromise = getPrivateKey();
  }
  return privateKeyPromise;
}

async function getVerificationKey(): Promise<CryptoKey | null> {
  if (!publicKeyPromise) {
    publicKeyPromise = getPublicKey();
  }
  return publicKeyPromise;
}

// ── Base64URL encoding ────────────────────────────────────────────
function base64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// ── SHA-256 hash ──────────────────────────────────────────────────
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── JWT payload type ──────────────────────────────────────────────
export type AgentTokenPayload = {
  workspace_id: string;
  agent_id: string;
  name?: string;
  kind?: string;
  access_level?: AccessLevel;
  scopes: Scope[];
  exp: number;      // Unix timestamp (seconds)
  iat: number;      // Unix timestamp (seconds)
  jti: string;      // JWT ID
};

// ── Mint a new agent token ────────────────────────────────────────
export async function createAgentToken(params: {
  workspace_id: string;
  agent_id: string;
  scopes: Scope[];
  expiresInSeconds?: number; // default: 24 hours, 0 = never expires
}): Promise<{ token: string; jti: string; expiresAt: string | null }> {
  // Rate limit check
  const { allowed, remaining } = checkRateLimit(params.workspace_id);
  if (!allowed) {
    throw new Error(`Rate limit exceeded: max ${TOKEN_RATE_LIMIT} tokens per workspace per minute`);
  }

  // Validate scopes
  const { valid, invalid } = validateScopes(params.scopes);
  if (invalid.length > 0) {
    throw new Error(`Invalid scopes: ${invalid.join(", ")}`);
  }
  if (valid.length === 0) {
    throw new Error("At least one valid scope required");
  }

  // Verify agent exists and belongs to workspace
  const agent = await queryOne<{ id: string; workspace_id: string }>(
    `SELECT id, workspace_id FROM agents WHERE id = $1 AND workspace_id = $2`,
    [params.agent_id, params.workspace_id],
  );
  if (!agent) {
    throw new Error("Agent not found in workspace");
  }

  const signingKey = await getSigningKey();
  if (!signingKey) {
    throw new Error("NEON_JWT_PRIVATE_KEY not configured");
  }

  const jti = crypto.randomUUID();
  const iat = Math.floor(Date.now() / 1000);
  const exp = params.expiresInSeconds === 0 ? 0 : iat + (params.expiresInSeconds ?? 86_400); // 24h default

  const payload: AgentTokenPayload = {
    workspace_id: params.workspace_id,
    agent_id: params.agent_id,
    scopes: valid,
    exp,
    iat,
    jti,
  };

  // Encode payload. The token's first segment is the jti, so sign jti.payload.
  const payloadB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${jti}.${payloadB64}`;

  // Sign
  const sig = await crypto.subtle.sign(
    { name: "Ed25519" },
    signingKey,
    new TextEncoder().encode(signingInput),
  );
  const sigB64 = base64urlEncode(new Uint8Array(sig));

  const token = `${TOKEN_PREFIX}${jti}.${payloadB64}.${sigB64}`;
  const tokenHash = await sha256Hex(token);

  // Store in DB
  await execute(
    `INSERT INTO agent_tokens (workspace_id, agent_id, jti, token_hash, scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.workspace_id,
      params.agent_id,
      jti,
      tokenHash,
      valid,
      exp > 0 ? new Date(exp * 1000).toISOString() : null,
    ],
  );

  // Audit log
  await execute(
    `INSERT INTO audit_log (workspace_id, agent_id, action, resource, metadata)
     VALUES ($1, $2, 'token.mint', $3, $4)`,
    [
      params.workspace_id,
      params.agent_id,
      jti,
      JSON.stringify({ scopes: valid, expires_at: exp > 0 ? new Date(exp * 1000).toISOString() : null }),
    ],
  ).catch(() => {});

  return {
    token,
    jti,
    expiresAt: exp > 0 ? new Date(exp * 1000).toISOString() : null,
  };
}

// ── Verify agent token (checks revocation, expiry, signature) ─────
export async function verifyAgentToken(rawToken: string): Promise<AgentTokenPayload | null> {
  let token = rawToken;
  if (token.startsWith(TOKEN_PREFIX)) {
    token = token.slice(TOKEN_PREFIX.length);
  }

  // Parse token parts: jti.payload.sig
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [jti, payloadB64, sigB64] = parts;

  // Decode payload
  let payload: AgentTokenPayload;
  try {
    const payloadJson = new TextDecoder().decode(base64urlDecode(payloadB64));
    payload = JSON.parse(payloadJson);
  } catch {
    return null;
  }

  // Verify signature
  const verificationKey = await getVerificationKey();
  if (!verificationKey) return null;

  const signingInput = `${jti}.${payloadB64}`;
  const sig = base64urlDecode(sigB64);
  let valid = await crypto.subtle.verify(
    { name: "Ed25519" },
    verificationKey,
    sig as BufferSource,
    new TextEncoder().encode(signingInput),
  );

  // Compatibility for tokens minted by an earlier dashboard path that signed
  // header.payload while still serializing tokens as jti.payload.signature.
  if (!valid) {
    const legacyHeader = { alg: "EdDSA", typ: "JWT" };
    const legacyHeaderB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(legacyHeader)));
    valid = await crypto.subtle.verify(
      { name: "Ed25519" },
      verificationKey,
      sig as BufferSource,
      new TextEncoder().encode(`${legacyHeaderB64}.${payloadB64}`),
    );
  }
  if (!valid) {
    // Log auth failure to security_logs
    await execute(`
      INSERT INTO security_logs (workspace_id, event_type, payload, severity)
      VALUES ($1, 'auth_failure', $2, 'warning')
    `, [payload.workspace_id ?? null, JSON.stringify({ 
      reason: "invalid_signature", 
      jti: jti.slice(0, 12) + "..."
    })]).catch(() => {});
    return null;
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp > 0 && payload.exp < now) return null;

  // Check revocation in DB
  const tokenHash = await sha256Hex(rawToken);
  const strippedTokenHash = await sha256Hex(token);
  const tokenRow = await queryOne<{
    revoked_at: string | null;
    expires_at: string | null;
    scopes: string[];
    workspace_id: string;
    agent_id: string;
    name: string | null;
    kind: string | null;
    status: string | null;
    access_level: string | null;
  }>(
    `SELECT t.revoked_at, t.expires_at, t.scopes, t.workspace_id, t.agent_id,
            a.name, a.kind, a.status, a.access_level
     FROM agent_tokens t
     JOIN agents a ON a.id = t.agent_id AND a.workspace_id = t.workspace_id
     WHERE t.token_hash = $1 OR t.token_hash = $2
     ORDER BY CASE WHEN t.token_hash = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [tokenHash, strippedTokenHash],
  );

  if (!tokenRow) {
    // Log auth failure - token not found in DB
    await execute(`
      INSERT INTO security_logs (workspace_id, event_type, payload, severity)
      VALUES ($1, 'auth_failure', $2, 'warning')
    `, [payload.workspace_id ?? null, JSON.stringify({ 
      reason: "token_not_found", 
      jti: jti.slice(0, 12) + "..."
    })]).catch(() => {});
    return null;
  }
  if (tokenRow.revoked_at) {
    // Log auth failure - token revoked
    await execute(`
      INSERT INTO security_logs (workspace_id, event_type, payload, severity)
      VALUES ($1, 'auth_failure', $2, 'warning')
    `, [payload.workspace_id ?? null, JSON.stringify({ 
      reason: "token_revoked", 
      jti: jti.slice(0, 12) + "...",
      revoked_at: tokenRow.revoked_at
    })]).catch(() => {});
    return null;
  }
  if (tokenRow.status === "disconnected") {
    // Log auth failure - agent disconnected
    await execute(`
      INSERT INTO security_logs (workspace_id, event_type, payload, severity)
      VALUES ($1, 'auth_failure', $2, 'warning')
    `, [payload.workspace_id ?? null, JSON.stringify({ 
      reason: "agent_disconnected", 
      jti: jti.slice(0, 12) + "..."
    })]).catch(() => {});
    return null;
  }

  // Double-check expiry from DB (source of truth)
  if (tokenRow.expires_at) {
    const dbExp = new Date(tokenRow.expires_at).getTime() / 1000;
    if (dbExp < now) {
      // Log auth failure - token expired
      await execute(`
        INSERT INTO security_logs (workspace_id, event_type, payload, severity)
        VALUES ($1, 'auth_failure', $2, 'warning')
      `, [payload.workspace_id ?? null, JSON.stringify({ 
        reason: "token_expired", 
        jti: jti.slice(0, 12) + "...",
        expires_at: tokenRow.expires_at
      })]).catch(() => {});
      return null;
    }
  }

  // Update last_used_at and agent presence (fire and forget)
  execute(
    `UPDATE agent_tokens SET last_used_at = now() WHERE token_hash = $1`,
    [tokenHash],
  ).catch(() => {});
  execute(
    `UPDATE agents
     SET last_seen_at = now(), status = 'connected', updated_at = now()
     WHERE id = $1 AND workspace_id = $2`,
    [tokenRow.agent_id, tokenRow.workspace_id],
  ).catch(() => {});

  // Log successful auth
  await execute(`
    INSERT INTO security_logs (workspace_id, event_type, payload, severity)
    VALUES ($1, 'auth_success', $2, 'info')
  `, [tokenRow.workspace_id, JSON.stringify({ 
    agent_id: tokenRow.agent_id,
    access_level: tokenRow.access_level,
    scopes: tokenRow.scopes
  })]).catch(() => {});

  // Return payload with DB-validated scopes
  return {
    workspace_id: tokenRow.workspace_id,
    agent_id: tokenRow.agent_id,
    name: tokenRow.name ?? undefined,
    kind: tokenRow.kind ?? undefined,
    access_level: normalizeAccessLevel(tokenRow.access_level),
    scopes: tokenRow.scopes as Scope[],
    exp: payload.exp,
    iat: payload.iat,
    jti: payload.jti,
  };
}

// ── Revoke token(s) by jti or prefix ──────────────────────────────
export async function revokeAgentToken(params: {
  workspace_id: string;
  jti?: string;
  prefix?: string; // revoke all tokens with jti starting with prefix
}): Promise<number> {
  if (!params.jti && !params.prefix) {
    throw new Error("Either jti or prefix required");
  }

  let sql = `UPDATE agent_tokens SET revoked_at = now(), updated_at = now()
             WHERE workspace_id = $1`;
  const queryParams: unknown[] = [params.workspace_id];

  if (params.jti) {
    sql += ` AND jti = $2`;
    queryParams.push(params.jti);
  } else if (params.prefix) {
    sql += ` AND jti LIKE $2`;
    queryParams.push(`${params.prefix}%`);
  }

  const count = await execute(sql, queryParams);

  // Audit log
  if (params.jti) {
    await execute(
      `INSERT INTO audit_log (workspace_id, agent_id, action, resource, metadata)
       VALUES ($1, (SELECT agent_id FROM agent_tokens WHERE jti = $2 LIMIT 1), 'token.revoke', $2, $3)`,
      [params.workspace_id, params.jti, JSON.stringify({ reason: "manual_revoke" })],
    ).catch(() => {});
  } else if (params.prefix) {
    await execute(
      `INSERT INTO audit_log (workspace_id, agent_id, action, resource, metadata)
       VALUES ($1, NULL, 'token.revoke', $2, $3)`,
      [params.workspace_id, params.prefix, JSON.stringify({ reason: "prefix_revoke", prefix: params.prefix })],
    ).catch(() => {});
  }

  return count;
}

// ── List tokens for workspace ─────────────────────────────────────
export async function listAgentTokens(workspaceId: string) {
  return query<{
    id: string;
    agent_id: string;
    jti: string;
    scopes: string[];
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
    expires_at: string | null;
  }>(
    `SELECT id, agent_id, jti, scopes,
            created_at::text, last_used_at::text, revoked_at::text, expires_at::text
     FROM agent_tokens
     WHERE workspace_id = $1
     ORDER BY created_at DESC`,
    [workspaceId],
  );
}

// ── Check if token has required scope ─────────────────────────────
export function hasScope(payload: AgentTokenPayload, requiredScope: Scope): boolean {
  return payload.scopes.includes(requiredScope);
}

// ── Legacy agent token functions (for backward compatibility) ─────
export async function mintAgentToken(params: {
  workspace_id: string;
  user_id: string;
  name: string;
  kind?: string;
  access_level?: AccessLevel;
}): Promise<{ token: string; agent_id: string; access_level: AccessLevel }> {
  const kind = params.kind ?? "custom";
  const access_level = normalizeAccessLevel(params.access_level ?? "full");
  const agent_id = crypto.randomUUID();

  // Use simple query/execute (no NeonPool) for Edge compatibility
  const dummyTokenHash = "dev-dummy-" + crypto.randomUUID();
  await execute(
    `INSERT INTO agents (id, workspace_id, user_id, name, kind, status, access_level, token_hash, token_alg)
     VALUES ($1, $2, $3, $4, $5, 'connected', $6, $7, 'HS256')`,
    [agent_id, params.workspace_id, params.user_id, params.name, kind, access_level, dummyTokenHash],
  );

  // Create a legacy-style token with full scopes
  const { token } = await createAgentToken({
    workspace_id: params.workspace_id,
    agent_id,
    scopes: [...VALID_SCOPES],
    expiresInSeconds: 0, // never expires
  });

  return { token, agent_id, access_level };
}

export async function setAgentAccessLevel(
  agentId: string,
  workspaceId: string,
  level: AccessLevel,
): Promise<boolean> {
  if (!isAccessLevel(level)) return false;
  const n = await execute(
    `UPDATE agents SET access_level = $1, updated_at = now()
     WHERE id = $2 AND workspace_id = $3 AND status <> 'disconnected'`,
    [level, agentId, workspaceId],
  );
  return n > 0;
}

export async function listWorkspaceAgents(workspaceId: string) {
  return query<{
    id: string;
    workspace_id: string;
    name: string;
    kind: string;
    status: string;
    access_level: string;
    last_seen_at: string | null;
    created_at: string;
    user_id: string;
  }>(
    `SELECT id, workspace_id, name, kind, status, access_level,
            last_seen_at::text, created_at::text, user_id
     FROM agents
     WHERE workspace_id = $1
     ORDER BY created_at DESC`,
    [workspaceId],
  );
}

export async function revokeAgent(agentId: string): Promise<void> {
  await execute(`UPDATE agents SET status = 'disconnected' WHERE id = $1`, [agentId]);
}

export function isAgentToken(s: string): boolean {
  return s.startsWith(TOKEN_PREFIX);
}
