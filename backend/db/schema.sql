-- Memorify — Neon Postgres schema (Supabase-free)
-- Ported from the original Supabase migrations, minus RLS / auth.uid()
-- (auth moves to app layer — Clerk JWT verifies identity, scope by workspace_id)
--
-- Run: deno run --allow-net --allow-env --allow-read backend/db/push_schema.ts

-- ── Extensions ──────────────────────────────────────────────────
-- Installed in 'extensions' schema (not public) per security best practice
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "vector" SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO PUBLIC;

-- ── updated_at trigger ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── Core tables ────────────────────────────────────────────────

-- Agents — one per connected AI agent (Hermes, Claude Code, custom, etc.)
CREATE TABLE IF NOT EXISTS agents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,           -- Clerk org_id
  user_id     text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,             -- Clerk user_id (who created it)
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'custom',  -- claude_code | cursor | hermes | custom
  status      text NOT NULL DEFAULT 'pending',  -- pending | connected | disconnected
  -- access_level: read | write | both | full  (enforced on /api/v1 every request)
  access_level text NOT NULL DEFAULT 'full',
  token_hash  text NOT NULL UNIQUE,      -- SHA-256 of the HMAC JWT (not the raw token)
  token_alg   text NOT NULL DEFAULT 'HS256',
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agents_workspace_idx ON agents(workspace_id);
CREATE INDEX IF NOT EXISTS agents_token_hash_idx ON agents(token_hash);

-- Idempotent upgrade for existing DBs
ALTER TABLE agents ADD COLUMN IF NOT EXISTS access_level text NOT NULL DEFAULT 'full';


-- Agent tokens — fine-grained scoped tokens for agent-to-agent / MCP auth (Ed25519 JWT)
CREATE TABLE IF NOT EXISTS agent_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,           -- Clerk org_id
  agent_id        uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  jti             text NOT NULL,           -- JWT ID (unique per token)
  token_hash      text NOT NULL UNIQUE,    -- SHA-256 of the full token (not stored plaintext)
  scopes          text[] NOT NULL DEFAULT '{}',  -- memory:read, memory:write, skills:read, skills:write, documents:read, documents:write, events:read, events:write, workspace:admin, tokens:admin
  expires_at      timestamptz,             -- null = never expires
  revoked_at      timestamptz,             -- null = active
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_tokens_workspace_idx ON agent_tokens(workspace_id);
CREATE INDEX IF NOT EXISTS agent_tokens_agent_idx ON agent_tokens(agent_id);
CREATE INDEX IF NOT EXISTS agent_tokens_jti_idx ON agent_tokens(jti);
CREATE INDEX IF NOT EXISTS agent_tokens_hash_idx ON agent_tokens(token_hash);

-- Trigger for updated_at
CREATE OR REPLACE TRIGGER trg_agent_tokens_updated
  BEFORE UPDATE ON agent_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- Memories — the core knowledge store
CREATE TABLE IF NOT EXISTS memories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  namespace   text NOT NULL DEFAULT 'default',  -- agent:<id> | shared | default
  content     text NOT NULL,
  category    text NOT NULL DEFAULT 'general',
  tags        text[] DEFAULT ARRAY[]::text[],
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived    boolean NOT NULL DEFAULT false,
  search_vec  tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS memories_workspace_idx ON memories(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS memories_namespace_idx ON memories(workspace_id, namespace);
CREATE INDEX IF NOT EXISTS memories_category_idx ON memories(workspace_id, category);
CREATE INDEX IF NOT EXISTS memories_tags_idx ON memories USING gin(tags);
CREATE INDEX IF NOT EXISTS memories_search_idx ON memories USING gin(search_vec);

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
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'text',  -- text | pdf | image | office
  size        integer NOT NULL DEFAULT 0,
  content     text,
  bytes       bytea,                         -- raw file bytes for binary files
  source_url  text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_vec  tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_workspace_idx ON documents(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS documents_search_idx ON documents USING gin(search_vec);

-- Document chunks — text chunks with embeddings for vector search
CREATE TABLE IF NOT EXISTS document_chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id       uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  chunk_index  integer NOT NULL,
  text         text NOT NULL,
  embedding    vector(1024),                   -- NVIDIA nv-embedqa-e5-v5 = 1024 dim
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_chunks_doc_idx ON document_chunks(doc_id);
CREATE INDEX IF NOT EXISTS document_chunks_workspace_idx ON document_chunks(workspace_id);
-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw_idx ON document_chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Events — append-only audit/activity log
CREATE TABLE IF NOT EXISTS events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
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
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
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
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
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
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
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
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name        text NOT NULL,
  url         text NOT NULL,
  transport   text NOT NULL DEFAULT 'http',  -- http | sse
  auth_type   text NOT NULL DEFAULT 'none',  -- none | bearer | api_key | oauth
  auth_config jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { bearer_token?, api_key?, client_id?, client_secret?, ... }
  enabled     boolean NOT NULL DEFAULT true,
  last_handshake_at timestamptz,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_servers_workspace_idx ON mcp_servers(workspace_id);

-- Idempotent upgrade for existing DBs
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS auth_type text NOT NULL DEFAULT 'none';
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS auth_config jsonb NOT NULL DEFAULT '{}'::jsonb;

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

-- Idempotent upgrades for generated columns (if tables exist without them)
ALTER TABLE memories ADD COLUMN IF NOT EXISTS search_vec tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX IF NOT EXISTS memories_search_idx ON memories USING gin(search_vec);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS search_vec tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;
CREATE INDEX IF NOT EXISTS documents_search_idx ON documents USING gin(search_vec);

-- Workspace-scoped config (key-value JSON)
CREATE TABLE IF NOT EXISTS config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key         text NOT NULL,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);
CREATE INDEX IF NOT EXISTS config_workspace_idx ON config(workspace_id);

-- Audit log — append-only trail for sensitive operations
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id    uuid REFERENCES agents(id) ON DELETE SET NULL,
  action      text NOT NULL,           -- token.mint | token.revoke | workspace.delete | skill.delete | mcp_server.add | mcp_server.remove | config.set | config.delete
  resource    text NOT NULL,           -- the resource affected (agent_id, workspace_id, skill_id, server_id, config_key)
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- additional context (before/after, ip, user_agent, etc.)
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_workspace_idx ON audit_log(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_agent_idx ON audit_log(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log(action, created_at DESC);

-- API keys — for programmatic access (CLI, MCP auth)
CREATE TABLE IF NOT EXISTS api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id     text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
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
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
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
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
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
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name        text,
  size        integer NOT NULL DEFAULT 0,
  duration    integer,
  transcript  text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voices_workspace_idx ON voices(workspace_id, created_at DESC);

-- Dashboard compatibility upgrades for workspace-first API tables
ALTER TABLE skills ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE connectors ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE images ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE images ADD COLUMN IF NOT EXISTS prompt text;
ALTER TABLE images ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE images ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'registered';
ALTER TABLE images ADD COLUMN IF NOT EXISTS params jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE voices ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE voices ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE voices ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'recording';
ALTER TABLE voices ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE voices ADD COLUMN IF NOT EXISTS mime text;
ALTER TABLE voices ADD COLUMN IF NOT EXISTS duration_sec integer;
ALTER TABLE voices ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE voices ADD COLUMN IF NOT EXISTS action_items text[];
ALTER TABLE voices ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'uploaded';
ALTER TABLE voices ADD COLUMN IF NOT EXISTS recorded_at timestamptz NOT NULL DEFAULT now();

-- Schemaless collections used by the Database tab
CREATE TABLE IF NOT EXISTS collections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id     text,
  name        text NOT NULL,
  slug        text NOT NULL,
  description text,
  icon        text,
  schema      jsonb NOT NULL DEFAULT '{}'::jsonb,
  item_count  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collections_workspace_idx ON collections(workspace_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS collections_slug_idx ON collections(workspace_id, slug);

CREATE TABLE IF NOT EXISTS collection_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  user_id       text,
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags          text[] DEFAULT ARRAY[]::text[],
  ai_summary    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collection_items_collection_idx ON collection_items(collection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS collection_items_data_idx ON collection_items USING gin(data);

-- Agent calls — analytics/telemetry
CREATE TABLE IF NOT EXISTS agent_calls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
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

CREATE OR REPLACE TRIGGER trg_config_updated
  BEFORE UPDATE ON config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_vault_updated
  BEFORE UPDATE ON vault_secrets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Identity registry (Clerk → Neon, for debug + joins) ────────
-- Source of truth for auth remains Clerk. These rows mirror what
-- we see so SQL debugging always has workspace ↔ user context.

CREATE TABLE IF NOT EXISTS app_users (
  id            text PRIMARY KEY,              -- Clerk user_id (user_...)
  email         text,
  first_name    text,
  last_name     text,
  full_name     text,
  image_url     text,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_users_email_idx ON app_users(email);

-- Workspaces = Clerk Organizations (org_...)
CREATE TABLE IF NOT EXISTS workspaces (
  id            text PRIMARY KEY,              -- Clerk org_id
  name          text NOT NULL,
  slug          text,
  image_url     text,
  created_by    text REFERENCES app_users(id) ON DELETE SET NULL,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspaces_slug_idx ON workspaces(slug);
CREATE INDEX IF NOT EXISTS workspaces_created_by_idx ON workspaces(created_by);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role          text NOT NULL DEFAULT 'org:member',  -- Clerk org role
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members(user_id);

-- Audit trail for bootstrap / webhook sync (debug what happened when)
CREATE TABLE IF NOT EXISTS identity_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL,                 -- user.upsert | workspace.upsert | member.upsert
  user_id       text,
  workspace_id  text REFERENCES workspaces(id) ON DELETE CASCADE,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS identity_events_ws_idx ON identity_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS identity_events_user_idx ON identity_events(user_id, created_at DESC);

-- Security logs — CSP violations, auth failures, rate limit hits, etc.
CREATE TABLE IF NOT EXISTS security_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text REFERENCES workspaces(id) ON DELETE CASCADE,                          -- null for pre-auth / edge-level events
  event_type    text NOT NULL,                 -- csp_violation | auth_failure | rate_limit | waf_block | etc.
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity      text NOT NULL DEFAULT 'info',  -- info | warning | critical
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_logs_workspace_idx ON security_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_logs_type_idx ON security_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS security_logs_severity_idx ON security_logs(severity, created_at DESC);

CREATE OR REPLACE TRIGGER trg_app_users_updated
  BEFORE UPDATE ON app_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_workspaces_updated
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_workspace_members_updated
  BEFORE UPDATE ON workspace_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- OAuth 2.0 tables for MCP endpoint
-- These allow Memorify's MCP endpoint to act as an OAuth 2.0 authorization server
-- so external clients like Gemini can connect via OAuth 2.0

-- OAuth 2.0 Clients — stores registered OAuth clients (like Gemini)
CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id       text NOT NULL UNIQUE,
  client_secret   text NOT NULL,  -- hashed with bcrypt
  name            text NOT NULL,
  redirect_uris   text[] NOT NULL DEFAULT '{}',
  grant_types     text[] NOT NULL DEFAULT '{"authorization_code","refresh_token"}',
  response_types  text[] NOT NULL DEFAULT '{"code"}',
  scopes          text[] NOT NULL DEFAULT '{"mcp:read","mcp:write"}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_oauth_clients_workspace_idx ON mcp_oauth_clients(workspace_id);
CREATE INDEX IF NOT EXISTS mcp_oauth_clients_client_id_idx ON mcp_oauth_clients(client_id);

-- OAuth 2.0 Authorization Codes — short-lived codes exchanged for tokens
CREATE TABLE IF NOT EXISTS mcp_oauth_auth_codes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,
  client_id       uuid NOT NULL REFERENCES mcp_oauth_clients(id) ON DELETE CASCADE,
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id     text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,  -- Clerk user ID
  workspace_id_claim text NOT NULL,  -- workspace_id the user authorized for
  redirect_uri    text NOT NULL,
  scopes          text[] NOT NULL DEFAULT '{}',
  code_challenge  text,  -- PKCE code challenge
  code_challenge_method text,  -- PKCE method (S256)
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_oauth_auth_codes_code_idx ON mcp_oauth_auth_codes(code);
CREATE INDEX IF NOT EXISTS mcp_oauth_auth_codes_client_idx ON mcp_oauth_auth_codes(client_id);

-- OAuth 2.0 Access Tokens — long-lived access tokens (stored as mem_live_... tokens)
-- We re-use the existing agent_tokens table structure but track OAuth origin
-- For now we reuse agent_tokens table with a marker in metadata

-- OAuth 2.0 Refresh Tokens — long-lived tokens to obtain new access tokens
CREATE TABLE IF NOT EXISTS mcp_oauth_refresh_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash      text NOT NULL UNIQUE,  -- bcrypt hash of the refresh token
  client_id       uuid NOT NULL REFERENCES mcp_oauth_clients(id) ON DELETE CASCADE,
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id     text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  workspace_id_claim text NOT NULL,
  scopes          text[] NOT NULL DEFAULT '{}',
  access_token_jti text,  -- JTI of the access token this refresh token issued
  revoked_at      timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_oauth_refresh_tokens_hash_idx ON mcp_oauth_refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS mcp_oauth_refresh_tokens_client_idx ON mcp_oauth_refresh_tokens(client_id);

-- ── Copilot chat sessions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS copilot_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id     text,
  title       text NOT NULL DEFAULT 'Untitled',
  messages    jsonb NOT NULL DEFAULT '[]'::jsonb,
  tool_calls  jsonb NOT NULL DEFAULT '[]'::jsonb,
  review      text,
  reviewed    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS copilot_sessions_workspace_idx ON copilot_sessions(workspace_id, created_at DESC);