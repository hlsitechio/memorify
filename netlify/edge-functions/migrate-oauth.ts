// Temporary edge function to apply OAuth schema to Neon
// Remove after first successful run
import { query } from "../../backend/lib/db.ts";

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  if (url.searchParams.get("confirm") !== "yes") {
    return new Response(JSON.stringify({ error: "Add ?confirm=yes to confirm schema push" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results: string[] = [];

  const statements = [
    `CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id    text,
      client_id       text NOT NULL UNIQUE,
      client_secret   text NOT NULL,
      name            text NOT NULL,
      redirect_uris   text[] NOT NULL DEFAULT '{}',
      grant_types     text[] NOT NULL DEFAULT '{"authorization_code","refresh_token"}',
      response_types  text[] NOT NULL DEFAULT '{"code"}',
      scopes          text[] NOT NULL DEFAULT '{"mcp:read","mcp:write"}',
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS mcp_oauth_clients_workspace_idx ON mcp_oauth_clients(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS mcp_oauth_clients_client_id_idx ON mcp_oauth_clients(client_id)`,
    `CREATE TABLE IF NOT EXISTS mcp_oauth_auth_codes (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code            text NOT NULL UNIQUE,
      client_id       uuid NOT NULL REFERENCES mcp_oauth_clients(id) ON DELETE CASCADE,
      workspace_id    text NOT NULL,
      user_id         text NOT NULL,
      workspace_id_claim text NOT NULL,
      redirect_uri    text NOT NULL,
      scopes          text[] NOT NULL DEFAULT '{}',
      code_challenge  text,
      code_challenge_method text,
      expires_at      timestamptz NOT NULL,
      consumed_at     timestamptz,
      created_at      timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS mcp_oauth_auth_codes_code_idx ON mcp_oauth_auth_codes(code)`,
    `CREATE INDEX IF NOT EXISTS mcp_oauth_auth_codes_client_idx ON mcp_oauth_auth_codes(client_id)`,
    `CREATE TABLE IF NOT EXISTS mcp_oauth_refresh_tokens (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      token_hash      text NOT NULL UNIQUE,
      client_id       uuid NOT NULL REFERENCES mcp_oauth_clients(id) ON DELETE CASCADE,
      workspace_id    text NOT NULL,
      user_id         text NOT NULL,
      workspace_id_claim text NOT NULL,
      scopes          text[] NOT NULL DEFAULT '{}',
      access_token_jti text,
      revoked_at      timestamptz,
      expires_at      timestamptz,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS mcp_oauth_refresh_tokens_hash_idx ON mcp_oauth_refresh_tokens(token_hash)`,
    `CREATE INDEX IF NOT EXISTS mcp_oauth_refresh_tokens_client_idx ON mcp_oauth_refresh_tokens(client_id)`,
    // OAuth clients register before any user/workspace context exists —
    // workspace_id is bound at consent time from the Clerk JWT instead.
    `ALTER TABLE mcp_oauth_clients DROP CONSTRAINT IF EXISTS fk_mcp_oauth_clients_workspace_id`,
    `ALTER TABLE mcp_oauth_clients ALTER COLUMN workspace_id DROP NOT NULL`,
  ];

  for (const sql of statements) {
    try {
      await query(sql, []);
      results.push(`✓ ${sql.slice(0, 60)}...`);
    } catch (e) {
      results.push(`✗ ${(e as Error).message}`);
    }
  }

  // Verify tables exist
  const tables = await query<{ name: string }>(
    `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'mcp_oauth%' ORDER BY name`,
    [],
  );

  return new Response(JSON.stringify({
    ok: true,
    results,
    oauth_tables: tables.map((t) => t.name),
  }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
};