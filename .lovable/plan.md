
# Synapse — Finish-the-Dashboard Plan

Goal: zero placeholders, zero hardcoded mock data anywhere in `/dashboard/*`. Every widget, page and tab pulls live data, and every "Coming Soon" page becomes a real feature.

---

## Phase 1 — Analytics & Activity Pipeline (foundation)

This unlocks 4+ widgets at once. Without it, `AnalyticsWidget`, `SkillsResumeWidget`, `UsageWidget`, `RecentActivityWidget` and `PluginsSummaryWidget` stay fake forever.

**1.1 Create `agent_calls` table**
- Columns: `user_id`, `agent_id` (nullable), `kind` (`memory`/`skill`/`mcp`/`connector`/`api`), `name`, `status` (`ok`/`error`), `latency_ms`, `tokens_in`, `tokens_out`, `cost_cents`, `metadata jsonb`
- Index on `(user_id, created_at desc)` and `(user_id, kind, created_at desc)`
- RLS: own-row only

**1.2 Wire every backend touchpoint to log a call**
- `agent-gateway` — log every `agent.action`
- `agent-api` — log every action
- `synapse-mcp` / `agent-ping` MCP tool calls
- `skill-run` — log + tokens + cost
- `mcp-call` — log per tool invocation

**1.3 Replace fake widgets with real queries**
- `AnalyticsWidget` → 12-bucket time-series of `agent_calls` (last 12h)
- `SkillsResumeWidget` → `select name, count(*) from agent_calls where kind='skill' group by name order by count desc limit 4` + live status from `skills` table
- `UsageWidget` → real tokens / storage (sum of `documents.size`+`voices.size`+`images.size`) / requests
- `RecentActivityWidget` → query `events` table directly (already exists, 5-min fix)
- `PluginsSummaryWidget` → real `plugins` rows + their last activity from `agent_calls`
- `ProjectInfoWidget` → real plan info or remove until billing

---

## Phase 2 — Vault (real, no longer placeholder)

**2.1 `vault_secrets` table**
- `user_id`, `name` (unique per user), `value_encrypted` (bytea), `scope` (`dev`/`staging`/`prod`), `last_used_at`, `last_used_by_agent_id`, `metadata`
- Encrypt at rest using `pgsodium` or app-level AES-GCM with a project key from `LOVABLE_API_KEY`-derived KDF
- RLS: own-row only

**2.2 Vault edge function**
- `vault.set` / `vault.get` / `vault.list` / `vault.delete` / `vault.rotate`
- `vault.get` always logs a read into `events` (audit) and bumps `last_used_at`
- Never returns plaintext to client list views — only returns plaintext from explicit `vault.reveal` (gated)

**2.3 Vault UI** (`/dashboard/vault`)
- Drag-drop `.env` file → auto-imports all KEY=VALUE pairs (per Core memory: ultra easy)
- Single-field "name + value" inline add
- Per-row scope toggle, copy-reference button (`{{vault.MY_KEY}}`)
- Reveal requires re-confirm
- Audit log panel: who/when read each secret

**2.4 Wire vault references**
- `skills.prompt` and `connectors.config` resolve `{{vault.NAME}}` server-side at run time
- Never expose plaintext to the frontend during resolution

---

## Phase 3 — VPS Agent Runtime

The "no more Docker / no more GitHub Actions" solution.

**3.1 Agent runtime package**
- New folder `runtime/` (separate from web app) containing a tiny Deno/Node script: `synapse-agent.ts`
- Behavior: on start → `agent-api/bootstrap` → loop polling `agent-api/tasks` (long-poll 25s)
- Local tool execution sandbox (shell + whitelisted commands from agent's `skills`)
- Heartbeats every 30s → updates `agents.last_seen_at`

**3.2 One-line installer** served from edge function `install-agent`
```bash
curl -fsSL https://<project>.supabase.co/functions/v1/install-agent | SYNAPSE_TOKEN=xxx bash
```
- Drops `/etc/systemd/system/synapse-agent.service`
- Writes token to `/etc/synapse/agent.env` (chmod 600)
- `systemctl enable --now synapse-agent`

**3.3 Agents UI additions**
- New "VPS / Server" tab in agent connect wizard
- Shows the one-liner with token baked in
- Status pill turns green when first heartbeat arrives

**3.4 Task queue table `agent_tasks`**
- `agent_id`, `kind`, `payload`, `status` (`pending`/`running`/`done`/`error`), `result`, `claimed_at`
- RLS by user_id

---

## Phase 4 — Connector Handshakes (no more "create row, hope for the best")

For each connector kind, real auth + health check + tool discovery:

- **http** — ping URL, store latency, mark `active`/`error`
- **slack** — OAuth start/callback (already have OAuth infra from MCP), list channels
- **github** — PAT validation via `/user`, list repos
- **postgres** — connection string test, list tables
- **stripe** — key test via `/v1/account`
- **notion** — OAuth, list databases
- **gmail** — Google OAuth, scopes preview

Each connector kind gets a small drawer UI (per memory: one-click, drag-drop, AI-assisted) that:
- Auto-detects kind from pasted URL/token
- Shows live test result before saving
- Pulls the secret from Vault by reference (no raw secrets in `connectors.config`)

---

## Phase 5 — Per-Agent Analytics

- New widget `AgentLeaderboardWidget` (top agents by call volume / latency / errors)
- Agent detail drawer in `/dashboard/agents` showing:
  - 7-day call chart from `agent_calls`
  - Tools used breakdown
  - Memory growth over time
  - Recent errors

---

## Phase 6 — Skills & Plugins polish

- Skills page: real "calls" + "p95 latency" columns from `agent_calls`
- Plugin activity feed (per plugin) from `agent_calls`
- Skill cost preview before run (uses model pricing table)

---

## Phase 7 — Cleanup pass

- Delete `ComingSoon` component
- Delete all hardcoded arrays in `widgets/index.tsx`
- Add `data-testid` to widgets so QA can verify "no fake data left"
- Update README

---

## Suggested execution order

1. **Phase 1** (analytics pipeline) — biggest unlock
2. **Phase 2** (Vault) — needed before Phase 4
3. **Phase 3** (VPS agent) — your immediate pain point, standalone
4. **Phase 4** (connector handshakes) — depends on Vault
5. **Phase 5 + 6** (per-agent + skills polish) — depends on Phase 1
6. **Phase 7** (cleanup)

Phases 1, 2, 3 can be tackled in parallel sessions — they don't share files.

---

## Technical notes

- All new tables: RLS `auth.uid() = user_id`, `created_at`/`updated_at` defaults, `set_updated_at` trigger
- All new edge functions: `verify_jwt = false` + in-code JWT/agent-token validation (matches existing pattern)
- Vault encryption: app-level AES-GCM with key derived from `SUPABASE_SERVICE_ROLE_KEY` via HKDF — keeps secrets unreadable even from raw DB dump
- VPS runtime: Deno single-file binary, no Docker, no Node dep — `curl | bash` installs in <10s
- Analytics writes: fire-and-forget (`waitUntil` style) so they never block user-facing latency

Tell me which phase to start with and I'll build it out.
