// Shared CORS helper for edge functions.
// Allows the public Memorify origins + localhost dev. Wildcard fallback for
// truly public endpoints (use sparingly).

const ALLOWED_ORIGINS = new Set([
  "https://memorify.dev",
  "https://www.memorify.dev",
  "https://memorify1.lovable.app",
]);

function isAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // lovable preview subdomains + localhost dev
  return (
    /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.lovable\.dev$/.test(origin) ||
    /^http:\/\/localhost(:\d+)?$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
  );
}

export function corsHeadersFor(req: Request, opts: { public?: boolean } = {}): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowOrigin = isAllowed(origin) ? origin! : (opts.public ? "*" : "https://memorify.dev");
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-vault-unlock, x-agent-token",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
  };
}

export function handlePreflight(req: Request, opts: { public?: boolean } = {}): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { headers: corsHeadersFor(req, opts) });
}

// Legacy wildcard for backwards compat — prefer corsHeadersFor()
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-vault-unlock, x-agent-token",
};
