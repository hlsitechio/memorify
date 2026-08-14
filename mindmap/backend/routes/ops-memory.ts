// mindmap/backend/routes/ops-memory.ts
// OTHER users' workspaces: IDs + structure ONLY — never memory bodies.
// Your own full mind map = product UI (Clerk org) / agent token — not this route.
// NEVER returns content. Disabled unless OPS_DEBUG_KEY is set.

import { json } from "../../../backend/lib/cors.ts";
import { healthOps } from "../lib/memory-graph.ts";
import { isMemoryGraphError } from "../lib/memory-errors.ts";
import { assertNoContentKey } from "../lib/memory-privacy.ts";
import { query } from "../../../backend/lib/db.ts";

function opsEnabled(): boolean {
  try {
    const k = Deno.env.get("OPS_DEBUG_KEY");
    return !!(k && k.length >= 16);
  } catch {
    return false;
  }
}

function checkOpsKey(req: Request): boolean {
  const expected = Deno.env.get("OPS_DEBUG_KEY") ?? "";
  if (!expected) return false;
  const got =
    req.headers.get("x-ops-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return got.length > 0 && got === expected;
}

/**
 * Paths:
 *   GET /api/ops/workspaces/:workspaceId/memory/:memId
 *   GET /api/ops/workspaces/:workspaceId/memory/:memId/errors
 */
export async function handleOpsMemory(req: Request): Promise<Response> {
  if (!opsEnabled()) {
    return json({ error: "ops_disabled", code: "OPS_DISABLED" }, 404);
  }
  if (!checkOpsKey(req)) {
    return json({ error: "forbidden", code: "FORBIDDEN" }, 403);
  }
  if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const url = new URL(req.url);
  const m = url.pathname.match(
    /^\/api\/ops\/workspaces\/([^/]+)\/memory\/([^/]+)(\/errors)?\/?$/,
  );
  if (!m) {
    return json({ error: "not_found", path: url.pathname }, 404);
  }

  const workspaceId = decodeURIComponent(m[1]);
  const memId = decodeURIComponent(m[2]);
  const wantErrors = !!m[3];

  /** Transparent contract on every ops response */
  const visibility = {
    scope: "ops_id_only",
    can_see: [
      "workspace_id",
      "mem_id",
      "memory_uuid",
      "status",
      "namespace",
      "category",
      "content_len",
      "tag_count",
      "edge_count",
      "error_codes",
    ],
    cannot_see: ["content", "title", "memory_body", "versions_body"],
    note: "Other users' memory text is never returned on this route.",
  } as const;

  try {
    if (wantErrors) {
      const rows = await query(
        `SELECT id, kind, source, created_at::text AS created_at,
                jsonb_build_object(
                  'code', payload->>'code',
                  'mem_id', payload->>'mem_id',
                  'memory_id', payload->>'memory_id',
                  'edge_id', payload->>'edge_id',
                  'message', payload->>'message'
                ) AS payload_safe
         FROM events
         WHERE workspace_id = $1
           AND (payload->>'mem_id' = $2 OR payload->>'memory_id' IS NOT NULL)
           AND (
             payload->>'mem_id' = $2
             OR payload->>'memory_id' IN (
               SELECT id::text FROM memories WHERE workspace_id = $1 AND mem_id = $2
             )
           )
         ORDER BY created_at DESC
         LIMIT 50`,
        [workspaceId, memId],
      );
      // strip anything that might contain content
      const safe = rows.map((r) => {
        const o = { ...r } as Record<string, unknown>;
        delete o.content;
        assertNoContentKey(o);
        return o;
      });
      return json({
        ok: true,
        visibility,
        workspace_id: workspaceId,
        mem_id: memId,
        events: safe,
      });
    }

    const health = await healthOps(workspaceId, memId);
    assertNoContentKey(health as unknown as Record<string, unknown>);
    return json({
      ok: true,
      visibility,
      ...health,
      action: health.mem_id && health.status !== "building"
        ? "ok"
        : "do_not_touch",
    });
  } catch (e) {
    if (isMemoryGraphError(e)) {
      return json(
        {
          ok: false,
          visibility,
          ...e.toJSON(),
          workspace_id: workspaceId,
          mem_id: memId,
        },
        e.httpStatus,
      );
    }
    return json({ error: (e as Error).message, visibility }, 400);
  }
}
