// lib/pairing.ts — Device-flow pairing core (org-blind, human-approved)
// Codes: user_code = 6 chars unambiguous alphabet; device_code = 256-bit, stored hashed.
// Ladders: never lock running agents — only the pairing being attacked.

import { queryOne } from "./db.ts";

export const PAIRING_TTL_SECONDS = 600; // 10 minutes
export const PAIRING_POLL_INTERVAL = 2; // seconds
export const USER_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/1/I/L/O
export const USER_CODE_LENGTH = 6;

// ── Code generation ────────────────────────────────────────────────
export function generateUserCode(length = USER_CODE_LENGTH): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) out += USER_CODE_ALPHABET[bytes[i] % USER_CODE_ALPHABET.length];
  return out;
}

export function generateDeviceCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32)); // 256-bit
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Uppercase, strip separators, validate alphabet. Returns null if invalid. */
export function normalizeUserCode(input: string): string | null {
  const cleaned = (input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== USER_CODE_LENGTH) return null;
  for (const c of cleaned) {
    if (!USER_CODE_ALPHABET.includes(c)) return null;
  }
  return cleaned;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Client fingerprinting (privacy-preserving: salted hash) ────────
export async function clientIpHash(req: Request): Promise<string> {
  const ip =
    req.headers.get("x-nf-client-connection-ip") ??
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ??
    "unknown";
  const salt = Deno.env.get("PAIRING_HASH_SALT") ?? "memorify-pairing-v1";
  return await sha256Hex(`${salt}:${ip}`);
}

// ── Audit trail ────────────────────────────────────────────────────
export async function recordAttempt(a: {
  pairing_id?: string | null;
  user_id?: string | null;
  ip_hash?: string | null;
  fingerprint?: string | null;
  outcome: string;
}): Promise<void> {
  try {
    const { execute } = await import("./db.ts");
    await execute(
      `INSERT INTO pairing_attempts (pairing_id, user_id, ip_hash, fingerprint, outcome)
       VALUES ($1, $2, $3, $4, $5)`,
      [a.pairing_id ?? null, a.user_id ?? null, a.ip_hash ?? null, a.fingerprint ?? null, a.outcome],
    );
  } catch (e) {
    console.error("pairing recordAttempt failed:", e); // audit best-effort, never block
  }
}

// ── Ladders ────────────────────────────────────────────────────────
// Confirm endpoint is Clerk-authenticated, so misses ladder per USER (+IP as secondary).
// Rule: lock pairing, never running agents.
export type LadderVerdict = { blocked: true; retry_after: number; reason: string } | { blocked: false };

const USER_MISS_LADDER_1H: Array<{ misses: number; retryAfter: number }> = [
  { misses: 3, retryAfter: 60 },    // 1 min
  { misses: 6, retryAfter: 300 },   // 5 min
  { misses: 10, retryAfter: 1800 }, // 30 min
];
const USER_MISS_24H_FREEZE = { misses: 25, retryAfter: 3600 }; // 1h freeze + security event

export async function checkUserMissLadder(userId: string): Promise<LadderVerdict> {
  const hourRow = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM pairing_attempts
     WHERE user_id = $1 AND outcome = 'miss' AND created_at > now() - interval '1 hour'`,
    [userId],
  );
  const misses1h = hourRow?.n ?? 0;
  for (const step of USER_MISS_LADDER_1H) {
    if (misses1h >= step.misses) {
      return { blocked: true, retry_after: step.retryAfter, reason: "too_many_misses" };
    }
  }
  const dayRow = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM pairing_attempts
     WHERE user_id = $1 AND outcome = 'miss' AND created_at > now() - interval '24 hours'`,
    [userId],
  );
  if ((dayRow?.n ?? 0) >= USER_MISS_24H_FREEZE.misses) {
    // Tier 3: org-wide pairing freeze + notify (email hook wired at Resend step)
    await recordAttempt({ user_id: userId, outcome: "freeze_24h" }).catch(() => {});
    return { blocked: true, retry_after: USER_MISS_24H_FREEZE.retryAfter, reason: "pairing_frozen_24h_misses" };
  }
  return { blocked: false };
}

// Start endpoint is unauthenticated → ladder per IP hash.
export async function checkIpStartLadder(ipHash: string): Promise<LadderVerdict> {
  const hourRow = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM pairing_attempts
     WHERE ip_hash = $1 AND outcome = 'start' AND created_at > now() - interval '1 hour'`,
    [ipHash],
  );
  if ((hourRow?.n ?? 0) >= 10) {
    return { blocked: true, retry_after: 3600, reason: "too_many_starts_1h" };
  }
  const dayRow = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM pairing_attempts
     WHERE ip_hash = $1 AND outcome = 'start' AND created_at > now() - interval '24 hours'`,
    [ipHash],
  );
  if ((dayRow?.n ?? 0) >= 50) {
    return { blocked: true, retry_after: 86400, reason: "too_many_starts_24h" };
  }
  return { blocked: false };
}

// ── Scope defaults by agent kind ───────────────────────────────────
export function defaultScopesForKind(_kind: string): string[] {
  // MVP: full read/write set; tightened per-kind at the approval screen later
  return [
    "memory:read", "memory:write",
    "skills:read", "skills:write",
    "documents:read", "documents:write",
    "events:read", "events:write",
  ];
}
