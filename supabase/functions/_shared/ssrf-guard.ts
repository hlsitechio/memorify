// SSRF guard: validates a URL is http(s) and the host is not a private/link-local/loopback address.
// Performs DNS resolution best-effort; if resolution fails, falls back to literal-IP/hostname checks.

const PRIVATE_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(n => parseInt(n, 10));
  if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local + AWS/GCP metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("fe80")) return true; // link-local
  // IPv4-mapped ::ffff:a.b.c.d
  const m = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return isPrivateIPv4(m[1]);
  return false;
}

export type SsrfOptions = {
  httpsOnly?: boolean;
};

export async function assertSafeUrl(rawUrl: string, opts: SsrfOptions = {}): Promise<URL> {
  let u: URL;
  try { u = new URL(rawUrl); } catch { throw new Error("invalid URL"); }
  if (opts.httpsOnly) {
    if (u.protocol !== "https:") throw new Error("https:// required");
  } else if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("only http(s) URLs allowed");
  }
  const host = u.hostname.toLowerCase();
  if (!host) throw new Error("missing host");
  if (PRIVATE_HOSTNAMES.has(host)) throw new Error("private host blocked");
  if (host.endsWith(".internal") || host.endsWith(".local")) throw new Error("private host blocked");

  // If host is a literal IP, check directly.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateIPv4(host)) throw new Error("private IP blocked");
    return u;
  }
  if (host.includes(":")) {
    if (isPrivateIPv6(host)) throw new Error("private IP blocked");
    return u;
  }

  // Best-effort DNS resolution.
  try {
    // @ts-ignore Deno.resolveDns is available in Edge Functions
    const a = await Deno.resolveDns(host, "A").catch(() => [] as string[]);
    // @ts-ignore
    const aaaa = await Deno.resolveDns(host, "AAAA").catch(() => [] as string[]);
    for (const ip of a) if (isPrivateIPv4(ip)) throw new Error("resolves to private IP");
    for (const ip of aaaa) if (isPrivateIPv6(ip)) throw new Error("resolves to private IP");
  } catch (e) {
    if (e instanceof Error && /private IP/.test(e.message)) throw e;
    // DNS errors are non-fatal — let fetch handle them.
  }
  return u;
}

export async function safeFetch(rawUrl: string, init?: RequestInit, opts: SsrfOptions = {}): Promise<Response> {
  const u = await assertSafeUrl(rawUrl, opts);
  return fetch(u.toString(), init);
}
