// Netlify Edge Function — POST /api/bootstrap-agent
// Creates an agent + mints a scoped token for the authenticated Clerk user
// Self-contained — no npm imports (Edge compatible)
// SECURITY: Clerk session JWT required (RS256 via Web Crypto). Fail closed.

import { neon } from "https://esm.sh/@neondatabase/serverless@0.10.0";

const BOOTSTRAP_VALID_SCOPES = [
  "memory:read", "memory:write", "skills:read", "skills:write",
  "documents:read", "documents:write", "events:read", "events:write",
  "workspace:admin", "tokens:admin"
];

const BOOTSTRAP_TOKEN_PREFIX = "mem_live_";
const BOOTSTRAP_AGENT_KINDS = new Set([
  "claude_code",
  "github_copilot",
  "openai_codex",
  "opencode",
  "cline",
  "kilo_code",
  "hermes",
  "openclaw",
  "pi",
  "custom",
]);

const BOOTSTRAP_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function bootstrap_getDsn(): string {
  let dsn = Deno.env.get("NEON_DATABASE_URL") ?? "";
  dsn = dsn.replace(/&channel_binding=require/g, "").replace(/\?&/, "?").replace(/&$/, "");
  return dsn;
}

function bootstrap_base64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function bootstrap_sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function bootstrap_getSigningKey(): Promise<CryptoKey | null> {
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

function bootstrap_b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bootstrap_decodeJsonPart(part: string): Record<string, unknown> {
  const text = new TextDecoder().decode(bootstrap_b64urlToBytes(part));
  return JSON.parse(text) as Record<string, unknown>;
}

function bootstrap_normalizeOrigin(value: string): string {
  return value.replace(/\/$/, "");
}

function bootstrap_decodePublishableKeyOrigin(key: string): string | null {
  try {
    const encoded = key.replace(/^pk_(test|live)_/, "").split("$")[0];
    if (!encoded) return null;
    const pad = "=".repeat((4 - (encoded.length % 4)) % 4);
    const decoded = atob((encoded + pad).replace(/-/g, "+").replace(/_/g, "/"))
      .replace(/\$$/, "")
      .trim();
    if (!decoded) return null;
    return bootstrap_normalizeOrigin(decoded.startsWith("http") ? decoded : `https://${decoded}`);
  } catch {
    return null;
  }
}

function bootstrap_configuredIssuers(): string[] {
  const envValues = [
    Deno.env.get("CLERK_FRONTEND_API_URL") ?? "",
    Deno.env.get("CLERK_ISSUER_URL") ?? "",
    Deno.env.get("VITE_CLERK_FRONTEND_API_URL") ?? "",
    bootstrap_decodePublishableKeyOrigin(Deno.env.get("VITE_CLERK_PUBLISHABLE_KEY") ?? ""),
    bootstrap_decodePublishableKeyOrigin(Deno.env.get("CLERK_PUBLISHABLE_KEY") ?? ""),
  ];
  return Array.from(new Set(envValues.filter(Boolean).map((v) => bootstrap_normalizeOrigin(String(v)))));
}

function bootstrap_isAllowedIssuer(issuer: string): boolean {
  const normalized = bootstrap_normalizeOrigin(issuer);
  const configured = bootstrap_configuredIssuers();
  if (configured.includes(normalized)) return true;

  try {
    const host = new URL(normalized).hostname;
    return (
      host.endsWith(".clerk.accounts.dev") ||
      host === "clerk.memorify.dev" ||
      host === "accounts.memorify.dev" ||
      host.endsWith(".memorify.dev")
    );
  } catch {
    return false;
  }
}

async function bootstrap_loadJwks(issuer: string): Promise<Record<string, unknown>[]> {
  const normalized = bootstrap_normalizeOrigin(issuer);
  const res = await fetch(`${normalized}/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`jwks_fetch_failed:${res.status}`);
  const body = (await res.json()) as { keys: Record<string, unknown>[] };
  return body.keys;
}

async function bootstrap_verifyClerkJwt(token: string): Promise<{
  sub: string;
  org_id?: string;
  org_role?: string;
  email?: string;
  full_name?: string;
  session_id?: string;
  iat?: number;
  exp?: number;
}> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed_jwt");

  const [hB64, pB64, sB64] = parts;
  const header = bootstrap_decodeJsonPart(hB64);
  const payload = bootstrap_decodeJsonPart(pB64);

  if (header.alg !== "RS256") throw new Error("unsupported_alg");
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("missing_sub");

  const exp = payload.exp;
  if (typeof exp !== "number") throw new Error("missing_exp");
  if (Math.floor(Date.now() / 1000) >= exp) throw new Error("token_expired");

  const iss = payload.iss;
  if (typeof iss !== "string" || !bootstrap_isAllowedIssuer(iss)) {
    throw new Error("bad_issuer");
  }

  const keys = await bootstrap_loadJwks(iss);
  const kid = header.kid as string | undefined;
  const candidates = kid ? keys.filter((k) => k.kid === kid) : keys;
  if (!candidates.length) throw new Error("no_matching_jwk");

  const data = new TextEncoder().encode(`${hB64}.${pB64}`);
  const sig = bootstrap_b64urlToBytes(sB64);
  const sigView = new Uint8Array(sig);
  const dataView = new Uint8Array(data);

  let ok = false;
  for (const jwk of candidates) {
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      if (await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sigView, dataView)) {
        ok = true;
        break;
      }
    } catch {}
  }
  if (!ok) throw new Error("bad_signature");

  const org = typeof payload.o === "object" && payload.o !== null
    ? (payload.o as Record<string, unknown>)
    : {};

  return {
    sub: payload.sub as string,
    org_id: typeof org.id === "string" ? org.id : (typeof payload.org_id === "string" ? payload.org_id : undefined),
    org_role: typeof org.rol === "string" ? org.rol : (typeof payload.org_role === "string" ? payload.org_role : undefined),
    email: typeof payload.email === "string" ? payload.email : undefined,
    full_name: typeof payload.name === "string" ? payload.name : undefined,
    session_id: typeof payload.sid === "string" ? payload.sid : undefined,
    iat: typeof payload.iat === "number" ? payload.iat : undefined,
    exp,
  };
}

function bootstrap_extractBearer(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

export default async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: BOOTSTRAP_CORS_HEADERS });
  }

  const token = bootstrap_extractBearer(req);
  if (!token) return bootstrap_json({ error: "missing_bearer" }, 401);

  let claims: Awaited<ReturnType<typeof bootstrap_verifyClerkJwt>>;
  try {
    claims = await bootstrap_verifyClerkJwt(token);
  } catch (e) {
    return bootstrap_json({ error: "invalid_token", detail: String((e as Error).message) }, 401);
  }

  if (req.method !== "POST") return bootstrap_json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const userId = claims.sub;
  const workspaceId = claims.org_id || (body.workspace_id as string) || "";
  const agentName = (body.agent_name as string) || `agent-${userId.slice(-8)}`;
  const accessLevel = (body.access_level as string) || "full";
  const requestedKind = typeof body.kind === "string" ? body.kind : "custom";
  const agentKind = BOOTSTRAP_AGENT_KINDS.has(requestedKind) ? requestedKind : "custom";

  if (!workspaceId) {
    return bootstrap_json({ error: "workspace_id required (no active Clerk org)" }, 400);
  }

  const sql = neon(bootstrap_getDsn());

  try {
    // Sync user + workspace
    await sql(
      `INSERT INTO app_users (id, email, full_name, last_seen_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (id) DO UPDATE SET email = COALESCE(EXCLUDED.email, app_users.email),
         full_name = COALESCE(EXCLUDED.full_name, app_users.full_name),
         last_seen_at = now(), updated_at = now()`,
      [userId, claims.email ?? null, claims.full_name ?? null],
    );

    await sql(
      `INSERT INTO workspaces (id, name, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
      [workspaceId, "My Workspace", userId],
    );

    await sql(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'org:admin')
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now()`,
      [workspaceId, userId],
    );

    // Create agent
    const agent_id = crypto.randomUUID();
    const dummyTokenHash = "dev-dummy-" + crypto.randomUUID();
    await sql(
      `INSERT INTO agents (id, workspace_id, user_id, name, kind, status, access_level, token_hash, token_alg)
       VALUES ($1, $2, $3, $4, $5, 'connected', $6, $7, 'HS256')`,
      [agent_id, workspaceId, userId, agentName, agentKind, accessLevel, dummyTokenHash],
    );

    // Create Ed25519 JWT token directly here
    const jti = crypto.randomUUID();
    const iat = Math.floor(Date.now() / 1000);
    const exp = 0; // never expires

    const payload = {
      workspace_id: workspaceId,
      agent_id,
      scopes: BOOTSTRAP_VALID_SCOPES,
      exp,
      iat,
      jti,
    };

    // Encode payload. The token's first segment is the jti, so sign jti.payload.
    const payloadB64 = bootstrap_base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
    const signingInput = `${jti}.${payloadB64}`;

    // Sign
    const signingKey = await bootstrap_getSigningKey();
    if (!signingKey) {
      return bootstrap_json({ error: "NEON_JWT_PRIVATE_KEY not configured" }, 500);
    }

    const sig = await crypto.subtle.sign(
      { name: "Ed25519" },
      signingKey,
      new TextEncoder().encode(signingInput),
    );
    const sigB64 = bootstrap_base64urlEncode(new Uint8Array(sig));

    const tokenStr = `${BOOTSTRAP_TOKEN_PREFIX}${jti}.${payloadB64}.${sigB64}`;
    const tokenHash = await bootstrap_sha256Hex(tokenStr);

    // Store in agent_tokens table
    await sql(
      `INSERT INTO agent_tokens (workspace_id, agent_id, jti, token_hash, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [workspaceId, agent_id, jti, tokenHash, BOOTSTRAP_VALID_SCOPES, null],
    );

    // Audit log
    await sql(
      `INSERT INTO audit_log (workspace_id, agent_id, action, resource, metadata)
       VALUES ($1, $2, 'token.mint', $3, $4)`,
      [
        workspaceId,
        agent_id,
        jti,
        JSON.stringify({ scopes: BOOTSTRAP_VALID_SCOPES, expires_at: null }),
      ],
    ).catch(() => {});

    return bootstrap_json({
      ok: true,
      agent: {
        id: agent_id,
        workspace_id: workspaceId,
        name: agentName,
        kind: agentKind,
        status: "connected",
        access_level: accessLevel,
        last_seen_at: null,
        created_at: new Date().toISOString(),
      },
      workspace_id: workspaceId,
      token: tokenStr,
      note: "Use this token as 'Authorization: Bearer <token>' for /mcp and /api/v1",
    });
  } catch (e) {
    console.error("bootstrap-agent error:", e);
    return bootstrap_json({ error: (e as Error).message }, 500);
  }
};

function bootstrap_json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...BOOTSTRAP_CORS_HEADERS, "Content-Type": "application/json" },
  });
}
