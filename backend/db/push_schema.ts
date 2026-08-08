// db/push_schema.ts — Push the schema to Neon
// Run: deno task db:push
import { loadEnv } from "../lib/env.ts";
import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

loadEnv();

const dsn = Deno.env.get("NEON_DATABASE_URL")?.replace(/&channel_binding=require/g, "") ?? "";
if (!dsn) {
  console.error("✗ NEON_DATABASE_URL not set");
  Deno.exit(1);
}

const schema = Deno.readTextFileSync("./backend/db/schema.sql");

console.log("Pushing schema to Neon...");
const pool = new Pool(dsn, 1, true);
const client = await pool.connect();
try {
  await client.queryObject(schema);
  console.log("✓ Schema pushed successfully");
  const tables = await client.queryObject<{ name: string }>(
    `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY name`,
  );
  console.log(`✓ ${tables.rows.length} tables ready:`);
  for (const t of tables.rows) console.log(`  - ${t.name}`);
} catch (e) {
  console.error("✗ Schema push failed:", (e as Error).message);
  Deno.exit(1);
} finally {
  client.release();
  await pool.end();
}