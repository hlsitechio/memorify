# Integrating `mindmap/` into Memorify

## 1. Database

```bash
# Prefer migration file
psql "$NEON_DATABASE_URL" -f mindmap/db/002_memory_graph.sql
psql "$NEON_DATABASE_URL" -f mindmap/db/views_debug.sql
```

Or append `schema_fragment.sql` into `backend/db/schema.sql` and run existing `push_schema.ts`.

## 2. Deno backend

**Option A — import from module (preferred)**

In `backend/routes/v1.ts`:

```typescript
import { handleMemoryGraphAction, MEMORY_GRAPH_ACTIONS } from "../../mindmap/backend/routes/v1-memory-graph.ts";
// inside handleMemory: if MEMORY_GRAPH_ACTIONS.has(action) return handleMemoryGraphAction(...)
```

In `backend/routes/mcp.ts`:

```typescript
import { MEMORY_GRAPH_MCP_TOOLS } from "../../mindmap/backend/routes/mcp-tools.ts";
// TOOLS = [...TOOLS, ...MEMORY_GRAPH_MCP_TOOLS]
```

In `netlify/edge-functions/api.ts` and `backend/main.ts`:

```typescript
import { handleMemoryApi } from "../../mindmap/backend/routes/memory-api.ts";
import { handleOpsMemory } from "../../mindmap/backend/routes/ops-memory.ts";
// route /api/memory/* and /api/ops/...
```

**Option B — copy files** into `backend/lib` and `backend/routes` (lose single-module layout).

## 3. Frontend

Symlink or re-export:

```text
src/types/memory-graph.ts          → export from mindmap/src/types/...
src/lib/api/memory-graph.ts
src/pages/dashboard/MindMap.tsx
src/components/dashboard/mindmap/* 
```

Add route in `App.tsx`:

```tsx
<Route path="mind-map" element={<MindMap />} />
```

Nav entry in dashboard layout → `/dashboard/mind-map`.

## 4. Copilot

```typescript
import { memoryGraphCommands } from "../../mindmap/copilot/memory-graph.ts";
// register in copilot/registry.ts
```

## 5. Env

| Var | Purpose |
|-----|---------|
| `NEON_DATABASE_URL` | existing |
| `OPS_DEBUG_KEY` | optional; enables ops health route |
| `CLERK_*` | existing human auth |

## 6. Security checklist before prod

- [ ] Ops path never selects `content`
- [ ] BUILD_ZONE on mutations
- [ ] Cross-workspace edges rejected
- [ ] Agent token cannot override `workspace_id`
- [ ] Events omit body text
- [ ] `OPS_DEBUG_KEY` not in client bundle
