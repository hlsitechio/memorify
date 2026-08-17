# Memorify — Backend Rebuild Brief

> **Status as of 2026-08-07:** Configuration done. Backend code not yet written.
> This is the handoff doc for any Hermes agent picking up the Memorify backend build.

## What happened

Full **Supabase exit** decision. Backend is being rebuilt from scratch on
**Deno Deploy + Neon Postgres**. The frontend (Vite + React + shadcn, on
Netlify at `memorify.dev`) is not being rewritten yet — only the backend.

All credentials are configured and verified live as of today.

## Architecture decisions (locked)

| Layer | Choice | Why |
|---|---|---|
| Runtime | **Deno Deploy** | Existing functions already Deno-shaped (`Deno.serve`, `Deno.env`) |
| Database | **Neon Postgres** | Existing schema is Postgres-shaped (tags `TEXT[]`, JSONB metadata, FK `CASCADE`). Chosen over Deno KV and Turso |
| Human auth | **Clerk** (Organizations = workspaces) | Magic links + OAuth, audited. `org:admin` / `org:member` RBAC maps to mint/revoke permissions |
| Agent tokens | **Self-rolled HMAC JWT** in Deno | Persistent, stable, hashed in Neon, revocable, never auto-rotate. Agent connects once → reuses forever |

## Product thesis (non-negotiable — MCP is the #1 feature)

Memorify's MCP is **NOT stdio**. It's an **HTTP-triggerable MCP gateway**:
JSON-RPC 2.0 over HTTP POST, `Accept: application/json+text/event-stream`.

An external MCP server is connected **once** via OAuth 2.1 (PKCE + RFC 7591
Dynamic Client Registration + RFC 9728 resource metadata). Memorify stores
the encrypted token. Then **any tool on that connected server** is callable
via a plain HTTP/curl POST.

Core endpoints: `POST /v1 {agent, action, input}` and `POST /mcp` for the
MCP protocol.

> **"Connect once, use all tools."**

Agent tokens never expire unless explicitly revoked.

## Environment quirk

`--env-file` flag in Deno splits the Neon DSN on `&` because the DSN has
`?sslmode=require&channel_binding=require` — it reads each `&`-separated
param as its own env var. Fix before running `test_conn.ts`:

- **Option A** — strip `&channel_binding=require` from the `NEON_DATABASE_URL`
  value in `.env.local`, OR
- **Option B** — read `.env.local` via `Deno.readTextFile(".env.local")`
  and parse manually instead of relying on `--env-file`.

After fixing, run `deno run --allow-net --allow-env --env-file=.env.local
backend/test_conn.ts` and confirm "Neon reachable" prints.

## Tool paths on this Windows machine

- **Deno:** `/c/Users/tab_Hub/.deno/bin/deno.exe` (2.9.5, NOT on bash PATH)
- **Repo:** `~/memorify` (cloned from `github.com/hlsitechio/memorify`)
- **Working dir for backend:** `~/memorify/backend/`
- **Secrets (gitignored, never committed):** `~/memorify/backend/.env.local`

## Credentials in `backend/.env.local` (all filled, gitignored)

| Var | Status | Notes |
|---|---|---|
| `CLERK_PUBLISHABLE_KEY` | ✓ 26 chars | `pk_test_…` — domain `perfect-wildcat-17.clerk.accounts.dev` |
| `CLERK_SECRET_KEY` | ✓ 51 chars | `sk_test_…` — server-only |
| `CLERK_FRONTEND_API_URL` | ✓ 45 chars | `https://perfect-wildcat-17.clerk.accounts.dev` — JWKS live (`kid: ins_3HbD41…`, RS256) |
| `NEON_DATABASE_URL` | ✓ 116 chars | `postgresql://…@ep-patient-fog-ay2gr5np-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require` |
| `MEMORIFY_AGENT_TOKEN_SECRET` | ✓ 64 chars | random hex, for HMAC-signing agent tokens |

## Legacy function port priorities

The `supabase/functions/` directory is kept as reference. New code lives in
`backend/`. Port priorities:

| Legacy function | New file | Priority |
|---|---|---|
| `agent-gateway` | `routes/v1.ts` | **highest** |
| `memorify-mcp` | `routes/mcp.ts` | **highest** |
| `mcp-handshake` | `routes/mcp-handshake.ts` | high |
| `mcp-call` | `routes/mcp-call.ts` | high |
| `mcp-oauth-start` | `routes/mcp-oauth-start.ts` | high |
| `mcp-oauth-callback` | `routes/mcp-oauth-callback.ts` | high |
| `agent-ping` / `agent-revoke` / `agent-api` | `routes/agent-*.ts` | med |
| `vault` | `routes/vault.ts` | med |
| `memory-suggest` | `routes/memory-suggest.ts` | med |
| `email-*`, `voice-summarize`, `image-generate`, `skill-*`, `copilot-action` | later | low |
| `_shared/{cors,rate-limit,redact,ssrf-guard}.ts` | `lib/` | high (port all 4) |

## Done / TODO

### Done
- [x] Auth approach decided (Clerk + self-rolled agent tokens)
- [x] DB picked (Neon) and project created
- [x] All 5 backend secrets written to `backend/.env.local`
- [x] Neon project created (`memorify`, US East 2 Ohio, Postgres 18, no Neon Auth)
- [x] JWKS endpoint confirmed live
- [x] `test_conn.ts` written (Neon smoke test)

### TODO (next steps)
1. Fix `--env-file` `&` parsing bug; confirm `test_conn.ts` prints "Neon reachable"
2. `backend/deno.json` — imports, tasks, lint config
3. `backend/db/schema.sql` — port core tables minus RLS / `auth.uid()` (auth moves to app layer, scope queries by `workspace_id` from verified Clerk JWT)
4. `backend/lib/clerk.ts` — verify Clerk session JWT against JWKS, extract `org_id` → `workspace_id`
5. `backend/lib/db.ts` — Neon pool
6. `backend/lib/agent-token.ts` — mint / verify / revoke HMAC tokens, store SHA-256 hash in Neon
7. `backend/routes/v1.ts` — `{agent, action, input}` HTTP gateway
8. `backend/routes/mcp.ts` — MCP protocol endpoint
9. `backend/routes/mcp-*.ts` — handshake, call, oauth-start, oauth-callback
10. Install `deployctl` (`deno install -Arf jsr:@deno/deployctl`)
11. Create Deno Deploy project, set 5 secrets via `deployctl secrets set`
12. Point a Deno Deploy domain at `gateway.memorify.dev`
13. Frontend phase — replace `src/integrations/supabase/` with `@clerk/clerk-react` + a Memorify API client

## The deeper thesis

The ultimate goal: **Memorify itself becomes the cross-device coordination
layer for our own agents.** Tablet, main PC, any machine — each Hermes agent
authenticates with a Memorify agent token and uses the Memorify `/v1` gateway
(memory.remember / memory.recall) to share build state, decisions, and TODOs.
We dogfood the product as our own ops layer. No separate infrastructure.

## Verification commands

```bash
cd ~/memorify/backend
DENO="/c/Users/tab_Hub/.deno/bin/deno.exe"
"$DENO" check .          # typecheck
"$DENO" lint .           # lint
"$DENO" test .           # run tests
"$DENO" run --allow-net --allow-env --env-file=.env.local test_conn.ts   # smoke Neon
```

**Build/test commands are NOT meaningful yet** — only `test_conn.ts` and the
env template exist. Run `deno check` / `lint` / `test` after the routing
code in step 7+ lands backend code for them to exercise.
