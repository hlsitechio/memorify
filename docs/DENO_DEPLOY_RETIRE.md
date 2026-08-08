# Retire Deno Deploy project `memorify1`

**Status:** Not used in production. Last deploy was ~83 days stale.  
**Prod backend:** Netlify Edge Functions + Neon.

## Why

Deno Deploy dashboard showed:

- Project: `memorify1`
- “Production URL”: `mcp.memorify.dev` ← wrong product shape (MCP must be a path)
- Public DNS: `mcp.memorify.dev` does not resolve (NXDOMAIN)

Production traffic is:

- `https://memorify-dev.netlify.app/api/*`
- `https://memorify-dev.netlify.app/mcp`

## Manual cleanup (console.deno.com)

You must do this in the browser (no deployctl token in this environment):

1. Open https://console.deno.com/hlsitechio/memorify1  
2. **Settings → Domains** — remove `mcp.memorify.dev` if listed  
3. **Settings → General** — **Delete project** or archive if available  
4. Confirm nothing else points agents at `mcp.memorify.dev`

## After cleanup

- UI/docs use same-origin `/mcp` via `src/lib/mcp-url.ts`
- Optional override: `VITE_MCP_URL=https://memorify.dev/mcp` (after DNS)
