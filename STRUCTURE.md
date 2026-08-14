# Memorify — single root

**Only path that matters:** `G:\memorify`

| Path | Status |
|------|--------|
| `G:\memorify` | **CANONICAL** — develop + deploy here |
| `G:\memorify_LEGACY_20260808` | Archive only (old m3morify / Lovable / `BACKUPS/`) |
| `G:\memorify-backend` / `*_LEFTOVER*` | **Do not use** — leftover after consolidation |
| `G:\memory-mcp` | **Not this product** (Claude Code Memory Engine) |

## Deploy

See **[RUNBOOK.md](./RUNBOOK.md)** (security-first).

```bash
cd G:/memorify
npm run build
netlify deploy --dir=dist --prod --no-build
```

Production: https://memorify.dev  
Site ID: `3b6ed5d9-2648-4dec-960c-8f9b05b1fe04`  
MCP: https://memorify.dev/mcp
