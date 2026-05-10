
# Copilot Action Layer — MCP-style internal tooling

Goal: every action a human can do in the dashboard (CRUD, drag, toggle, upload, open) must also be callable by the Copilot. Adding a new feature = adding its commands to ONE registry, in the same commit.

Today the copilot only has `navigate / toast / search`. That's the ceiling we're breaking.

---

## 1. Architecture (one registry, two runtimes)

```text
┌─────────────────────────────────────────────────────────────┐
│  src/copilot/registry.ts   ← single source of truth          │
│  ─ CommandDef[] (name, description, schema, scope, handler)  │
└──────────────┬───────────────────────────┬──────────────────┘
               │                           │
        scope:"client"                scope:"server"
               │                           │
   browser handler                   edge fn handler
   (UI: navigate, drag,              (DB CRUD, MCP invoke,
    open sheet, fill form…)           skill run, storage ops…)
               │                           │
               └──────► agent-chat ◄───────┘
                       (tools = registry.toManifest())
```

- **`src/copilot/registry.ts`** — `CommandDef[]` with zod schemas. Server reads names/schemas only.
- **`CopilotActionsProvider`** — exposes `runCommand(name, args)`; client commands run in browser, server commands hit `copilot-action` edge fn.
- **`agent-chat` v2** — multi-turn loop (model → tool → model), streams final answer.
- **`copilot-action` edge fn** — JWT-aware dispatcher, RLS-safe, logs each call to `events`.
- **Audit** — every command writes an `events` row (`kind = cmd.<name>`).

---

## 2. Concrete command list (v1)

Naming: `<domain>.<verb>`. `c` = client scope, `s` = server scope.

### nav (client)
- `nav.navigate` — `{ path }` jump to a route
- `nav.back`, `nav.forward`
- `nav.open_command_palette` — `{ query? }`
- `nav.open_copilot`, `nav.close_copilot`
- `nav.toast` — `{ message, variant? }`

### dashboard / widgets (client)
- `widgets.list` — what's currently on the home grid
- `widgets.add` — `{ widget_id, x?, y?, w?, h? }`
- `widgets.remove` — `{ widget_id }`
- `widgets.move` — `{ widget_id, x, y }`
- `widgets.resize` — `{ widget_id, w, h }`
- `widgets.reset_layout`

### memory
- `memory.list` (s) — `{ namespace?, category?, archived?, q?, limit? }`
- `memory.get` (s) — `{ id }`
- `memory.create` (s) — `{ content, namespace?, category?, tags?, metadata? }`
- `memory.update` (s) — `{ id, patch }`
- `memory.delete` (s) — `{ id }`
- `memory.archive` (s) / `memory.restore` (s) — `{ ids }`
- `memory.bulk_move_category` (s) — `{ ids, category }`
- `memory.bulk_tag` (s) — `{ ids, tags }`
- `memory.search` (s) — `{ q, limit? }`
- `memory.versions` (s) — `{ id }`
- `memory.load_version` (s) — `{ id, version }` (restore content)
- `memory.suggest_from_text` (s) — wraps `memory-suggest`
- `memory.open_editor` (c) — `{ id? }` opens the side sheet

### plugins (the reference example)
- `plugins.list` (s)
- `plugins.add` (s) — `{ name, kind, ref_id?, config? }`
- `plugins.add_from_skill` (s) — `{ skill_id }`
- `plugins.add_from_connector` (s) — `{ connector_id }`
- `plugins.add_from_mcp_tool` (s) — `{ mcp_tool_id }`
- `plugins.add_http` (s) — `{ name, url, headers? }`
- `plugins.update_config` (s) — `{ id, config }`
- `plugins.toggle` (s) — `{ id, enabled }`
- `plugins.reorder` (s) — `{ ids }` (positions = array index)
- `plugins.delete` (s) — `{ id }`
- `plugins.flash` (c) — `{ id }` brief UI pulse so user sees the change

### skills
- `skills.list` (s), `skills.get` (s)
- `skills.create` (s) — `{ name, slug?, prompt, schema?, model? }`
- `skills.update` (s) — `{ id, patch }`
- `skills.publish` (s) / `skills.unpublish` (s) — `{ id }`
- `skills.delete` (s) — `{ id }`
- `skills.run` (s) — `{ id, input }` wraps `skill-run`
- `skills.open_editor` (c) — `{ id? }`

### connectors
- `connectors.list` (s)
- `connectors.add` (s) — `{ name, kind, config? }`
- `connectors.update` (s) — `{ id, patch }`
- `connectors.test` (s) — `{ id }` wraps `connector-test`
- `connectors.toggle` (s) — `{ id, status }`
- `connectors.delete` (s) — `{ id }`

### mcp
- `mcp.list_servers` (s)
- `mcp.add_server` (s) — `{ name, url, transport?, auth? }`
- `mcp.update_server` (s) — `{ id, patch }`
- `mcp.toggle_server` (s) — `{ id, enabled }`
- `mcp.delete_server` (s) — `{ id }`
- `mcp.handshake` (s) — `{ id }` refresh tools list
- `mcp.list_tools` (s) — `{ server_id }`
- `mcp.toggle_tool` (s) — `{ tool_id, enabled }`
- `mcp.invoke_tool` (s) — `{ tool_id, input }`

### documents
- `documents.list` (s) — `{ q?, limit? }`
- `documents.request_upload` (s) — `{ name, mime, size }` returns signed PUT URL
- `documents.register` (s) — `{ name, mime, size, storage_path }` after browser upload
- `documents.delete` (s) — `{ id }`
- `documents.signed_url` (s) — `{ id, ttl? }`
- `documents.upload_picker` (c) opens the OS file dialog

### images
- `images.list` (s)
- `images.generate` (s) — `{ prompt, model? }` wraps `image-generate`
- `images.upload_register` (s) — `{ url, prompt? }`
- `images.delete` (s) — `{ id }`

### voices
- `voices.list` (s)
- `voices.create` (s) — `{ name, kind, params? }`
- `voices.delete` (s) — `{ id }`
- `voices.synthesize` (s) — `{ voice_id, text }` (stub until ElevenLabs)

### database (read-only)
- `db.list_tables` (s)
- `db.describe_table` (s) — `{ table }`
- `db.select` (s) — `{ table, columns?, where?, order?, limit? }` (≤100 rows, SELECT only)

### vault / secrets
- `vault.list_names` (s) — names only, never values
- `vault.add_request` (c) — emits the agent flow to add a secret (user types value)
- `vault.delete_request` (c) — `{ name }`

### events / logs
- `events.tail` (s) — `{ kind?, source?, since? }`
- `events.get` (s) — `{ id }`
- `logs.export_csv` (c) — current page

### api keys
- `api_keys.list` (s)
- `api_keys.create` (s) — `{ name }` returns reveal-once token
- `api_keys.revoke` (s) — `{ id }` (confirm gate)

### settings / profile / auth
- `profile.get` (s)
- `profile.update` (s) — `{ display_name?, avatar_url? }`
- `auth.sign_out` (c) (confirm gate)
- `auth.delete_account` (s) (double confirm)

### theme / ui
- `ui.set_theme` (c) — `{ theme: "light"|"dark"|"system" }`
- `ui.set_density` (c) — `{ density: "compact"|"comfortable" }`

### copilot meta
- `meta.list_commands` — what can you do
- `meta.list_commands_here` — filtered by current route
- `meta.confirm` — pseudo-tool returned to user for yes/no on destructive ops
- `meta.undo` — for reversible commands (uses event log)

**Total: ~95 commands at v1.**

---

## 3. Multi-turn agent loop

`agent-chat` becomes:

1. POST `{messages}` from frontend.
2. Call Lovable AI with `tools = manifest`.
3. If response has tool_calls and any are **server-scope** → execute via `copilot-action`, append `tool` messages, loop (max 5 turns).
4. If **client-scope** tool calls → return them to the sidebar; sidebar runs them, then re-posts with results.
5. Stream final assistant text (SSE) once no more tool calls.

---

## 4. UX layer

- **Action chips** in chat — each tool call as a card with name + status + "Undo" when reversible.
- **Inline confirmations** for destructive commands (`plugins.delete`, `api_keys.revoke`, `auth.*`) via `meta.confirm`.
- **Live highlight** — `plugins.flash` pulses the row so the user sees the move.
- **"What can you do here?"** in the sidebar lists commands filtered by current route.
- **Per-command permission toggles** in Settings ("allow copilot to delete", "allow copilot to revoke keys").

---

## 5. Wave plan

**Wave A — Foundation:**
- `src/copilot/registry.ts`, `actions.manifest.ts`, `CopilotActionsProvider`, `useCopilotCommand` hook.
- `copilot-action` edge fn + audit logging to `events`.
- Rewrite `agent-chat` (multi-turn + manifest + SSE).
- Sidebar renders action chips and runs client commands.

**Wave B — Plugins (proof):** all `plugins.*` + `widgets.*` commands. DnD via `@dnd-kit/core`. Demo prompts: "add a Slack plugin", "move Notion to top", "disable Gmail".

**Wave C** — `memory.*` + `skills.*` + `mcp.*`.

**Wave D** — `documents.*` + `images.*` + `voices.*` + `api_keys.*`.

**Wave E** — `db.*` + `vault.*` + `events.*` + `profile.*` + `ui.*`.

---

## 6. Technical details

```text
File map:
  src/copilot/
    registry.ts            (CommandDef[] with zod)
    types.ts               (Scope, Result, ToolCall)
    bus.tsx                (Provider, useCopilotCommand)
    actions/
      nav.ts plugins.ts memory.ts skills.ts mcp.ts
      connectors.ts documents.ts images.ts voices.ts
      db.ts vault.ts events.ts api_keys.ts settings.ts
      widgets.ts ui.ts meta.ts
    manifest.ts            (server-safe export: name+desc+schema only)

  supabase/functions/
    copilot-action/index.ts  (dispatcher; JWT; events log)
    agent-chat/index.ts      (multi-turn loop, SSE)

CommandDef shape:
  {
    name: "plugins.reorder",
    description: "Reorder plugins by id list. Position = index.",
    scope: "server",
    destructive: false,
    schema: z.object({ ids: z.array(z.string().uuid()) }),
    handler: async (input, ctx) => { /* update positions */ }
  }

Security:
  - Server commands run with the user's JWT.
  - Destructive: true → require meta.confirm before exec.
  - Per-user allow-list in settings.
  - Audit: events.kind = "cmd.<name>", payload = { args, result, ms }.

Out of scope (v1): voice control, admin/cross-user, real-time agent cursor.
```

---

Approve and I'll ship **Wave A + Wave B** in one shot — you'll watch the copilot add, reorder, toggle and delete plugins live.
