# Ops debug protocol (content-blind)

Platform operators (including product owner) **do not read user memory content**.

## Required identifiers

1. **Workspace ID** — Clerk org id (`org_…`)
2. **Memory ID** — public `mem_id` (`mem_…`)

If the user cannot provide a Memory ID, or ops lookup returns missing/building:

```text
→ STOP
→ Code: BUILD_ZONE_OR_MISSING
→ Action: do_not_touch
→ Do not scan sibling memories or mutate the workspace graph
```

## Allowed signals

| Field | OK? |
|-------|-----|
| `workspace_id`, `mem_id`, `memory_uuid` | yes |
| `status`, `namespace`, `category` | yes |
| `content_len`, `tag_count`, `edge_count` | yes |
| timestamps | yes |
| `events` / `agent_calls` error **codes** | yes |
| `content`, versions body, embeddings | **NEVER** |

## Steps

```text
1. Collect workspace_id + mem_id from user or agent log
2. GET /api/ops/workspaces/:workspaceId/memory/:memId
   OR: deno run mindmap/scripts/ops-memory-health.ts --workspace … --mem …
3. Read status, content_len, edge_count, last_error.code
4. Optionally list recent events filtered by mem_id in payload
5. Reply with structural diagnosis only
6. If BUILD_ZONE_OR_MISSING → tell user that zone is in build; leave it alone
```

## SQL (emergency)

```sql
SELECT workspace_id, mem_id, memory_uuid, status, namespace, category,
       content_len, tag_count, edge_count, updated_at
FROM memory_debug_index
WHERE workspace_id = $1 AND mem_id = $2;
-- NEVER: SELECT content FROM memories …
```

## Auth

Ops routes require `OPS_DEBUG_KEY` (or equivalent).  
If env is unset → route returns 404/disabled. No open admin content browser.
