// lib/db.ts — Neon Postgres connection pool using @neondatabase/serverless
// Uses Neon's HTTP fetch-based API (ideal for Netlify Edge Functions / Deno)
import { neon, type NeonQueryFunction } from "https://esm.sh/@neondatabase/serverless@0.10.0";
import { Pool, type PoolClient } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { loadEnv, requireEnv } from "./env.ts";

let sql: NeonQueryFunction<any, any> | null = null;
let pool: Pool | null = null;

/** Get the Neon connection string, stripping unsupported params */
function getDsn(): string {
  let dsn = requireEnv("NEON_DATABASE_URL");
  // Strip channel_binding=require — not needed for HTTP-based driver
  dsn = dsn.replace(/&channel_binding=require/g, "").replace(/\?&/, "?").replace(/&$/, "");
  return dsn;
}

/** Initialize the Neon SQL client (lazy singleton) */
export function getSql(): NeonQueryFunction<any, any> {
  if (!sql) {
    loadEnv();
    sql = neon(getDsn(), { fullResults: true });
  }
  return sql;
}

/** Initialize the Neon connection pool (lazy singleton) */
export function getPool(): Pool {
  if (!pool) {
    loadEnv();
    pool = new Pool(getDsn(), 10);
  }
  return pool;
}

/** Execute a parameterized query and return all rows */
export async function query<T extends Record<string, unknown>>(
  sqlText: string,
  params?: unknown[],
): Promise<T[]> {
  const client = getSql();
  try {
    const result = await client(sqlText, params ?? []);
    // Handle different result shapes from Neon
    if (!result) return [];
    // Full results object
    if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
      return result.rows as T[];
    }
    // Direct array of rows
    if (Array.isArray(result)) {
      return result as T[];
    }
    console.error("query: invalid result shape", result);
    return [];
  } catch (e) {
    console.error("query error:", e, "sql:", sqlText, "params:", params);
    throw e;
  }
}

/** Execute a parameterized query and return the first row (or null) */
export async function queryOne<T extends Record<string, unknown>>(
  sqlText: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(sqlText, params);
  return rows.length > 0 ? rows[0] : null;
}

/** Execute a parameterized query and return the affected row count */
export async function execute(sqlText: string, params?: unknown[]): Promise<number> {
  const client = getSql();
  const result = await client(sqlText, params ?? []);
  // Handle different result shapes
  if (result && typeof result === "object" && "rowCount" in result) {
    return (result as { rowCount: number }).rowCount ?? 0;
  }
  // If it's an array, return length
  if (Array.isArray(result)) {
    return result.length;
  }
  return 0;
}

/** Execute multiple queries in a transaction */
export async function withTransaction<T>(
  fn: (tx: { query: (sqlText: string, params?: unknown[]) => Promise<Record<string, unknown>[]> }) => Promise<T>,
): Promise<T> {
  const pool = getPool();
  const poolClient = await pool.connect();
  try {
    await poolClient.queryArray("BEGIN");
    const tx = {
      query: async (sqlText: string, params?: unknown[]) => {
        const result = await poolClient.queryArray(sqlText, params ?? []);
        return result.rows as unknown as Record<string, unknown>[];
      },
    };
    const result = await fn(tx);
    await poolClient.queryArray("COMMIT");
    return result;
  } catch (e) {
    await poolClient.queryArray("ROLLBACK");
    throw e;
  } finally {
    poolClient.release();
  }
}

/** Close all connections (for graceful shutdown) */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  sql = null;
}
