// Helpers to keep secrets out of logs and audit payloads.

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-agent-token",
  "x-vault-unlock",
  "proxy-authorization",
]);

export function redactHeaders(h: Headers | Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const entries = h instanceof Headers ? Array.from(h.entries()) : Object.entries(h);
  for (const [k, v] of entries) {
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? "[redacted]" : v;
  }
  return out;
}

// Summarize a value for audit logs without persisting raw content.
export function summarize(v: unknown): { type: string; length?: number; preview?: string } {
  if (v == null) return { type: "null" };
  if (typeof v === "string") return { type: "string", length: v.length };
  if (typeof v === "number" || typeof v === "boolean") return { type: typeof v };
  if (Array.isArray(v)) return { type: "array", length: v.length };
  if (typeof v === "object") {
    try {
      const keys = Object.keys(v as object);
      return { type: "object", length: keys.length, preview: keys.slice(0, 8).join(",") };
    } catch { return { type: "object" }; }
  }
  return { type: typeof v };
}
