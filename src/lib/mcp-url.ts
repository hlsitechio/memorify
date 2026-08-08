/**
 * Public MCP endpoint for agents (ChatGPT, Claude, Cursor, etc.).
 *
 * Production stack: GitHub → Netlify (Edge Functions, Deno runtime) → Neon.
 * MCP is a PATH on the same site (`/mcp`), never a separate Deno Deploy host.
 *
 * Optional override: VITE_MCP_URL (e.g. https://memorify.dev/mcp once DNS is live).
 */
export function getMcpUrl(): string {
  const fromEnv = import.meta.env.VITE_MCP_URL as string | undefined;
  if (fromEnv && fromEnv.trim()) return fromEnv.replace(/\/$/, "");

  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/mcp`;
  }

  // SSR / build-time fallback (Netlify production subdomain until custom DNS)
  return "https://memorify-dev.netlify.app/mcp";
}
