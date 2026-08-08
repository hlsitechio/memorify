// lib/clerk.ts — Verify Clerk session JWT against JWKS
// Clerk uses RS256. We fetch the JWKS from Clerk's Frontend API and verify
// the JWT signature + claims (exp, iss, org_id).
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.10.0";

const CLERK_FRONTEND_API = Deno.env.get("CLERK_FRONTEND_API_URL") ?? "";
const CLERK_ISSUER = CLERK_FRONTEND_API;

// Cache the JWKS — Clerk's keys rotate rarely
const JWKS = createRemoteJWKSet(new URL(`${CLERK_FRONTEND_API}/.well-known/jwks.json`));

export type ClerkClaims = {
  sub: string;          // Clerk user ID
  org_id?: string;       // Clerk org ID (workspace)
  org_role?: string;     // org:admin | org:member
  org_permissions?: string[];
  email?: string;
  session_id?: string;
  iat?: number;
  exp?: number;
};

export async function verifyClerkJwt(token: string): Promise<ClerkClaims> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: CLERK_ISSUER,
    audience: undefined, // Clerk doesn't set aud by default
  });

  return {
    sub: payload.sub as string,
    org_id: (payload as Record<string, unknown>)["org_id"] as string | undefined,
    org_role: (payload as Record<string, unknown>)["org_role"] as string | undefined,
    org_permissions: (payload as Record<string, unknown>)["org_permissions"] as string[] | undefined,
    email: (payload as Record<string, unknown>)["email"] as string | undefined,
    session_id: payload.sid as string | undefined,
    iat: payload.iat,
    exp: payload.exp,
  };
}

export function extractBearer(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}