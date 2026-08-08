# DEPRECATED — Cloudflare Worker MCP proxy

**Do not use.** Historical note only.

This doc described proxying `mcp.memorify.dev` → old Supabase edge functions  
and/or Deno Deploy. That path is **retired**.

## Current MCP endpoint

- Production: same site as the app, path **`/mcp`**
- Helper: `src/lib/mcp-url.ts` → `getMcpUrl()`
- Host: **Netlify Edge Function** `netlify/edge-functions/mcp.ts`
- DB: **Neon** via `NEON_DATABASE_URL`

See [ARCHITECTURE.md](../ARCHITECTURE.md) and [DENO_DEPLOY_RETIRE.md](./DENO_DEPLOY_RETIRE.md).
