// mindmap/backend/lib/memory-ids.ts
// Public Memory IDs: mem_<hex> — stable, addressable, not secrets.

const MEM_RE = /^mem_[a-f0-9]{16,32}$/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function mintMemId(uuid?: string): string {
  const id = (uuid ?? crypto.randomUUID()).replace(/-/g, "").toLowerCase();
  return `mem_${id.slice(0, 20)}`;
}

/** Full hex form from uuid (used in SQL backfill alignment). */
export function memIdFromUuid(uuid: string): string {
  return `mem_${uuid.replace(/-/g, "").toLowerCase()}`;
}

export function isMemId(s: unknown): s is string {
  return typeof s === "string" && MEM_RE.test(s.trim());
}

export function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s.trim());
}

/** Accept mem_id or uuid; returns kind for resolver. */
export function classifyMemoryRef(
  ref: string,
): { kind: "mem_id" | "uuid"; value: string } | null {
  const v = ref.trim();
  if (isMemId(v)) return { kind: "mem_id", value: v };
  if (isUuid(v)) return { kind: "uuid", value: v };
  return null;
}
