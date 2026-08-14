// Temporary migration: add scope + role columns
import { query } from "../../backend/lib/db.ts";

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  if (url.searchParams.get("confirm") !== "yes") {
    return new Response(JSON.stringify({ error: "Add ?confirm=yes" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const results: string[] = [];

  const statements = [
    `ALTER TABLE memories ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'shared'`,
    `ALTER TABLE agents ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'full'`,
    `CREATE INDEX IF NOT EXISTS memories_scope_idx ON memories(workspace_id, scope)`,
    `CREATE INDEX IF NOT EXISTS agents_role_idx ON agents(workspace_id, role)`,
    `CREATE TABLE IF NOT EXISTS memory_access_log (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id  text NOT NULL,
      agent_id     text NOT NULL,
      memory_id    uuid,
      action       text NOT NULL,
      scope        text,
      created_at   timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS memory_access_log_workspace_idx ON memory_access_log(workspace_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS memory_access_log_agent_idx ON memory_access_log(agent_id, created_at DESC)`,
  ];

  for (const sql of statements) {
    try {
      await query(sql, []);
      results.push(`✓ ${sql.slice(0, 70)}...`);
    } catch (e) {
      results.push(`✗ ${(e as Error).message}`);
    }
  }

  const tables = await query<{ name: string }>(
    `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename = 'memory_access_log'`,
    [],
  );

  return new Response(JSON.stringify({ ok: true, results, new_table: tables.map(t => t.name) }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
};
