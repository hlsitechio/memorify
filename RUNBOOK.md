# Memorify RUNBOOK

**SECURITY FIRST** — above features and speed. Fail closed. Never put secrets in `VITE_*` or client bundles.

## Canonical path

| Path | Status |
|------|--------|
| **`G:\memorify`** | **ONLY** develop + deploy root |
| `G:\memorify_LEGACY_20260808` | Archive + `BACKUPS/` only |
| `G:\memorify-backend` | **Do not use** (leftover; quarantine if still present) |
| `G:\memory-mcp` | **Not Memorify** — Claude Code Memory Engine |

Production: https://memorify.dev  
Netlify site: `memorify-dev` · ID `3b6ed5d9-2648-4dec-960c-8f9b05b1fe04`  
MCP: https://memorify.dev/mcp (same-origin only)

---

## Identities (do not confuse)

| System | Correct |
|--------|---------|
| Clerk app | **Memorify_Hermes** `app_3HbD3y1Pw8PoIHxa7am9wOzI737` |
| Clerk Production | `ins_3HdmMe2SwKEa0pK2xN4ZYRKDrKF` · domain `memorify.dev` |
| Clerk Frontend API | `https://clerk.memorify.dev` |
| Clerk **wrong** app | My Application `app_3CYNbwz6…` — ignore / delete later |
| Neon | project `memorify` · `morning-river-80492210` · branch `production` |
| GitHub | `hlsitechio/memorify` (private) |

---

## Env model (security)

| Where | What |
|-------|------|
| Root `.env` (local, gitignored) | **Public only**: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_APP_URL`, `VITE_MCP_URL` |
| `backend/.env.local` (gitignored) | Secrets: `CLERK_SECRET_KEY`, `NEON_DATABASE_URL`, `MEMORIFY_AGENT_TOKEN_SECRET`, `CLERK_FRONTEND_API_URL` |
| Netlify env (production) | Same secrets + VITE_* for build if cloud-building |
| Browser bundle | Only `pk_…` after `npm run build` — never `sk_…` |

CLI deploy uploads **`dist/` + edge functions only** — not `.env`.

---

## Deploy (CLI preferred)

```bash
cd G:/memorify

# 1) Confirm public key is LIVE (not pk_test_) before build
grep VITE_CLERK_PUBLISHABLE_KEY .env

# 2) Build (bakes VITE_*)
npm run build

# 3) Deploy artifact only
netlify deploy --dir=dist --prod --no-build
```

**CLI log “Skipped”** for Build steps is **normal** with `--no-build`.

### Post-deploy security probes

```bash
curl -sS https://memorify.dev/api/health
# expect 200, endpoints include /api/bootstrap

curl -sS -X POST https://memorify.dev/api/bootstrap \
  -H "Content-Type: application/json" -d '{}'
# expect 401 missing_bearer

curl -sS -X POST https://memorify.dev/api/bootstrap \
  -H "Authorization: Bearer x.y.z" -H "Content-Type: application/json" -d '{}'
# expect 401 invalid_token
```

Do **not** ship if bootstrap accepts unauthenticated writes.

---

## DNS / SSL checklist

| Record | Expectation |
|--------|-------------|
| NS | `dns1–4.p04.nsone.net` (Netlify) |
| Apex A | `75.2.60.5` |
| www | CNAME → `memorify-dev.netlify.app` |
| clerk | CNAME → `frontend-api.clerk.services` |
| accounts | CNAME → `accounts.clerk.services` |
| clkmail / DKIM | Clerk mail targets |

Clerk Production Domains must show **Verified + SSL Issued** before relying on `pk_live_`.

---

## Auth / OAuth

- Google + GitHub: **Memorify_Hermes → Production → SSO**
- Callback always: `https://clerk.memorify.dev/v1/oauth_callback`
- GCP OAuth client: Web app “Memorify Web”; Google **Testing** needs test users until published
- Orgs: membership required; prefer **Create first organization automatically** to skip long Account Portal URLs

### GitHub Plugin OAuth

This is separate from Clerk SSO. It powers **Plugins → GitHub → Connect**.

- GitHub OAuth App callback: `https://memorify.dev/api/oauth/github/callback`
- Netlify env: `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`
- Optional Netlify env: `GITHUB_OAUTH_SCOPES`, `GITHUB_OAUTH_CALLBACK_URL`
- Tokens are exchanged server-side and stored encrypted in the GitHub connector config.

### Remote MCP OAuth

Remote MCP OAuth powers **MCP → OAuth providers → Connect**.

- Shared callback: `https://memorify.dev/api/mcp/oauth/callback`
- Env prefix: `MCP_OAUTH_<PROVIDER>_...`, where provider is the preset id uppercased with punctuation replaced by `_`
- Required: `MCP_OAUTH_<PROVIDER>_CLIENT_ID`, `MCP_OAUTH_<PROVIDER>_AUTHORIZE_URL`, `MCP_OAUTH_<PROVIDER>_TOKEN_URL`
- Optional: `MCP_OAUTH_<PROVIDER>_CLIENT_SECRET`, `MCP_OAUTH_<PROVIDER>_SCOPES`, `MCP_OAUTH_<PROVIDER>_RESOURCE`, `MCP_OAUTH_<PROVIDER>_CALLBACK_URL`
- After callback, Memorify stores the token encrypted, creates/updates the MCP server, runs `tools/list`, and caches tools.

---

## Agent access levels (Roles)

| Level | Gateway |
|-------|---------|
| `read` | list / recall / view / ping only |
| `write` | create & update only |
| `both` | read + write (no delete/admin) |
| `full` | everything (default for existing agents) |

- Column: `agents.access_level` (Neon) — **source of truth**, re-read every `/api/v1` call  
- UI: **Settings → Roles**  
- API: `GET/PATCH /api/agents` (Clerk JWT)  
- Denied: HTTP **403** with `agent_id`, `workspace_id`, `access_level`, `action`  

```sql
SELECT id, name, access_level, workspace_id FROM agents;
```



On first dashboard visit, SPA calls **`POST /api/bootstrap`** with Clerk session JWT.

Tables:

| Table | Meaning |
|-------|---------|
| `app_users` | Clerk `user_…` |
| `workspaces` | Clerk `org_…` |
| `workspace_members` | membership + role |
| `identity_events` | audit trail (user.upsert / workspace.upsert) |

```sql
SELECT id, email, full_name, last_seen_at FROM app_users ORDER BY last_seen_at DESC;
SELECT id, name, slug, created_by, created_at FROM workspaces;
SELECT * FROM workspace_members;
SELECT kind, user_id, workspace_id, payload, created_at
FROM identity_events ORDER BY created_at DESC LIMIT 30;
```

Push schema:

```bash
cd G:/memorify
# NEON_DATABASE_URL from backend/.env.local
deno task db:push
```

All app data tables scope by **`workspace_id` = Clerk org_id**. Auth SoT remains Clerk.

---

## Browser automation (admin)

- **Playwright MCP headed** + profile:  
  `%LOCALAPPDATA%\hermes\browser-profile-playwright`
- Use for Clerk / Netlify / GCP / Neon consoles
- Hermes preview pane is **not** agent-controllable
- Profile **default** only for Hubert ops — never touch **elisabeth** without explicit OK

---

## Slow is smooth (order of work)

1. DNS + SSL  
2. Clerk Production verified  
3. `pk_live_` build + deploy  
4. OAuth providers  
5. Neon schema + bootstrap  
6. Product features (dashboard off stubs)  

Do not thrash registrar + SPA features in the same thrash loop.

---

## Incident: wrong folder / wrong Clerk app

| Symptom | Check |
|---------|--------|
| Deploy looks empty / old | CWD must be `G:\memorify` |
| Development mode badge | Bundle still has `pk_test_` — rebuild with live key |
| Awaiting deployment in Clerk | You are on **My Application**, not Memorify_Hermes |
| Spinner forever | Clerk JS SSL / wrong publishable key |
| JSON parse HTML | Client still calling dead legacy backend URL |

---

## Related docs

- `ARCHITECTURE.md` — stack lock  
- `docs/DENO_DEPLOY_RETIRE.md` — no Deno Deploy  
- `SECURITY.md` — product security notes  
- `STRUCTURE.md` — path map  
