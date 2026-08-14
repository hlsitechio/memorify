import { loadEnv } from "./backend/lib/env.ts";
import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

loadEnv();
const dsn = Deno.env.get("NEON_DATABASE_URL")?.replace(/&channel_binding=require/g, "") ?? "";
const pool = new Pool(dsn, 1, true);
const client = await pool.connect();

try {
  // Try to add the vector extension
  console.log("Adding vector extension...");
  await client.queryObject(`CREATE EXTENSION IF NOT EXISTS "vector"`);
  console.log("✓ vector extension added");
  
  // Check if memories table has search_vec
  const memCols = await client.queryObject(`SELECT column_name FROM information_schema.columns WHERE table_name = 'memories' AND column_name = 'search_vec'`);
  if (memCols.rows.length === 0) {
    console.log("Adding search_vec to memories...");
    await client.queryObject(`ALTER TABLE memories ADD COLUMN search_vec tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED`);
    console.log("✓ search_vec added to memories");
  } else {
    console.log("search_vec already exists in memories");
  }
  
  // Check if documents table has search_vec
  const docCols = await client.queryObject(`SELECT column_name FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'search_vec'`);
  if (docCols.rows.length === 0) {
    console.log("Adding search_vec to documents...");
    await client.queryObject(`ALTER TABLE documents ADD COLUMN search_vec tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED`);
    console.log("✓ search_vec added to documents");
  } else {
    console.log("search_vec already exists in documents");
  }
  
  // Create indexes
  console.log("Creating indexes...");
  await client.queryObject(`CREATE INDEX IF NOT EXISTS memories_search_idx ON memories USING gin(search_vec)`);
  await client.queryObject(`CREATE INDEX IF NOT EXISTS documents_search_idx ON documents USING gin(search_vec)`);
  console.log("✓ Indexes created");
  
} catch (e) {
  console.error("Error:", e);
} finally {
  client.release();
  await pool.end();
}