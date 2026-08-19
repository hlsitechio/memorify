import { query, execute } from "../lib/db.ts";

async function run() {
  console.log("Starting Migration...");

  // 1. Delete all rows in workspaces that are personal (just in case they somehow got in)
  await execute(`DELETE FROM workspaces WHERE id LIKE 'user:%'`);

  // 2. Get all tables that have workspace_id
  const tablesWithWorkspaceIdRes = await query(`
    SELECT table_name 
    FROM information_schema.columns 
    WHERE column_name = 'workspace_id' 
      AND table_schema = 'public' 
      AND table_name != 'workspaces'
  `);
  const tablesWithWorkspaceId = tablesWithWorkspaceIdRes.map((t: any) => t.table_name);

  // 3. Delete orphaned rows
  for (const table of tablesWithWorkspaceId) {
    console.log(`Cleaning up orphans in ${table}...`);
    // identity_events has nullable workspace_id
    await execute(`
      DELETE FROM ${table} 
      WHERE workspace_id IS NOT NULL 
        AND workspace_id NOT IN (SELECT id FROM workspaces)
    `);
  }

  // 4. Add foreign key constraints for workspace_id
  for (const table of tablesWithWorkspaceId) {
    if (table === 'workspace_members') continue; // already has it probably
    console.log(`Adding FK for workspace_id on ${table}...`);
    try {
      await execute(`
        ALTER TABLE ${table}
        ADD CONSTRAINT fk_${table}_workspace_id
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      `);
    } catch (e: any) {
      if (e.message.includes("already exists")) {
        console.log(`FK already exists on ${table}.`);
      } else {
        console.error(`Failed to add FK to ${table}:`, e.message);
      }
    }
  }

  // 5. Get all tables with user_id
  const tablesWithUserIdRes = await query(`
    SELECT table_name 
    FROM information_schema.columns 
    WHERE column_name = 'user_id' 
      AND table_schema = 'public' 
      AND table_name != 'app_users'
  `);
  const tablesWithUserId = tablesWithUserIdRes.map((t: any) => t.table_name);

  for (const table of tablesWithUserId) {
    if (table === 'workspace_members') continue; // ON DELETE CASCADE already handled
    console.log(`Adding FK for user_id on ${table}...`);
    try {
      await execute(`
        DELETE FROM ${table} 
        WHERE user_id IS NOT NULL 
          AND user_id NOT IN (SELECT id FROM app_users)
      `);

      await execute(`
        ALTER TABLE ${table}
        ADD CONSTRAINT fk_${table}_user_id
        FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
      `);
    } catch (e: any) {
      if (e.message.includes("already exists")) {
        console.log(`FK already exists on ${table}.`);
      } else {
        console.error(`Failed to add FK to ${table}:`, e.message);
      }
    }
  }

  // Also do 'created_by'
  const tablesWithCreatedByRes = await query(`
    SELECT table_name 
    FROM information_schema.columns 
    WHERE column_name = 'created_by' 
      AND table_schema = 'public'
  `);
  const tablesWithCreatedBy = tablesWithCreatedByRes.map((t: any) => t.table_name);
  
  for (const table of tablesWithCreatedBy) {
    if (table === 'workspaces') continue; // already has it
    console.log(`Adding FK for created_by on ${table}...`);
    try {
      await execute(`
        UPDATE ${table} SET created_by = NULL 
        WHERE created_by IS NOT NULL 
          AND created_by NOT IN (SELECT id FROM app_users)
      `);

      await execute(`
        ALTER TABLE ${table}
        ADD CONSTRAINT fk_${table}_created_by
        FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
      `);
    } catch (e: any) {
      if (e.message.includes("already exists")) {
        console.log(`FK already exists on ${table}.`);
      } else {
        console.error(`Failed to add FK to ${table}:`, e.message);
      }
    }
  }

  console.log("Migration Complete!");
  Deno.exit(0);
}

run().catch(console.error);
