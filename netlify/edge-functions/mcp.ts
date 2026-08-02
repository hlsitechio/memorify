// Netlify Edge Function — replaces the (suspended) Deno Deploy proxy.
// Serves the Memorify MCP endpoint at /mcp by forwarding to the Supabase
// `memorify-mcp` function and injecting the anon apikey (which the Supabase
// gateway requires). The agent's own `Authorization: Bearer <token>` passes
// straight through, so auth is unchanged — clients only send their token.
const UPSTREAM = "https://qkgzetykzzsqgiqzlwsv.supabase.co/functions/v1/memorify-mcp";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFrZ3pldHlrenpzcWdpcXpsd3N2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNDU5MTMsImV4cCI6MjA5MzkyMTkxM30.Oc4f7fEhzKnd_TJSgRjkg8E26l-csIpV52WifwPjgaw";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, accept, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export default async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const subpath = url.pathname.replace(/^\/mcp/, ""); // /mcp and /mcp/* -> function root + subpath
  const target = UPSTREAM + subpath + url.search;

  const headers = new Headers(req.headers);
  headers.set("apikey", ANON);   // gateway requirement; the Deno proxy did this too
  headers.delete("host");

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
    redirect: "manual",
  });

  const respHeaders = new Headers(upstream.headers);
  for (const [k, v] of Object.entries(CORS)) respHeaders.set(k, v);
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
};

export const config = { path: ["/mcp", "/mcp/*"] };
