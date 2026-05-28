## Goal

Give the in-app Copilot full control of the user's MCP servers (list, inspect tools, add, toggle, sync, call, delete, OAuth) while making sure these commands are **not** reachable from `memorify-mcp` or `agent-gateway` — i.e. no external agent / token / API key can trigger them.

## Why a separate surface

Today MCP control is partially reachable via `memorify-mcp` (`mcp_servers`, `mcp_add_server`, `mcp_toggle_server`, `mcp_delete_server`, `mcp_call`, etc.) using an **agent token**. That's powerful but risky: any leaked agent token can rewire the user's MCP fleet. The new Copilot pack stays inside the user's authenticated browser session and goes through `copilot-action` (JWT + RLS + audit). External agents keep the read-mostly subset; the destructive surface gets locked down.

## Scope

### 1. New command pack — `src/copilot/actions/mcp.ts`

All `scope: "server"`, routed to `/dashboard/mcp`. Handlers added in `copilot-action/index.ts`.

| Command | Purpose | Destructive |
|---|---|---|
| `mcp.servers.list` | List user's MCP servers (id, name, url, enabled, last_handshake_at, last_error) | no |
| `mcp.servers.get` | Fetch one server with its cached tools | no |
| `mcp.servers.add` | Insert a server (name, url, transport, auth — bearer / headers / oauth-pending) | no |
| `mcp.servers.update` | Patch name/url/auth/transport | no |
| `mcp.servers.toggle` | Enable/disable a server | no |
| `mcp.servers.rename` | Rename a server | no |
| `mcp.servers.delete` | Permanently delete (confirm-first) | **yes** |
| `mcp.tools.list` | List cached `mcp_tools` for a server (or all) | no |
| `mcp.tools.toggle` | Enable/disable a single tool | no |
| `mcp.sync` | Invoke existing `mcp-handshake` for one server to refresh tool catalog + update `last_handshake_at`/`last_error` | no |
| `mcp.call` | Proxy to existing `mcp-call` edge function for one tool with arguments | **yes** (mutating tools); always require explicit user intent |
| `mcp.oauth.start` | Invoke existing `mcp-oauth-start` and return `authUrl` for the user to open | no |
| `mcp.flash` | Briefly highlight a row in the MCP page UI (client scope) | no |

`mcp.flash` is client-scope (uses `registerFlash` like `plugins.flash`). Everything else is server-scope.

### 2. `copilot-action` dispatcher additions

Add a `mcp.*` switch block. Each case:
- runs as the authenticated user (RLS already filters `mcp_servers`/`mcp_tools` by `user_id`)
- for `sync`, `call`, `oauth.start` → calls the existing edge functions (`mcp-handshake`, `mcp-call`, `mcp-oauth-start`) by forwarding the user's JWT; no service-role escalation
- writes an `events` audit row (already automatic via the dispatcher wrapper) — for `mcp.call` we log only `{ server_id, tool, ok, ms }`, never the raw arguments (consistent with the prior redaction pass)

### 3. Lockdown of `memorify-mcp` (external surface)

`memorify-mcp` is the JSON-RPC server reachable with an **agent token**. Today it exposes destructive MCP-management tools. Remove or gate them so external agents can't rewire the user's connectors:

- **Remove from the public tool list**: `mcp_add_server`, `mcp_update_server`, `mcp_toggle_server`, `mcp_delete_server`, `mcp_toggle_tool`, `mcp_sync`.
- **Keep (read-only / call-only)**: `mcp_servers` (list), `mcp_tools` (list), `mcp_call` (invoke a tool on an already-connected server the user enabled).
- Reason: agents should be able to *use* the user's MCP fleet, not *reconfigure* it. Configuration belongs to the human + Copilot in the dashboard.

Add a comment block at the top of `memorify-mcp/index.ts` documenting the policy so this doesn't regress.

### 4. `agent-gateway` — no change needed

It already routes through `memorify-mcp` semantics, so removing destructive tools there closes the gateway surface too. Add an assertion at the gateway entry that rejects any tool name starting with `mcp_add_`, `mcp_update_`, `mcp_toggle_`, `mcp_delete_`, `mcp_sync` even if they ever leak back into the catalog — defense in depth.

### 5. System prompt hint for the Copilot

Add one line to the Copilot system prompt: *"Use `mcp.*` commands to manage and call the user's MCP servers. These commands only work inside this dashboard — external agents cannot use them."* This nudges the model to actually pick them up.

### 6. Audit + safety rules

- `mcp.servers.delete` and `mcp.call` are marked `destructive: true` so the Copilot's existing confirmation flow kicks in.
- `mcp.servers.add` validates `url` is `https://` only (reuse `safeFetch` policy in the handshake path; no additional client-side relax).
- `mcp.call` rejects calls to a disabled server or a disabled tool before forwarding.
- Every command logged to `events` with `source: "copilot"` and `kind: "cmd.mcp.*"`.

## Files touched

```text
src/copilot/actions/mcp.ts             (new — command defs)
src/copilot/useRegisterCoreCommands.ts (register mcpCommands)
supabase/functions/copilot-action/index.ts   (add mcp.* dispatch cases)
supabase/functions/memorify-mcp/index.ts     (remove destructive tools + policy comment)
supabase/functions/agent-gateway/index.ts    (deny-list for destructive mcp_* tool names)
```

No DB migration — `mcp_servers` / `mcp_tools` already exist with RLS.

## Out of scope

- Building a new MCP server. We're only adding *commands the Copilot can run against existing MCP plumbing*.
- Refactoring `Mcp.tsx` page (separate refactor task).
- Voices/Images/Vault/Skills action packs (next round; not needed for this security ask).

## Acceptance

1. From Copilot chat: "list my MCP servers", "add `https://mcp.notion.com/mcp` named Notion", "sync server X", "call tool Y on server X with {...}", "disable server Z", "delete server Z" — all work via `copilot-action`.
2. From an external agent token hitting `memorify-mcp`: `mcp_add_server`, `mcp_delete_server`, `mcp_toggle_server`, `mcp_toggle_tool`, `mcp_sync`, `mcp_update_server` → returns `unknown tool`.
3. `agent-gateway` rejects the same tool names defensively even if the catalog regresses.
4. `events` table shows `cmd.mcp.*` rows with no raw tool arguments in the payload.
