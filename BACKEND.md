# Memorify Backend — Architecture & Developer Guide

## Connection Details

```
SUPABASE_URL=https://api.memorify.dev
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc4Njg4MDMxLCJleHAiOjE5MzYzNjgwMzF9.SLhXSoO26PcgADVeIVPWy5_5jpLqsxHzyXsk-_O-YC4
```

The backend is a **self-hosted Supabase** instance on a dedicated VPS, fronted by nginx with TLS. A separate **Express.js** backend handles AI routes, agent logic, and MCP operations.

## Architecture

```
Frontend (Lovable)                    VPS (api.memorify.dev)
memorify1.lovable.app          nginx (443, rate-limited, CORS-locked)
        |                            |
        |--- HTTPS --->    /auth/*   --> GoTrue (Supabase Auth)
        |--- HTTPS --->    /rest/*   --> PostgREST (DB API)
        |--- HTTPS --->    /storage/* --> Supabase Storage
        |--- HTTPS --->    /realtime/* --> Supabase Realtime (WS)
        |--- HTTPS --->    /agent-api, /vault, /copilot-action, etc.
        |                            --> Express.js (port 3000, localhost only)
```

All internal services (PostgreSQL 5432, Kong 8000, Pooler 6543, Express 3000) are bound to 127.0.0.1 — only ports 22, 80, 443 are exposed to the internet.

## Frontend Client Setup

```ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://api.memorify.dev",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc4Njg4MDMxLCJleHAiOjE5MzYzNjgwMzF9.SLhXSoO26PcgADVeIVPWy5_5jpLqsxHzyXsk-_O-YC4"
);
```

## Allowed Origins (CORS)

Only these origins can call the API:
- https://memorify1.lovable.app
- https://memorify.dev
- https://www.memorify.dev
- https://api.memorify.dev
- http://localhost:5173 (dev)
- http://localhost:8080 (dev)
- Any `*.lovable.app` subdomain (regex catch-all — covers Lovable previews)
- Any `*.lovableproject.com` subdomain (regex catch-all — covers Lovable sandboxes)

If you add a new frontend domain outside the `*.lovable.app` / `*.lovableproject.com` patterns, it must be added to both the nginx CORS map AND the Express cors config on the VPS.

## Existing Tables (21)

agents, agent_calls, api_keys, collections, collection_items, connectors, documents, events, images, mcp_oauth_states, mcp_servers, mcp_tools, memories, memory_versions, plugins, profiles, skills, vault_secrets, voices, waitlist, workspace_prefs

## Existing API Routes (Express)

| Route | Method | Auth | Purpose |
|---|---|---|---|
| /agent-api | POST | Agent token | Agent actions (memory, docs, skills, events) |
| /vault | POST | Bearer JWT | Encrypted secrets (set, get, delete, import) |
| /synapse-mcp | GET/POST | Agent token | MCP JSON-RPC server (tools/list, tools/call) |
| /agent-gateway | GET/POST | Agent token | Agent-to-agent communication |
| /copilot-action | POST | Bearer JWT | Workspace CRUD (plugins, agents, docs, settings) |
| /agent-chat | POST | Bearer JWT | AI chat (Gemini via Lovable gateway) |
| /mcp-handshake | POST | Bearer JWT | Initialize external MCP server + discover tools |
| /mcp-call | POST | Bearer JWT | Call tool on external MCP server |
| /mcp-oauth-start | POST | Bearer JWT | Start OAuth 2.1 PKCE flow for MCP server |
| /mcp-oauth-callback | GET | None (state param) | OAuth callback, exchanges code for token |
| /mcp-client-metadata | GET | None | Public OIDC client metadata document |
| /memory-suggest | POST | Bearer JWT | AI-structured memory from free text |
| /skill-run | POST | Bearer JWT | Execute skill prompt against AI |
| /collection-ai | POST | Bearer JWT | Import (parse text) or Query (NL to filter) |
| /image-generate | POST | Bearer JWT | AI image generation + storage upload |
| /voice-summarize | POST | Bearer JWT | Transcript to title/summary/action_items |
| /health | GET | None | Health check |

## Security Rules — READ BEFORE ADDING ANYTHING

### 1. Every table MUST have RLS enabled

```sql
ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;
```

Never create a table without RLS. Even if it "only has public data."

### 2. Every RLS policy MUST scope to the authenticated user

```sql
CREATE POLICY "Users read own data" ON public.new_table
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own data" ON public.new_table
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own data" ON public.new_table
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own data" ON public.new_table
  FOR DELETE USING (auth.uid() = user_id);
```

### 3. Every table MUST have a user_id column

```sql
CREATE TABLE public.new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- your columns here
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 4. Always add updated_at trigger

```sql
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.new_table
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 5. Sensitive columns — never expose in RLS SELECT policies

These columns must NEVER be readable from the frontend via PostgREST:
- `token` (agents table) — use a hash or separate lookup
- `auth` JSON (mcp_servers) — contains bearer tokens and secrets
- `encrypted_value` (vault_secrets) — server-side decrypt only

If your new table has secrets, either:
- Omit the column from SELECT policies
- Create a view that strips sensitive fields
- Handle it server-side in Express only

### 6. Audit tables are append-only

Tables like `agent_calls` and `events` should block UPDATE and DELETE. Only create SELECT and INSERT policies — no UPDATE/DELETE policies = immutable audit log.

### 7. Frontend calls — always use the Supabase client

```ts
// Correct: uses anon key + user JWT, goes through RLS
const { data } = await supabase.from("new_table").select("*");

// WRONG: never use service_role key from frontend
```

### 8. Server-side calls — Express route pattern

```js
// 1. Always require user auth
const ctx = await requireUser(req, res);
if (!ctx) return;

// 2. Use ctx.sb (user-scoped client) for user data
const { data } = await ctx.sb.from("table").select("*");

// 3. Use admin() ONLY for cross-user operations (e.g., agent token lookup)
const sbAdmin = admin();

// 4. Always validate input
if (!input || typeof input !== "string") {
  return res.status(400).json({ error: "input required" });
}

// 5. Log important actions to events table
ctx.sb.from("events").insert({
  user_id: ctx.user.id,
  kind: "action.name",
  source: "route-name",
  payload: { /* context */ }
}).then(() => {});
```

### 9. Rate limiting tiers (nginx)

| Tier | Rate | Burst | Used for |
|---|---|---|---|
| api | 30 req/s | 10-20 | CRUD routes, agent-api, vault |
| auth | 5 req/s | 3-10 | Login, OAuth, signup |
| ai | 3 req/s | 2-3 | AI generation, chat, image, voice |

When adding a new route to nginx, assign the correct tier.

### 10. Migration naming convention

`YYYYMMDDHHMMSS_description.sql`

Example: `20260515120000_add_bookmarks_table.sql`

## How to Add a New Table

1. Write migration SQL following rules 1-4 above
2. Apply on VPS: `docker exec -i supabase-db psql -U postgres -d postgres < migration.sql`
3. PostgREST auto-detects new tables — no restart needed
4. Update `types.ts` if using TypeScript types

## How to Add a New Express Route

1. Add route to existing route file or create new file in `routes/`
2. Follow the auth pattern from rule 8
3. If new file: import and `app.use()` in `server.js`
4. Add nginx location block with appropriate rate limit tier
5. Sync to VPS: `rsync -avz /path/to/files root@147.93.180.110:/opt/synapse/`
6. Restart: `pm2 restart synapse`
7. Reload nginx: `nginx -t && systemctl reload nginx`

## How to Add a New Frontend Domain

1. Add to nginx CORS map in `/etc/nginx/sites-available/synapse`
2. Add to Express `cors` origin array in `server.js`
3. Reload both: `pm2 restart synapse && systemctl reload nginx`

## What Lovable CAN Do

- Create new tables via SQL migrations (following security rules above)
- Query existing tables via Supabase client (all through RLS)
- Call existing Express routes via fetch/axios
- Add new frontend pages/components that use existing APIs

## What Lovable CANNOT Do

- Access the VPS directly (no SSH, no shell)
- Modify Express routes (handled by Claude on VPS)
- Change nginx config (handled by Claude on VPS)
- Use the service_role key (server-side only, never in frontend code)
- Bypass RLS policies
- Create tables without RLS or without user_id scoping

## Requesting Backend Changes

When the frontend needs a new backend capability:
1. Describe what the new route/table should do
2. Specify the input/output format
3. Claude will implement it on the VPS with proper auth, rate limiting, and RLS
4. Lovable wires up the frontend to call the new endpoint
