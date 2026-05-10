# Synapse dashboard — feature build plan

Goal: replace placeholder pages with working MVPs. Real RLS-backed CRUD everywhere, Lovable AI for AI features, mock-only for heavy ops (vector embeddings, TTS, raw SQL exec). No unsolicited UI rewrites — only the pages listed.

Order follows your priority: **Memory → MCP → Plugins & tools → Knowledge → Data/Observe/Project**.

---

## Wave 1 — Memory + MCP (the brain)

### 1.1 Memory browser (deepen existing page)
- Row drawer: edit `content`, `namespace`, `tags[]`, JSON `metadata` with a Monaco-lite textarea.
- Namespace pivot: left rail listing distinct namespaces (counts), filter on click.
- Bulk actions: multi-select rows → delete / move namespace / tag.
- Real-time stays on (already wired).
- "Insert with AI": one-shot edge function `memory-suggest` that turns a free-text note into `{content, tags, metadata}` via Lovable AI.

### 1.2 MCP servers (new, lives under Connectors as a tab + own page)
- New table `mcp_servers` (user_id, name, url, transport `sse|http`, auth jsonb, enabled, last_handshake_at).
- New table `mcp_tools` (mcp_server_id, name, description, input_schema jsonb, enabled).
- Edge function `mcp-handshake`: hits `/initialize` + `/tools/list` on the server URL, upserts tools.
- UI: list servers, "Add MCP server" dialog, per-server tool list with enable toggles.
- Edge function `mcp-invoke` (foundation for Wave 2): proxies a tool call, logs to `events`.

---

## Wave 2 — Plugins & Tools (agent capabilities)

### 2.1 Skills page
- New table `skills` (user_id, name, slug, description, version, status `draft|live`, prompt text, schema jsonb).
- CRUD list + editor (name, prompt, JSON schema, status). Versions are a column for now (no history).
- "Try" panel: runs the skill via `skill-run` edge function (Lovable AI, gemini-3-flash-preview default, model picker).

### 2.2 Plugins page
- New table `plugins` (user_id, name, kind `connector|mcp_tool|skill|http`, ref_id, config jsonb, enabled).
- Acts as a unified registry — rows are "wired tools" the agent can use. Created from Skills/Connectors/MCP via "Add as plugin" buttons; or manual HTTP plugin (url + headers).
- Toggle enabled, delete, reorder (drag handle, persisted via `position` int).

### 2.3 Connectors page (deepen existing)
- Replace the static list with a real picker that calls `standard_connectors--connect` (workspace-side, already supported by Lovable). Falls back to a manual config form when offline.
- Show connection status pill, last test time, "Test connection" button → `connector-test` edge function.

---

## Wave 3 — Knowledge (Documents, Images, Voices)

### 3.1 Documents
- Storage bucket `documents` (private, RLS by user folder).
- Table `documents` (user_id, name, mime, size, storage_path, status `uploaded|processing|ready|failed`).
- Upload widget (drag-drop). On upload row appears immediately; processing is a stub for now (status flips to `ready` after 1s).
- Detail drawer: metadata + "View" link (signed URL).

### 3.2 Images
- Table `images` (user_id, prompt, model, url, kind `generated|uploaded`, params jsonb).
- Edge function `image-generate` calling Lovable AI (`google/gemini-2.5-flash-image`); stores base64 to storage bucket `images`.
- Grid view, click to enlarge, prompt + reuse.

### 3.3 Voices
- Table `voices` (user_id, name, kind `tts|stt|clone`, sample_url, params jsonb).
- Page shows a stub recorder + a "Generate sample" form. Real TTS deferred (no ElevenLabs in this pass) — show a pill "Connect ElevenLabs to enable" linking to Connectors.

---

## Wave 4 — Data, Observe, Project

### 4.1 Database (read-only)
- Calls a `db-introspect` edge function returning table list + columns from `information_schema` (filtered to `public`).
- Per-table viewer: paginated select via `db-select` edge function with column ordering. No write path.
- "SQL playground" tab is read-only too — runs through `db-select` with a fixed `LIMIT 100`, only `SELECT` allowed (regex guard server-side).

### 4.2 Vault
- Lists the project's runtime secrets via an edge function that returns names only (never values) using the Lovable secrets API.
- "Add secret" / "Rotate" / "Delete" buttons trigger the agent's `add_secret` / `update_secret` / `delete_secret` flows by emitting a structured chat message — for now we'll log them as TODO toasts and document the flow.

### 4.3 Events / Logs
- Events page: keep existing live stream, add JSON drawer + filter by `kind`, `source`.
- Logs page: paginated history of `events`, date-range picker, export CSV button (client-side from current page).

### 4.4 API keys
- Already exists. Polish only: reveal-once dialog with copy, last-used pill, "regenerate" that revokes + re-creates.

### 4.5 Settings
- Profile (display_name, avatar_url) → `profiles` table.
- Workspace name (stored on profile for now).
- Danger zone: delete account (sign-out + delete profile row, mark for deletion).

---

## Cross-cutting

- All new pages use the existing `PageHeader` + `WidgetShell`-style cards.
- Scrollbars: apply `scrollbar-thin` to every page's main scroll container (the "all plugins" remark from your last message).
- Drag-handle / no-text-select rules already shipped.
- Every mutation logs an `events` row (kind = e.g. `memory.created`, `plugin.enabled`) so the live bus stays interesting.

## Technical details (for the dev)

```text
Schema delta (Wave 1 + 2):
  mcp_servers(id, user_id, name, url, transport, auth jsonb, enabled, last_handshake_at, created_at, updated_at)
  mcp_tools(id, mcp_server_id, name, description, input_schema jsonb, enabled, created_at)
  skills(id, user_id, name, slug, description, version, status, prompt, schema jsonb, created_at, updated_at)
  plugins(id, user_id, name, kind, ref_id uuid, config jsonb, enabled, position, created_at, updated_at)

Schema delta (Wave 3):
  documents(id, user_id, name, mime, size, storage_path, status, created_at)
  images(id, user_id, prompt, model, url, kind, params jsonb, created_at)
  voices(id, user_id, name, kind, sample_url, params jsonb, created_at)

Storage buckets: documents (private), images (private)
Edge functions: memory-suggest, mcp-handshake, mcp-invoke, skill-run, connector-test,
                image-generate, db-introspect, db-select
RLS: every new table → policy `user_id = auth.uid()` for ALL.
```

## Out of scope (this pass)

- Real vector embeddings / pgvector — Memory stays text-search only.
- Real raw SQL exec — Database tab is read-only.
- ElevenLabs/TTS — placeholder until you add the connector.
- MCP transport beyond HTTP/SSE.
- Audit history / version diff for skills.

Tell me to start at **Wave 1** and I'll ship Memory + MCP first.