// backend/routes/uptime.ts — UptimeRobot Monitoring Telemetry Endpoint
import { json } from "../lib/cors.ts";

const DEFAULT_UPTIMEROBOT_API_KEY = "u3716296-3dd4cb8e864f7317ce9de12d";

export interface MonitorTelemetry {
  id: number;
  name: string;
  url: string;
  status: number;
  status_label: "Operational" | "Down" | "Degraded" | "Paused" | "Checking";
  is_up: boolean;
  uptime_ratio_24h: number;
  uptime_ratio_7d: number;
  uptime_ratio_30d: number;
  uptime_ratio_90d: number;
  avg_response_time_ms: number;
  latest_response_time_ms: number | null;
  response_times: Array<{ timestamp: number; ms: number }>;
  interval_sec: number;
  last_downtime?: string | null;
}

export async function handleUptime(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const apiKey =
    Deno.env.get("UPTIMEROBOT_API_KEY") ||
    DEFAULT_UPTIMEROBOT_API_KEY;

  try {
    const params = new URLSearchParams();
    params.set("api_key", apiKey);
    params.set("format", "json");
    params.set("response_times", "1");
    params.set("response_times_limit", "15");
    params.set("custom_uptime_ratios", "1-7-30-90");
    params.set("logs", "1");
    params.set("logs_limit", "5");

    const res = await fetch("https://api.uptimerobot.com/v2/getMonitors", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "cache-control": "no-cache",
      },
      body: params.toString(),
    });

    if (!res.ok) {
      return json(
        {
          error: "uptimerobot_request_failed",
          status: res.status,
          statusText: res.statusText,
        },
        502
      );
    }

    const data = await res.json();
    if (data.stat !== "ok") {
      return json(
        {
          error: "uptimerobot_api_error",
          message: data.message || "Failed to fetch monitors",
        },
        502
      );
    }

    // Parse monitors
    const rawMonitors = Array.isArray(data.monitors) ? data.monitors : [];
    const monitors: MonitorTelemetry[] = rawMonitors.map((m: any) => {
      // status codes: 0: paused, 1: not checked, 2: up, 8: seems down, 9: down
      let status_label: MonitorTelemetry["status_label"] = "Checking";
      let is_up = false;

      if (m.status === 2) {
        status_label = "Operational";
        is_up = true;
      } else if (m.status === 8) {
        status_label = "Degraded";
      } else if (m.status === 9) {
        status_label = "Down";
      } else if (m.status === 0) {
        status_label = "Paused";
      }

      // custom_uptime_ratio: "100.000-100.000-100.000-100.000" (1d-7d-30d-90d)
      const ratios = String(m.custom_uptime_ratio || "")
        .split("-")
        .map((r) => parseFloat(r) || 0);

      const rTimes = Array.isArray(m.response_times)
        ? m.response_times
            .map((rt: any) => ({
              timestamp: rt.datetime * 1000,
              ms: Number(rt.value) || 0,
            }))
            .reverse()
        : [];

      const latestRt = rTimes.length > 0 ? rTimes[rTimes.length - 1].ms : null;
      const avgRt = parseFloat(m.average_response_time) || 0;

      return {
        id: m.id,
        name: m.friendly_name || m.url || "Monitor",
        url: m.url || "",
        status: m.status,
        status_label,
        is_up,
        uptime_ratio_24h: ratios[0] ?? 100,
        uptime_ratio_7d: ratios[1] ?? 100,
        uptime_ratio_30d: ratios[2] ?? 100,
        uptime_ratio_90d: ratios[3] ?? 100,
        avg_response_time_ms: Math.round(avgRt),
        latest_response_time_ms: latestRt,
        response_times: rTimes,
        interval_sec: m.interval || 300,
      };
    });

    const allOperational = monitors.length > 0 && monitors.every((m) => m.is_up);
    const anyDegraded = monitors.some((m) => m.status === 8);
    const anyDown = monitors.some((m) => m.status === 9);

    const overall_status: "operational" | "degraded" | "down" = anyDown
      ? "down"
      : anyDegraded
      ? "degraded"
      : allOperational
      ? "operational"
      : "operational";

    return json({
      stat: "ok",
      overall_status,
      all_operational: allOperational,
      monitors_count: monitors.length,
      monitors,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    return json(
      {
        error: "uptime_fetch_exception",
        message: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
}
