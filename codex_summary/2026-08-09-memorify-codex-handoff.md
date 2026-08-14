# Memorify Codex Handoff - 2026-08-09

This is the working handoff for AI agents continuing work in `G:\memorify`.

## Product North Star

Keep this sentence in mind for every product and engineering decision:

> One gateway. One connection.  
> Every agent. Every tool.  
> Once and for all.

Memorify gives every AI agent the same secure memory, tools, files, and connectors through one private MCP gateway. It must be simple to connect, scoped by design, and built so context follows the work.

Security comes first. Simplicity is the product, but never at the cost of auth, scoping, auditability, encrypted secrets, least privilege, or zero data retention where applicable.

## Current Production Shape

- Frontend: Netlify, production URL `https://memorify.dev`.
- API: Netlify Edge routes under `/api/*`.
- MCP gateway: `https://memorify.dev/mcp`.
- Auth: Clerk, including `clerk.memorify.dev`.
- Database: Neon Postgres.
- MCP always-on hosting: Deno remains part of the plan for hosted MCP uptime, but the active public same-origin MCP gateway is currently served through `https://memorify.dev/mcp`.
- Supabase has been intentionally removed from the product direction. Do not reintroduce Supabase.

## Today's Main Fixes

### 1. Blank site and auth/API recovery

Earlier production failures were fixed across several turns:

- Blank page from `ReferenceError: agent is not defined`.
- Clerk provider/sign-in problems.
- Missing `/api/bootstrap` route.
- 401s from API calls caused by auth/workspace propagation.
- Copilot settings and OpenRouter key save/load paths.
- OpenRouter free-model max-token handling.
- Copilot chat 500/502 errors from OpenRouter and MCP routing.

Current status checks after latest deploy:

- `https://memorify.dev/` returns `200`.
- `https://memorify.dev/api/health` returns `200`.
- `https://memorify.dev/mcp` returns `200`.

### 2. Copilot and OpenRouter

Copilot uses OpenRouter for inference. Memorify executes tools only after Clerk auth.

Important backend behavior in `backend/routes/copilot.ts`:

- Workspace OpenRouter keys are encrypted and stored in `config` under key `copilot.openrouter_key`.
- Copilot settings are stored per workspace under `copilot.settings`.
- If a workspace key is absent, backend may fall back to `OPENROUTER_API_KEY` environment variable.
- Free OpenRouter models ending in `:free` are capped at `512` output tokens in Memorify.
- Default Copilot settings include ZDR enabled.

Important UX behavior in `src/pages/dashboard/Settings.tsx`:

- Copilot tab supports key entry, model, temperature, max tokens, ZDR, and model search.
- The OpenRouter key should be entered as the full `sk-or-v1-...` key.
- Placeholder should show saved hint only, never the full key.

### 3. MCP gateway and dynamic remote tools

The hosted MCP endpoint exposes:

- Native Memorify tools.
- Dynamic remote MCP tools loaded from connected MCP servers.

Important backend file:

- `backend/routes/mcp.ts`

Important behavior:

- `tools/list` returns native tools plus remote tool aliases.
- Remote aliases are shaped like `remote_<server>_<tool>`.
- `tools/call` dispatches dynamic aliases to the right remote MCP server.
- Remote auth tokens are decrypted server-side only.
- SSE responses are parsed safely.
- Stateful MCP session IDs are handled via `MCP-Session-Id`.

Known tested connections:

- GitHub MCP connected and loaded 44 tools.
- Hosted Memorify MCP exposed those GitHub tools to Codex.
- `remote_github_get_me` worked and returned the GitHub user in prior testing.
- Hugging Face MCP connected and exposed 4 tools:
  - `remote_hugging_face_hf_fs`
  - `remote_hugging_face_hf_whoami`
  - `remote_hugging_face_hub_repo_details`
  - `remote_hugging_face_hub_repo_search`

### 4. GitHub MCP

GitHub MCP now works through Memorify's hosted MCP layer.

Key fixes:

- Backend now accepts `application/json, text/event-stream`.
- MCP SSE `event: message` / `data:` responses are parsed.
- Stateful MCP initialization sends `notifications/initialized`.
- Dynamic GitHub tools appear in hosted `/mcp`.

User expectation:

- Connecting GitHub must eventually become one-click OAuth, not manual PAT entry.
- Manual tokens are acceptable only as an interim bridge.

### 5. Hugging Face MCP

Hugging Face initially returned `Session ID required`.

Fix:

- Added MCP session initialization and `MCP-Session-Id` handling in both Copilot route and public MCP proxy.

Current behavior:

- Hugging Face may only expose a small tool set depending on the provider.
- Prior observed count was 4 tools.

### 6. Zapier MCP

Zapier was the most recent deep fix.

Official Zapier MCP docs confirmed:

- Standard connection URL: `https://mcp.zapier.com/api/v1/connect`.
- Zapier no longer uses the old `https://mcp.zapier.com/api/mcp/mcp` path.
- For connection tokens:
  - Use `Authorization: Bearer <token>` with `https://mcp.zapier.com/api/v1/connect`, or
  - Use full URL with `?token=...`.
- For Zapier Embed:
  - The embed emits a user-specific `mcp-server-url`.
  - The embed secret is sent as `Authorization: Bearer <secret>`.
  - The embed secret alone does not work against the generic connect URL.

Key backend behavior:

- `backend/routes/copilot.ts` canonicalizes Zapier URLs.
- Old Zapier URL rows are migrated/canonicalized at runtime.
- Full `?token=...` URLs have token stripped before storage.
- Query-token secrets are encrypted.
- Bearer secrets are encrypted.
- Runtime calls append/decrypt only server-side.

Key frontend behavior:

- `src/pages/dashboard/Mcp.tsx` Zapier preset now has editable Server URL.
- Standard connection token: keep default URL and paste token.
- Embed flow: paste user-specific `mcp-server-url` into Server URL and paste embed secret into credential field.

If user sees:

`Invalid OAuth token - please re-authenticate`

Then likely cause:

- They pasted an embed secret while using the generic Zapier URL.
- Fix by deleting the bad Zapier row and adding it again with the user-specific embed server URL plus the embed secret.

### 7. No Local Browser State For Core Behavior

User explicitly said: "nothing is supposed to be local".

Latest deployed fix removed runtime browser storage from the production bundle.

Changed behavior:

- Copilot chat is in-memory only, not `localStorage`.
- Workspace selection no longer uses `memorify:current_workspace`.
- Fake `User Workspace` / `user:<id>` paths were removed.
- Active workspace source is Clerk active organization.
- If mobile has no active Clerk org, `ProtectedRoute` tries to activate the first org.
- Dashboard UI local storage was removed for:
  - Copilot open state.
  - Sidebar collapsed state.
  - Notes widget.
  - Tasks widget.
  - Bookmarks widget.
  - Theme accent cache.
  - Workspace prefs cache.

Production bundle verification after deploy:

- No `localStorage`.
- No `sessionStorage`.
- No `memorify:current_workspace`.
- No `memorify.copilot.chat.v1`.
- No fake `User Workspace`.

Files involved:

- `src/copilot/chat-context.tsx`
- `src/copilot/bus.tsx`
- `src/hooks/useCurrentWorkspace.tsx`
- `src/components/dashboard/ProtectedRoute.tsx`
- `src/components/dashboard/WorkspaceSwitcher.tsx`
- `src/components/dashboard/widgets/index.tsx`
- `src/components/dashboard/DashboardLayout.tsx`
- `src/components/dashboard/DashboardUIContext.tsx`
- `src/lib/theme.ts`
- `src/lib/workspace-prefs.ts`
- `src/pages/dashboard/Home.tsx`
- `src/pages/dashboard/Memory.tsx`
- `src/pages/dashboard/Skills.tsx`

## Important Design Decisions

### No Supabase

Do not add Supabase references, clients, functions, docs, or UI copy.

Memorify direction:

- Memorify `/api`.
- Clerk auth.
- Neon database.
- Netlify Edge.
- Hosted MCP gateway.

### Clerk Org Is Workspace Source

Workspace identity must come from Clerk org/server state, not browser local storage.

For Copilot:

- Prefer `organization.id` or Clerk `orgId`.
- Send `X-Workspace-Id`.
- Include `workspace_id` in server command request bodies when available.

### Secrets

Never expose full secrets in UI, logs, markdown, test output, or Copilot messages.

Secrets must be:

- Accepted through secure UI inputs.
- Encrypted server-side.
- Stored only encrypted.
- Shown with hints only.
- Decrypted only for server-side outbound calls.

### MCP and Plugins Direction

The product goal is one connect button:

- User clicks Connect.
- OAuth/token/embed flow happens.
- Tools load into Memorify.
- Agents can use tools through hosted MCP immediately.
- No tunnels.
- No manual JSON editing for normal users.

Manual token entry is acceptable for early providers, but the long-term path is OAuth or provider-native one-click connection wherever possible.

## Known Verification Commands

Run frontend build:

```powershell
npm run build
```

Deploy production bundle:

```powershell
netlify deploy --prod --dir=dist --no-build
```

Smoke check production:

```powershell
(Invoke-WebRequest -Uri https://memorify.dev/ -UseBasicParsing -TimeoutSec 20).StatusCode
(Invoke-WebRequest -Uri https://memorify.dev/api/health -UseBasicParsing -TimeoutSec 20).StatusCode
(Invoke-WebRequest -Uri https://memorify.dev/mcp -UseBasicParsing -TimeoutSec 20).StatusCode
```

Verify shipped JS has no browser storage:

```powershell
$html = (Invoke-WebRequest -Uri https://memorify.dev/ -UseBasicParsing -TimeoutSec 20).Content
$asset = [regex]::Match($html, 'assets/index-[^""<>]+\.js').Value
$js = (Invoke-WebRequest -Uri "https://memorify.dev/$asset" -UseBasicParsing -TimeoutSec 20).Content
[pscustomobject]@{
  asset = $asset
  localStorage = $js.Contains('localStorage')
  sessionStorage = $js.Contains('sessionStorage')
  currentWorkspaceKey = $js.Contains('memorify:current_workspace')
  copilotChatKey = $js.Contains('memorify.copilot.chat.v1')
}
```

Type check backend routes:

```powershell
deno check backend/routes/copilot.ts backend/routes/mcp.ts
```

Current known result:

- `deno check` still fails due pre-existing Neon type issues in `backend/lib/db.ts`.
- Errors include `NeonQueryFunction` generic args, `new NeonPool(getDsn(), 10)`, and `PoolClient.queryObject`.
- This was present before the latest feature work and was not fixed today.

## Current Known Risks

### Backend Type Debt

`backend/lib/db.ts` needs a proper Neon/Deno type cleanup.

Do not ignore forever. It blocks clean `deno check`.

### Legacy Memorify Client

`src/integrations/memorify/client.ts` still exists as a disabled/legacy-looking client and is imported in multiple places.

Risk:

- Some pages still use the old client style and may not be fully migrated to `/api + Clerk`.

Direction:

- Continue migrating dashboard data calls to `/api` endpoints through Clerk auth.
- Do not reintroduce Supabase semantics.

### Widgets Need Server Backing

Notes, tasks, bookmarks are now memory-only after removing local storage.

Next step:

- Add proper server-backed storage if these widgets remain part of the product.
- Store by Clerk org/workspace in Neon.

### Agent Workspace Model

Agent "workspace" selection is now in-memory only.

Potential next step:

- Decide whether agent-specific views are real server workspaces, namespaces under org workspace, or UI filters.
- Avoid fake `user:<id>` and avoid browser-persisted workspace state.

## Recommended Next Work

### Priority 1 - Fix Phone Copilot API Key Prompt

Test on mobile after latest deploy:

1. Open `https://memorify.dev/dashboard`.
2. Confirm Clerk active org is selected.
3. Open Copilot.
4. Send a simple message.
5. If it still asks for OpenRouter key:
   - Inspect `/api/copilot/settings` response on mobile.
   - Confirm request has `X-Workspace-Id: org_...`.
   - Confirm the same `org_...` has `copilot.openrouter_key` config row.

Expected behavior:

- Same Clerk org means same Copilot OpenRouter key.
- Phone should not ask for API key if desktop already saved it for the same org.

### Priority 2 - Clean Neon Type Errors

Fix `backend/lib/db.ts` so:

- `deno check backend/routes/copilot.ts backend/routes/mcp.ts` passes.
- Do not loosen types with broad `any` unless unavoidable.
- Verify Netlify Edge runtime still works.

### Priority 3 - Continue MCP Provider Work

Need progressively improve:

- GitHub OAuth instead of PAT.
- Zapier embed flow with actual embed UI.
- Hugging Face expectations and tool count.
- Stripe restricted-key flow.
- Notion OAuth.
- Sentry OAuth.
- Atlassian OAuth.
- Vercel OAuth.
- Cloudflare OAuth.
- Public MCPs should be one-click no-token.

For each provider:

1. Use official docs.
2. Add a catalog entry.
3. Add the auth flow.
4. Store credentials encrypted.
5. Sync tools.
6. Expose tools through hosted `/mcp`.
7. Test one real tool call.

### Priority 4 - Make Plugins and MCP One Unified Connection Surface

The user wants:

- Connectors.
- Plugins.
- MCP.

To feel like one simple system.

Recommended direction:

- Create one backend app catalog.
- UI can render separate tabs/views, but data model should be unified.
- A connected platform should produce:
  - connector metadata,
  - MCP server row if applicable,
  - synced MCP tools,
  - plugin entries if tools are pinned/featured.

### Priority 5 - Agent Setup JSON

The generated agent JSON idea is important:

- Hide raw tokens by default.
- Let users download a JSON config for Codex, Claude Code, Cursor, etc.
- JSON should contain:
  - hosted MCP URL,
  - agent token,
  - instructions,
  - scopes,
  - workspace id,
  - setup docs,
  - token warning.

Avoid making normal users manually edit config when a download/import can do it.

## Important Files To Read First

Backend:

- `backend/routes/copilot.ts`
- `backend/routes/mcp.ts`
- `backend/routes/bootstrap.ts`
- `backend/routes/v1.ts`
- `backend/lib/agent-token.ts`
- `backend/lib/clerk.ts`
- `backend/lib/db.ts`

Frontend:

- `src/copilot/chat-context.tsx`
- `src/copilot/bus.tsx`
- `src/copilot/actions/workspace.ts`
- `src/hooks/useCurrentWorkspace.tsx`
- `src/hooks/useNeonBootstrap.ts`
- `src/pages/dashboard/Settings.tsx`
- `src/pages/dashboard/Mcp.tsx`
- `src/pages/dashboard/Plugins.tsx`
- `src/pages/dashboard/Agents.tsx`
- `src/components/dashboard/ProtectedRoute.tsx`

Deploy:

- `netlify.toml`
- `netlify/edge-functions/api.ts`
- `netlify/edge-functions/mcp.ts`
- `netlify/edge-functions/bootstrap-agent.ts`

## Current Git/Repo Notes

The worktree is dirty with many unrelated and pre-existing changes. Do not run destructive git commands.

Important:

- `backend/routes/copilot.ts` appears untracked in `git status`, but it is actively used by the Netlify Edge build.
- Do not delete or reset it.
- Do not revert broad changes unless the user explicitly asks.

## Final Rule For Future Agents

When in doubt, optimize for this:

- One connection.
- Same context everywhere.
- No local drift.
- Clerk/Neon/server source of truth.
- Encrypted secrets.
- Scoped agent access.
- MCP tools exposed through Memorify's private gateway.
- Simple UI, serious security.
