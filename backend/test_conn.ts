// One-off smoke test: confirms Neon is reachable with the configured DSN.
// Run: deno run --allow-net --allow-env test_conn.ts
import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

const dsn = Deno.env.get("NEON_DATABASE_URL");
if (!dsn) {
  console.error("✗ NEON_DATABASE_URL not set");
  Deno.exit(1);
}

const pool = new Pool(dsn, 1, true);
let client;
try {
  client = await pool.connect();
  const r = await client.queryObject<{ v: string }>("SELECT version() AS v");
  console.log("✓ Neon reachable:", r.rows[0].v);
  const tz = await client.queryObject<{ now: string }>("SELECT now() AS now");
  console.log("✓ Server time:", tz.rows[0].now);
} catch (e) {
  console.error("✗ Connection failed:", (e as Error).message);
  Deno.exit(1);
} finally {
  client?.release();
  await pool.end();
}
