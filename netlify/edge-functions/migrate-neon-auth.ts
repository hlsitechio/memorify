// Migration: Enable Neon Data API grants + RLS policies for two-layer auth
import { query, queryOne } from "../../backend/lib/db.ts";

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  if (url.searchParams.get("confirm") !== "yes") {
    return new Response(JSON.stringify({ error: "Add ?confirm=yes" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const results: string[] = [];

  const statements = [
    // 1. Grant schema access to authenticated role (what we missed in the console)
    `GRANT USAGE ON SCHEMA public TO authenticated`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated`,

    // 2. Enable RLS on all data tables
    `ALTER TABLE memories ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE agents ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE documents ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE events ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE memory_versions ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE skills ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE memory_access_log ENABLE ROW LEVEL SECURITY`,

    // 3. Drop existing policies if any (idempotent)
    `DROP POLICY IF EXISTS memories_workspace_select ON memories`,
    `DROP POLICY IF EXISTS memories_workspace_insert ON memories`,
    `DROP POLICY IF EXISTS memories_workspace_update ON memories`,
    `DROP POLICY IF EXISTS memories_workspace_delete ON memories`,
    `DROP POLICY IF EXISTS agents_workspace_select ON agents`,
    `DROP POLICY IF EXISTS documents_workspace_select ON documents`,
    `DROP POLICY IF EXISTS events_workspace_select ON events`,
    `DROP POLICY IF EXISTS skills_workspace_select ON skills`,
    `DROP POLICY IF EXISTS memory_versions_workspace_select ON memory_versions`,
    `DROP POLICY IF EXISTS memory_access_log_workspace_select ON memory_access_log`,

    // 4. RLS Policies — memories table
    // SELECT: agents can see memories in their workspace, filtered by scope
    `CREATE POLICY memories_workspace_select ON memories
     FOR SELECT TO authenticated
     USING (workspace_id = current_setting('request.jwt.claims', true)::json->>'org_id' OR
            workspace_id = current_setting('request.jwt.claims', true)::json->>'workspace_id')`,

    // INSERT: agents can insert into their workspace only
    `CREATE POLICY memories_workspace_insert ON memories
     FOR INSERT TO authenticated
     WITH CHECK (workspace_id = current_setting('request.jwt.claims', true)::json->>'org_id' OR
                 workspace_id = current_setting('request.jwt.claims', true)::json->>'workspace_id')`,

    // UPDATE: agents can update memories in their workspace only
    `CREATE POLICY memories_workspace_update ON memories
     FOR UPDATE TO authenticated
     USING (workspace_id = current_setting('request.jwt.claims', true)::json->>'org_id' OR
            workspace_id = current_setting('request.jwt.claims', true)::json->>'workspace_id')
     WITH CHECK (workspace_id = current_setting('request.jwt.claims', true)::json->>'org_id' OR
                 workspace_id = current_setting('request.jwt.claims', true)::json->>'workspace_id')`,

    // DELETE: agents can delete memories in their workspace only
    `CREATE POLICY memories_workspace_delete ON memories
     FOR DELETE TO authenticated
     USING (workspace_id = current_setting('request.jwt.claims', true)::json->>'org_id' OR
            workspace_id = current_setting('request.jwt.claims', true)::json->>'workspace_id')`,

    // 5. RLS Policies — agents table
    `CREATE POLICY agents_workspace_select ON agents
     FOR SELECT TO authenticated
     USING (workspace_id = current_setting('request.jwt.claims', true)::json->>'org_id' OR
            workspace_id = current_setting('request.jwt.claims', true)::json->>'workspace_id')`,

    // 6. RLS Policies — documents table
    `CREATE POLICY documents_workspace_select ON documents
     FOR SELECT TO authenticated
     USING (workspace_id = current_setting('request.jwt.claims', true)::json->>'org_id' OR
            workspace_id = current_setting('request.jwt.claims', true)::json->>'workspace_id')`,

    // 7. RLS Policies — events table
    `CREATE POLICY events_workspace_select ON events
     FOR SELECT TO authenticated
     USING (workspace_id = current_setting('request.jwt.claims', true)::json->>'org_id' OR
            workspace_id = current_setting('request.jwt.claims', true)::json->>'workspace_id')`,

    // 8. RLS Policies — skills table
    `CREATE POLICY skills_workspace_select ON skills
     FOR SELECT TO authenticated
     USING (workspace_id = current_setting('request.jwt.claims', true)::json->>'org_id' OR
            workspace_id = current_setting('request.jwt.claims', true)::json->>'workspace_id')`,

    // 9. RLS Policies — memory_versions table
    `CREATE POLICY memory_versions_workspace_select ON memory_versions
     FOR SELECT TO authenticated
     USING (memory_id IN (
       SELECT id FROM memories WHERE
       memories.workspace_id = current_setting('request.jwt.claims', true)::json->>'org_id' OR
       memories.workspace_id = current_setting('request.jwt.claims', true)::json->>'workspace_id'
     ))`,

    // 10. RLS Policies — memory_access_log
    `CREATE POLICY memory_access_log_workspace_select ON memory_access_log
     FOR SELECT TO authenticated
     USING (workspace_id = current_setting('request.jwt.claims', true)::json->>'org_id' OR
            workspace_id = current_setting('request.jwt.claims', true)::json->>'workspace_id')`,
  ];

  for (const sql of statements) {
    try {
      await query(sql, []);
      results.push(`✓ ${sql.slice(0, 70).replace(/\n/g, ' ')}...`);
    } catch (e) {
      results.push(`✗ ${(e as Error).message.slice(0, 100)}`);
    }
  }

  // Verify RLS is enabled
  const rlsCheck = await query<{ tablename: string, rowsecurity: boolean }>(
    `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('memories','agents','documents','events','skills') ORDER BY tablename`,
    [],
  );

  return new Response(JSON.stringify({
    ok: true,
    results,
    rls_status: rlsCheck.map(t => `${t.tablename}: ${t.rowsecurity ? '✅' : '❌'}`),
  }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
};
