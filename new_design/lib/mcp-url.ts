/**
 * Public MCP endpoint for agents (ChatGPT, Claude, Cursor, etc.).
 *
 * Production stack: GitHub → Netlify (Edge Functions, Deno runtime) → Neon.
 * MCP is a PATH on the same site (`/mcp`), never a separate Deno Deploy host.
 *
 * Canonical host is always https://memorify.dev — never a deploy-preview URL.
 * Optional override: VITE_MCP_URL.
 */
const CANONICAL_ORIGIN = "https://memorify.dev";

export function getMcpUrl(): string {
  const fromEnv = import.meta.env.VITE_MCP_URL as string | undefined;
  if (fromEnv && fromEnv.trim()) return fromEnv.replace(/\/$/, "");

  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin.replace(/\/$/, "");
    // Don't advertise ephemeral Netlify deploy-preview / branch URLs as MCP.
    if (
      origin.includes("--memorify-dev.netlify.app") ||
      origin.endsWith(".netlify.app")
    ) {
      return `${CANONICAL_ORIGIN}/mcp`;
    }
    return `${origin}/mcp`;
  }

  return `${CANONICAL_ORIGIN}/mcp`;
}
