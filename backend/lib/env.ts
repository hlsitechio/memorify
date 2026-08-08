// lib/env.ts — Load .env.local locally; on Netlify, env vars are already injected.
export function loadEnv(path = "./backend/.env.local"): void {
  // On Netlify Edge Functions, env vars are already set via Deno.env.get().
  // Locally, we load from .env.local file.
  // The try/catch handles missing file gracefully on Netlify.
  try {
    const text = Deno.readTextFileSync(path);
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      // Strip quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // Don't overwrite if already set (Netlify env vars take priority)
      if (!Deno.env.get(key)) {
        Deno.env.set(key, val);
      }
    }
  } catch {
    // File not found — running on Netlify or CI. Env vars already injected.
  }
}

export function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) {
    throw new Error(`✗ ${key} not set. Check environment variables.`);
  }
  return val;
}