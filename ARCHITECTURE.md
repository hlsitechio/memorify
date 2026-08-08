# Memorify architecture (canonical)

**Decision (2026-08-08):** GitHub + Netlify + Neon.  
Deno Deploy is **retired**. Deno remains only as the **Netlify Edge Functions** runtime.

## Stack

```text
GitHub (hlsitechio/memorify, private)
        │
        ▼  CLI / git build
Netlify site: memorify-dev  (id 3b6ed5d9-2648-4dec-960c-8f9b05b1fe04)
├── Frontend     Vite SPA → dist/
├── /api/*       Edge Function `api`   (Deno runtime)
├── /mcp         Edge Function `mcp`   (Deno runtime)
└── Env          NEON_DATABASE_URL, CLERK_*, MEMORIFY_AGENT_TOKEN_SECRET
        │
        ▼
Neon Postgres (connection string only — not Netlify Database extension)
```

## URLs

| Role | URL |
|------|-----|
| Working site today | `https://memorify-dev.netlify.app` |
| MCP (path, not product host) | `https://memorify-dev.netlify.app/mcp` |
| Custom domain (after name.com NS → Netlify) | `https://memorify.dev` + `/mcp` |
| **Do not use** | Deno Deploy `memorify1`, `https://mcp.memorify.dev` |

## Code layout

| Path | Role |
|------|------|
| `src/` | React SPA |
| `backend/` | Shared Deno library (routes, db, auth) |
| `backend/main.ts` | **Local-only** `Deno.serve` for offline dev |
| `netlify/edge-functions/` | Production entries (`api.ts`, `mcp.ts`) |
| `backend/db/schema.sql` | Neon schema |

## Explicitly not in prod path

- Deno Deploy project `hlsitechio/memorify1` (stale; archive in console.deno.com)
- `@netlify/database` / `npx netlify db init` (breaks builds; use `NEON_DATABASE_URL`)
- Supabase / Lovable (removed)

## Local commands

```bash
# Frontend
npm install && npm run dev

# Backend library checks
deno task check && deno task lint

# Optional local Deno server (parity helper)
deno task dev

# Preferred full stack local
netlify dev

# Production deploy (CLI preferred)
node node_modules/vite/bin/vite.js build
netlify deploy --prod --dir=dist --no-build
```

## DNS (custom domain)

Canonical Netlify DNS records: see backup / `Netlify_DNS` CSV.  
Nameservers at name.com must become:

- `dns1.p04.nsone.net`
- `dns2.p04.nsone.net`
- `dns3.p04.nsone.net`
- `dns4.p04.nsone.net`
