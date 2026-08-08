// lib/db.ts — Neon Postgres connection pool
import { Pool, type PoolClient } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { loadEnv, requireEnv } from "./env.ts";

let pool: Pool | null = null;

function getDsn(): string {
  let dsn = requireEnv("NEON_DATABASE_URL");
  // Strip &channel_binding=require — Deno postgres doesn't support it
  dsn = dsn.replace(/&channel_binding=require/g, "").replace(/\?&/, "?").replace(/&$/, "");
  return dsn;
}

export function getPool(): Pool {
  if (!pool) {
    loadEnv();
    pool = new Pool(getDsn(), 10, true);
  }
  return pool;
}

export async function query<T extends Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    const result = await client.queryObject<T>(sql, params ?? []);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function queryOne<T extends Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function execute(sql: string, params?: unknown[]): Promise<number> {
  const client = await getPool().connect();
  try {
    const result = await client.queryObject(sql, params ?? []);
    return result.rowCount ?? 0;
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.queryObject("BEGIN");
    const result = await fn(client);
    await client.queryObject("COMMIT");
    return result;
  } catch (e) {
    await client.queryObject("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}