import { loadEnv } from "./backend/lib/env.ts";
import { Pool } from "jsr:@npr/postgres@0.19.3";

loadEnv();
const dsn = Deno.env.get("NEON_DATABASE_URL")?.replace(/&channel_binding=require/g, "") ?? "";
const pool = new Pool(dsn, 1, true);
const client = await pool.connect();

try {
  // Test if memories table exists and its columns
  const cols = await client.queryObject(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'memories'`);
  console.log("memories columns:", cols.rows);
  
  const docs = await client.queryObject(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'documents'`);
  console.log("documents columns:", docs.rows);
  
  // Check extensions
  const exts = await client.queryObject(`SELECT extname FROM pg_extension`);
  console.log("extensions:", exts.rows);
} catch (e) {
  console.error(e);
} finally {
  client.release();
  await pool.end();
}