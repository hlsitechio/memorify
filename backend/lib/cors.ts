// lib/cors.ts — Shared CORS headers + Clerk auth helpers
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, mcp-protocol-version, accept, x-agent-token, x-workspace-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PATCH, DELETE",
};

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Clerk JWT verification (imported from clerk.ts)
import { verifyClerkJwt, extractBearer } from "./clerk.ts";
import { queryOne } from "./db.ts";

export interface AuthContext {
  user_id: string;
  workspace_id: string;
  email?: string;
  org_role?: string;
}

export async function requireAuth(req: Request): Promise<AuthContext | null> {
  const token = extractBearer(req);
  if (!token) return null;

  try {
    const claims = await verifyClerkJwt(token);
    if (!claims.org_id) return null; // No workspace context
    return {
      user_id: claims.sub,
      workspace_id: claims.org_id,
      email: claims.email,
      org_role: claims.org_role,
    };
  } catch {
    return null;
  }
}

// Optional: get workspace_id from various sources (query, header, claim)
export function getWorkspaceId(req: Request, auth: AuthContext | null): string | null {
  const url = new URL(req.url);
  return (
    url.searchParams.get("workspace_id") ||
    req.headers.get("x-workspace-id") ||
    auth?.workspace_id ||
    null
  );
}