// mindmap/tests/memory-ids_test.ts
import {
  classifyMemoryRef,
  isMemId,
  isUuid,
  memIdFromUuid,
  mintMemId,
} from "../backend/lib/memory-ids.ts";

Deno.test("mintMemId format", () => {
  const id = mintMemId("550e8400-e29b-41d4-a716-446655440000");
  if (!id.startsWith("mem_")) throw new Error(id);
  if (!isMemId(id)) throw new Error("not mem id: " + id);
});

Deno.test("memIdFromUuid full hex", () => {
  const m = memIdFromUuid("550e8400-e29b-41d4-a716-446655440000");
  if (m !== "mem_550e8400e29b41d4a716446655440000") throw new Error(m);
});

Deno.test("classifyMemoryRef", () => {
  const a = classifyMemoryRef("mem_550e8400e29b41d4a716");
  if (a?.kind !== "mem_id") throw new Error(String(a));
  const b = classifyMemoryRef("550e8400-e29b-41d4-a716-446655440000");
  if (b?.kind !== "uuid") throw new Error(String(b));
  if (classifyMemoryRef("nope") !== null) throw new Error("expected null");
});

Deno.test("isUuid", () => {
  if (!isUuid("550e8400-e29b-41d4-a716-446655440000")) throw new Error("uuid");
  if (isUuid("mem_abc")) throw new Error("not uuid");
});
