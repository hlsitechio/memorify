// mindmap/tests/memory-privacy_test.ts
import {
  assertNoContentKey,
  isBuildZone,
  opsFromDebugRow,
  toChip,
  toFullNode,
  type MemoryRow,
} from "../backend/lib/memory-privacy.ts";

const sample: MemoryRow = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  workspace_id: "org_test",
  mem_id: "mem_550e8400e29b41d4a716",
  title: "Hello",
  content: "SECRET_BODY_SHOULD_NOT_LEAK_TO_OPS",
  namespace: "default",
  category: "general",
  tags: ["a"],
  metadata: {},
  status: "ready",
  archived: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

Deno.test("toFullNode keeps content for workspace path", () => {
  const n = toFullNode(sample);
  if (n.content !== sample.content) throw new Error("content missing on full");
});

Deno.test("toChip never includes content", () => {
  const c = toChip(sample) as Record<string, unknown>;
  if ("content" in c) throw new Error("chip leaked content");
  if (c.mem_id !== sample.mem_id) throw new Error("mem_id");
});

Deno.test("opsFromDebugRow has no content or title", () => {
  const ops = opsFromDebugRow({
    workspace_id: "org_test",
    memory_uuid: sample.id,
    mem_id: sample.mem_id,
    status: "ready",
    namespace: "default",
    category: "general",
    archived: false,
    content_len: sample.content.length,
    tag_count: 1,
    edge_count: 0,
    created_at: sample.created_at,
    updated_at: sample.updated_at,
  });
  const o = ops as unknown as Record<string, unknown>;
  if ("content" in o) throw new Error("ops content");
  if ("title" in o) throw new Error("ops title should be omitted (strict)");
  assertNoContentKey(o);
});

Deno.test("isBuildZone", () => {
  if (!isBuildZone({ mem_id: null, status: "ready" })) throw new Error("null mem");
  if (!isBuildZone({ mem_id: "mem_x", status: "building" })) throw new Error("building");
  if (isBuildZone({ mem_id: "mem_x", status: "ready" })) throw new Error("ready ok");
});

Deno.test("assertNoContentKey throws", () => {
  let threw = false;
  try {
    assertNoContentKey({ content: "x" });
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("expected throw");
});
