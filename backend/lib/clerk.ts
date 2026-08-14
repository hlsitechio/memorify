// lib/clerk.ts — Verify Clerk session JWT (Web Crypto only — Edge-safe, no npm/esm)
// SECURITY: RS256 signature + exp + iss. Fail closed.

type JWK = JsonWebKey & { kid?: string; alg?: string; kty: string };

type JWKS = { keys: JWK[] };

export type ClerkClaims = {
  sub: string;
  org_id?: string;
  org_role?: string;
  org_permissions?: string[];
  email?: string;
  session_id?: string;
  iat?: number;
  exp?: number;
  workspace_id?: string;    // Alias for org_id (some Clerk configs)
  agent_id?: string;        // Custom claim if set
};

let cachedJwks = new Map<string, { keys: JWK[]; fetchedAt: number }>();
const JWKS_TTL_MS = 60 * 60 * 1000;

function b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJsonPart(part: string): Record<string, unknown> {
  const text = new TextDecoder().decode(b64urlToBytes(part));
  return JSON.parse(text) as Record<string, unknown>;
}

function normalizeOrigin(value: string): string {
  return value.replace(/\/$/, "");
}

function decodePublishableKeyOrigin(key: string): string | null {
  try {
    const encoded = key.replace(/^pk_(test|live)_/, "").split("$")[0];
    if (!encoded) return null;
    const pad = "=".repeat((4 - (encoded.length % 4)) % 4);
    const decoded = atob((encoded + pad).replace(/-/g, "+").replace(/_/g, "/"))
      .replace(/\$$/, "")
      .trim();
    if (!decoded) return null;
    return normalizeOrigin(decoded.startsWith("http") ? decoded : `https://${decoded}`);
  } catch {
    return null;
  }
}

function configuredIssuers(): string[] {
  const envValues = [
    Deno.env.get("CLERK_FRONTEND_API_URL") ?? "",
    Deno.env.get("CLERK_ISSUER_URL") ?? "",
    Deno.env.get("VITE_CLERK_FRONTEND_API_URL") ?? "",
    decodePublishableKeyOrigin(Deno.env.get("VITE_CLERK_PUBLISHABLE_KEY") ?? ""),
    decodePublishableKeyOrigin(Deno.env.get("CLERK_PUBLISHABLE_KEY") ?? ""),
  ];
  return Array.from(new Set(envValues.filter(Boolean).map((v) => normalizeOrigin(String(v)))));
}

function isAllowedIssuer(issuer: string): boolean {
  const normalized = normalizeOrigin(issuer);
  const configured = configuredIssuers();
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

async function loadJwks(issuer: string): Promise<JWK[]> {
  const now = Date.now();
  const normalized = normalizeOrigin(issuer);
  const cached = cachedJwks.get(normalized);
  if (cached && now - cached.fetchedAt < JWKS_TTL_MS) {
    return cached.keys;
  }
  const res = await fetch(`${normalized}/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`jwks_fetch_failed:${res.status}`);
  const body = (await res.json()) as JWKS;
  if (!body.keys?.length) throw new Error("jwks_empty");
  cachedJwks.set(normalized, { keys: body.keys, fetchedAt: now });
  return body.keys;
}

export async function verifyClerkJwt(token: string): Promise<ClerkClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed_jwt");

  const [hB64, pB64, sB64] = parts;
  const header = decodeJsonPart(hB64);
  const payload = decodeJsonPart(pB64);

  if (header.alg !== "RS256") throw new Error("unsupported_alg");
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("missing_sub");

  const exp = payload.exp;
  if (typeof exp !== "number") throw new Error("missing_exp");
  if (Math.floor(Date.now() / 1000) >= exp) throw new Error("token_expired");

  const iss = payload.iss;
  if (typeof iss !== "string" || !isAllowedIssuer(iss)) {
    throw new Error("bad_issuer");
  }

  const keys = await loadJwks(iss);
  const kid = header.kid as string | undefined;
  const candidates = kid ? keys.filter((k) => k.kid === kid) : keys;
  if (!candidates.length) throw new Error("no_matching_jwk");

  const data = new TextEncoder().encode(`${hB64}.${pB64}`);
  const sig = b64urlToBytes(sB64);
  // Deno/TS BufferSource typing: pass underlying ArrayBuffer views explicitly
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
      if (
        await crypto.subtle.verify(
          "RSASSA-PKCS1-v1_5",
          key,
          sigView as BufferSource,
          dataView as BufferSource,
        )
      ) {
        ok = true;
        break;
      }
    } catch {
      // try next key
    }
  }
  if (!ok) throw new Error("bad_signature");

  const org = typeof payload.o === "object" && payload.o !== null
    ? (payload.o as Record<string, unknown>)
    : {};

  return {
      sub: payload.sub,
      org_id: typeof org.id === "string" ? org.id : (typeof payload.org_id === "string" ? payload.org_id : undefined),
      org_role: typeof org.rol === "string" ? org.rol : (typeof payload.org_role === "string" ? payload.org_role : undefined),
      org_permissions: Array.isArray(payload.org_permissions)
        ? (payload.org_permissions as string[])
        : undefined,
      email: typeof payload.email === "string" ? payload.email : undefined,
      session_id: typeof payload.sid === "string" ? payload.sid : undefined,
      iat: typeof payload.iat === "number" ? payload.iat : undefined,
      exp,
    };
}

export function extractBearer(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}
