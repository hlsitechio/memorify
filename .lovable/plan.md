# Landing Page Reality Audit

Goal: every claim on memorify.dev maps to something that actually works today. Aspirational features get rephrased as "coming" or removed.

## What IS real (keep, lean into)

- **Self-hosted backend at `api.memorify.dev`** — Supabase + Express, 21 tables, 17 routes
- **Memory primitive** — `memories`, `memory_versions`, `/agent-api`, `/memory-suggest` ✅
- **Documents / Voices / Images** — tables + routes (`/voice-summarize`, `/image-generate`) ✅
- **Skills** — `skills` table + `/skill-run` ✅
- **MCP server (outbound)** — `/synapse-mcp` JSON-RPC, agents can call us ✅
- **MCP client (inbound)** — `mcp_servers`, `/mcp-handshake`, `/mcp-call`, OAuth 2.1 PKCE ✅
- **Vault** — `vault_secrets` + `/vault` route ✅
- **Agent gateway** — `/agent-gateway` route exists ✅
- **Waitlist** — table + insert works ✅
- **Auth** — GoTrue self-hosted, email + Google ✅

## What is NOT real yet (per `.lovable/plan.md`)

| Claim on site | Reality |
|---|---|
| "Universal connectors — Gmail, Drive, Linear, Slack, GitHub" with auth handled | Only `connectors` table exists. **No OAuth, no health checks, no tool discovery.** Phase 4 unbuilt. |
| "Real-time context bus — same state, every agent... live ~12ms" | No Supabase Realtime publication wired, no cross-agent sync. Pure marketing. |
| "Built-in observability — every call logged, replayable" with rps/p99 widgets | `agent_calls` table exists but **most routes don't write to it yet**. Dashboard widgets still fake. Phase 1 unbuilt. |
| "Three keys. Any capability." protocol example uses `gateway.memorify.dev/v1` | Wrong host. Real route: `https://api.memorify.dev/agent-gateway`. |
| Hero CTA "Try the live endpoint" → LiveDemo | **LiveDemo is broken**: hits `${VITE_SUPABASE_URL}/functions/v1/agent-gateway` (old Lovable Cloud project), not `api.memorify.dev`. Plus uses a fake `public_demo_token_synapse_landing` that the real backend doesn't recognize. |
| "MCP-compatible" tag in hero | True (we expose `/synapse-mcp`), keep — but worth saying "we are an MCP server AND client". |
| "No SQL required" | True for agent-api verb interface, keep. |

## What's missing from the story (worth adding)

- **MCP dual role** — we're both an MCP server (agents call us) AND an MCP client (we call external MCPs with OAuth). That's rare and a real differentiator.
- **Self-hosted, not Lovable Cloud** — own VPS, own Postgres, own GoTrue. Sovereignty story.
- **Skills as portable prompts** with vault-resolved secrets (`{{vault.KEY}}`) — close to working.
- **Dashboard exists** — `/dashboard` is a real product surface, not just a marketing site.

## Proposed changes (file-by-file)

### `Hero.tsx`
- Tagline keeps "motherboard for AI agents" ✅
- Subhead: drop "Claude, Cursor, ChatGPT and your custom agents share the same brain" → soften to *"any MCP-compatible agent connects in one line"* (we don't yet ship Cursor/Claude bridges, only the MCP endpoint).
- Footer mono line: "MCP-compatible · HTTP · Self-hosted" (drop WS — no realtime yet).
- "Try the live endpoint" CTA → keep but only after we fix the demo (next item).

### `LiveDemo.tsx` — **BROKEN, must fix**
- Replace `GATEWAY_URL` with `https://api.memorify.dev/agent-gateway` (or whichever route accepts the public demo token).
- Either (a) provision a real public demo agent token on the VPS and use it, or (b) require sign-in and call `/agent-api` with the user's JWT, or (c) **temporarily hide this section** until the public demo token is wired up. Recommend (c) until backend confirms.

### `Protocol.tsx`
- Change endpoint in code sample from `gateway.memorify.dev/v1` → `https://api.memorify.dev/agent-gateway`.
- Keep verb model (remember/recall/link/act) — accurate.

### `Primitives.tsx` — biggest rewrite
Four cards today: Memory ✅, Connectors ❌, Realtime ❌, Observability ⚠️. Replace with what's real:

1. **Native memory** — keep as-is.
2. **MCP, both ways** (NEW) — "We're an MCP server your agents call, and an MCP client that connects out to Notion, Linear, GitHub via OAuth 2.1." Replaces over-promised "Universal connectors".
3. **Skills + Vault** (NEW) — "Portable prompt-as-a-tool, with secrets resolved server-side from your encrypted vault." Replaces "Real-time context bus".
4. **Self-hosted, sovereign** (NEW) — "Your data on your VPS. Postgres, GoTrue, Storage. No vendor lock-in." Replaces "Built-in observability" until Phase 1 is done.

(Keep observability as a "Coming soon" line in the roadmap section instead of a primitive.)

### `Architecture.tsx`
- Service tiles currently show: memory, files, tools, connectors, vector, automation. Real ones: memory, files (documents/voices/images), tools (skills), connectors (schema only), MCP. Drop `automation` (no scheduler/webhook system) and `vector` (no exposed embedding endpoint yet) — replace with `mcp` and `vault`.

### `Problem.tsx`
- Mostly fine. Tighten "Memorify replaces all of that with one gateway and one verb-based protocol" → still true.

### `Nav.tsx`
- Remove the `v0.1` chip OR change to `private alpha` — `v0.1` is meaningless to visitors.
- Anchor links all valid.

### `Footer.tsx`
- Add minimal links: Dashboard, BACKEND.md (if public), status. Skip if out of scope.

### New section: **Roadmap / What's next** (optional, ~30 lines)
Honest list — Connector OAuth, Realtime sync, Observability dashboard, VPS agent runtime. Builds trust by showing the gap between today and the vision instead of pretending it's all built.

## Out of scope for this pass

- Building the missing features themselves (those are Phases 1–4 in `.lovable/plan.md`)
- Dashboard copy review
- SEO/meta tags
- Mobile-specific tweaks

## Suggested order

1. Fix the broken LiveDemo (or hide it) — it's actively misleading right now
2. Rewrite Primitives (4 cards) — biggest credibility win
3. Fix Protocol endpoint URL
4. Tighten Hero + Architecture tiles
5. Optional: add honest Roadmap section

Confirm scope and I'll implement.
