# Memorify

AI agent motherboard — memory, tools, MCP, connectors.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vite + React + Clerk |
| Backend | Netlify Edge (Deno) |
| DB | Neon Postgres |
| Auth | Clerk (`Memorify_Hermes`) |
| Domain | https://memorify.dev |

## Repo layout

```
backend/              Deno API sources
netlify/edge-functions/   api.ts, mcp.ts
public/               static assets → CDN
src/                  React SPA
brand/                design source (optional)
docs/                 architecture notes
scripts/              one-off ops (not deployed)
dist/                 build output (gitignored) — deploy this
```

## Deploy (CLI only)

See **[RUNBOOK.md](./RUNBOOK.md)** for the full security-first checklist.

```bash
cd G:/memorify
npm ci
# VITE_* from .env (public keys only)
npm run build
netlify deploy --dir=dist --prod --no-build
```

Netlify site: `memorify-dev` (`3b6ed5d9-2648-4dec-960c-8f9b05b1fe04`)

## Removed / not used

- Neon + Netlify Edge API
- Lovable
- Deno Deploy
- `G:\memory-mcp` (different product — Claude Code memory engine)
