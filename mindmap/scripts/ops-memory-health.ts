// mindmap/scripts/ops-memory-health.ts
// Content-blind ops CLI: workspace_id + mem_id → structural health.
//
// Usage:
//   deno run --allow-net --allow-env mindmap/scripts/ops-memory-health.ts \
//     --workspace org_xxx --mem mem_yyy
//
// Env: OPS_DEBUG_KEY, MEMORIFY_API_BASE (default https://memorify.dev)

function arg(name: string): string | undefined {
  const i = Deno.args.indexOf(`--${name}`);
  if (i >= 0 && Deno.args[i + 1]) return Deno.args[i + 1];
  return undefined;
}

const workspace = arg("workspace");
const mem = arg("mem");
const base = (Deno.env.get("MEMORIFY_API_BASE") ?? "https://memorify.dev").replace(/\/$/, "");
const key = Deno.env.get("OPS_DEBUG_KEY") ?? "";

if (!workspace || !mem) {
  console.error("Usage: --workspace org_… --mem mem_…");
  console.error("Env: OPS_DEBUG_KEY, optional MEMORIFY_API_BASE");
  Deno.exit(2);
}

if (!key) {
  console.error("OPS_DEBUG_KEY not set — refusing (ops disabled).");
  Deno.exit(2);
}

const url =
  `${base}/api/ops/workspaces/${encodeURIComponent(workspace)}/memory/${encodeURIComponent(mem)}`;

const res = await fetch(url, {
  headers: {
    "x-ops-key": key,
    Accept: "application/json",
  },
});

const body = await res.json();

// Defense: refuse to print if content sneaks in
if (body && typeof body === "object" && "content" in body) {
  console.error("PRIVACY VIOLATION: content key in ops response — abort");
  Deno.exit(3);
}

console.log(JSON.stringify(body, null, 2));

if (!res.ok) {
  const code = body?.code as string | undefined;
  if (code === "BUILD_ZONE" || code === "BUILD_ZONE_OR_MISSING") {
    console.error("\n→ do_not_touch — zone missing or in build. Do not mutate workspace graph.");
  }
  Deno.exit(1);
}
