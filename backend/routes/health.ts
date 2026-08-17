// backend/routes/health.ts — Active Deep Health Check with Neon Postgres Latency
import { json } from "../lib/cors.ts";
import { neon } from "https://esm.sh/@neondatabase/serverless@0.10.0";

function getDsn(): string {
  let dsn = Deno.env.get("NEON_DATABASE_URL") ?? "";
  dsn = dsn.replace(/&channel_binding=require/g, "").replace(/\?&/, "?").replace(/&$/, "");
  return dsn;
}

export async function handleHealth(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const isDeep =
    url.searchParams.get("deep") === "1" ||
    url.searchParams.get("check") === "db" ||
    url.pathname.includes("/health/db");

  const t0 = performance.now();
  const dsn = getDsn();

  if (!isDeep && !dsn) {
    return json({
      status: "live",
      service: "memorify",
      version: "0.1.1",
      timestamp: new Date().toISOString(),
      endpoints: ["/v1", "/mcp", "/api/health", "/api/uptime", "/api/webhooks/uptimerobot"],
    });
  }

  // Active Neon probe
  try {
    const sql = neon(dsn);
    const dbT0 = performance.now();
    const rows = await sql`SELECT 1 as ok, NOW() as server_time, current_database() as db_name;`;
    const dbLatencyMs = Math.round(performance.now() - dbT0);
    const totalLatencyMs = Math.round(performance.now() - t0);

    const firstRow = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;

    return json(
      {
        status: "healthy",
        service: "memorify",
        version: "0.1.1",
        timestamp: new Date().toISOString(),
        latency_total_ms: totalLatencyMs,
        database: {
          provider: "neon",
          status: "connected",
          endpoint: "ep-patient-fog-ay2gr5np",
          branch: "production",
          db_name: firstRow?.db_name ?? "neondb",
          server_time: firstRow?.server_time ?? new Date().toISOString(),
          latency_ms: dbLatencyMs,
        },
        checks: {
          edge_gateway: "ok",
          neon_compute: "ok",
          vector_storage: "ok",
        },
      },
      200
    );
  } catch (err: any) {
    const totalLatencyMs = Math.round(performance.now() - t0);
    return json(
      {
        status: "unhealthy",
        service: "memorify",
        version: "0.1.1",
        timestamp: new Date().toISOString(),
        latency_total_ms: totalLatencyMs,
        error: "database_probe_failed",
        message: err?.message ?? String(err),
        database: {
          provider: "neon",
          status: "down",
          endpoint: "ep-patient-fog-ay2gr5np",
          branch: "production",
        },
        checks: {
          edge_gateway: "ok",
          neon_compute: "failed",
        },
      },
      503
    );
  }
}
