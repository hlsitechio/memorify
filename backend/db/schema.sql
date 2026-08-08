-- Memorify — Neon Postgres schema (Supabase-free)
-- Ported from the original Supabase migrations, minus RLS / auth.uid()
-- (auth moves to app layer — Clerk JWT verifies identity, scope by workspace_id)
--
-- Run: deno run --allow-net --allow-env --allow-read backend/db/push_schema.ts

-- ── Extensions ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── updated_at trigger ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── Core tables ────────────────────────────────────────────────

-- Agents — one per connected AI agent (Hermes, Claude Code, custom, etc.)
CREATE TABLE IF NOT EXISTS agents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL,           -- Clerk org_id
  user_id     text NOT NULL,             -- Clerk user_id (who created it)
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'custom',  -- claude_code | cursor | hermes | custom
  status      text NOT NULL DEFAULT 'pending',  -- pending | connected | disconnected
  token_hash  text NOT NULL UNIQUE,      -- SHA-256 of the HMAC JWT (not the raw token)
  token_alg   text NOT NULL DEFAULT 'HS256',
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agents_workspace_idx ON agents(workspace_id);
CREATE INDEX IF NOT EXISTS agents_token_hash_idx ON agents(token_hash);

-- Memories — the core knowledge store
CREATE TABLE IF NOT EXISTS memories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL,
  namespace   text NOT NULL DEFAULT 'default',  -- agent:<id> | shared | default
  content     text NOT NULL,
  category    text NOT NULL DEFAULT 'general',
  tags        text[] DEFAULT ARRAY[]::text[],
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS memories_workspace_idx ON memories(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS memories_namespace_idx ON memories(workspace_id, namespace);
CREATE INDEX IF NOT EXISTS memories_category_idx ON memories(workspace_id, category);
CREATE INDEX IF NOT EXISTS memories_tags_idx ON memories USING gin(tags);

-- Memory versions — append-only history
CREATE TABLE IF NOT EXISTS memory_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id   uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS memory_versions_mem_idx ON memory_versions(memory_id, created_at DESC);

-- Documents — uploaded files, imported URLs
CREATE TABLE IF NOT EXISTS documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL,
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'text',  -- text | pdf | image | office
  size        integer NOT NULL DEFAULT 0,
  content     text,
  source_url  text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_workspace_idx ON documents(workspace_id, created_at DESC);

-- Events — append-only audit/activity log
CREATE TABLE IF NOT EXISTS events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL,
  agent_id    uuid REFERENCES agents(id) ON DELETE SET NULL,
  kind        text NOT NULL,           -- memory.remember | skill.run | mcp.call | etc.
  source      text,                    -- agent:<id> | copilot | system
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_workspace_idx ON events(workspace_id, created_at DESC);

-- Skills — reusable prompt + model bundles
CREATE TABLE IF NOT EXISTS skills (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL,
  name        text NOT NULL,
  slug        text NOT NULL,
  description text,
  prompt      text NOT NULL,
  model       text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  schema      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'draft',  -- draft | live
  version     integer NOT NULL DEFAULT 1,
  source      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { origin: "methora" | "manual", ... }
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS skills_workspace_idx ON skills(workspace_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS skills_slug_idx ON skills(workspace_id, slug);

-- Connectors — external tool connections (HTTP, Slack, GitHub, etc.)
CREATE TABLE IF NOT EXISTS connectors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL,
  name        text NOT NULL,
  kind        text NOT NULL,             -- http | slack | github | postgres | stripe | notion
  status      text NOT NULL DEFAULT 'inactive',  -- active | inactive | error
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connectors_workspace_idx ON connectors(workspace_id);

-- Plugins — installed extensions
CREATE TABLE IF NOT EXISTS plugins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL,
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'skill',
  ref_id      uuid,
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plugins_workspace_idx ON plugins(workspace_id);

-- MCP servers — connected external MCP endpoints
CREATE TABLE IF NOT EXISTS mcp_servers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL,
  name        text NOT NULL,
  url         text NOT NULL,
  transport   text NOT NULL DEFAULT 'http',  -- http | sse
  auth        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { bearer?, headers? }
  enabled     boolean NOT NULL DEFAULT true,
  last_handshake_at timestamptz,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_servers_workspace_idx ON mcp_servers(workspace_id);

-- MCP tools — discovered tools from connected servers
CREATE TABLE IF NOT EXISTS mcp_tools (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mcp_server_id uuid NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_tools_server_idx ON mcp_tools(mcp_server_id);

-- API keys — for programmatic access (CLI, MCP auth)
CREATE TABLE IF NOT EXISTS api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL,
  user_id     text NOT NULL,
  name        text NOT NULL,
  key_prefix  text NOT NULL,
  key_hash    text NOT NULL UNIQUE,
  last_used_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_workspace_idx ON api_keys(workspace_id);
CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys(key_hash);

-- Vault — encrypted secrets
CREATE TABLE IF NOT EXISTS vault_secrets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL,
  name        text NOT NULL,
  value_encrypted bytea NOT NULL,
  scope       text NOT NULL DEFAULT 'dev',
  last_used_at timestamptz,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vault_name_idx ON vault_secrets(workspace_id, name);

-- Images
CREATE TABLE IF NOT EXISTS images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL,
  name        text,
  size        integer NOT NULL DEFAULT 0,
  url         text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS images_workspace_idx ON images(workspace_id, created_at DESC);

-- Voices
CREATE TABLE IF NOT EXISTS voices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL,
  name        text,
  size        integer NOT NULL DEFAULT 0,
  duration    integer,
  transcript  text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voices_workspace_idx ON voices(workspace_id, created_at DESC);

-- Agent calls — analytics/telemetry
CREATE TABLE IF NOT EXISTS agent_calls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL,
  agent_id    uuid REFERENCES agents(id) ON DELETE SET NULL,
  kind        text,           -- memory | skill | mcp | connector | api
  name        text,           -- e.g. "memory.remember"
  status      text,           -- ok | error
  latency_ms  integer,
  tokens_in   integer,
  tokens_out  integer,
  cost_cents  integer,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_calls_workspace_idx ON agent_calls(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_calls_kind_idx ON agent_calls(workspace_id, kind, created_at DESC);

-- ── Triggers ───────────────────────────────────────────────────
CREATE OR REPLACE TRIGGER trg_agents_updated
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_memories_updated
  BEFORE UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_documents_updated
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_skills_updated
  BEFORE UPDATE ON skills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_connectors_updated
  BEFORE UPDATE ON connectors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_mcp_servers_updated
  BEFORE UPDATE ON mcp_servers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_vault_updated
  BEFORE UPDATE ON vault_secrets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();