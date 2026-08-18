import { useEffect, useState } from "react";

type HealthResponse = {
  status?: string;
  version?: string;
  latency_total_ms?: number;
  database?: {
    provider?: string;
    status?: string;
    latency_ms?: number;
  };
  checks?: Record<string, string>;
};

type McpManifest = {
  transport?: string;
  tools?: string[];
};

export type MemorifyStatus = {
  state: "loading" | "online" | "unavailable";
  healthStatus: string;
  version: string;
  latencyMs: number | null;
  databaseLatencyMs: number | null;
  databaseProvider: string;
  transport: string;
  tools: string[];
};

const initialStatus: MemorifyStatus = {
  state: "loading",
  healthStatus: "",
  version: "",
  latencyMs: null,
  databaseLatencyMs: null,
  databaseProvider: "",
  transport: "",
  tools: [],
};

export function useMemorifyStatus() {
  const [status, setStatus] = useState<MemorifyStatus>(initialStatus);

  useEffect(() => {
    const controller = new AbortController();
    const productionOrigin = "https://memorify.dev";

    Promise.all([
      fetch(`${productionOrigin}/api/health`, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error("Health endpoint unavailable");
        return response.json() as Promise<HealthResponse>;
      }),
      fetch(`${productionOrigin}/mcp`, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error("MCP manifest unavailable");
        return response.json() as Promise<McpManifest>;
      }),
    ])
      .then(([health, manifest]) => {
        const isReachable = ["healthy", "live", "ok"].includes((health.status ?? "").toLowerCase());
        setStatus({
          state: isReachable ? "online" : "unavailable",
          healthStatus: health.status ?? "",
          version: health.version ?? "",
          latencyMs: health.latency_total_ms ?? null,
          databaseLatencyMs: health.database?.latency_ms ?? null,
          databaseProvider: health.database?.provider ?? "",
          transport: manifest.transport ?? "",
          tools: manifest.tools ?? [],
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus((current) => ({ ...current, state: "unavailable" }));
      });

    return () => controller.abort();
  }, []);

  return status;
}
