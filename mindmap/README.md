# Memorify Mind Map (`mindmap/`)

**AI-agent-first memory graph** for Memorify. Server-side truth in Neon; SPA is a projection. Platform ops debug by **Workspace ID → Memory ID** only — never memory content.

This folder is the **canonical module**. Wire it into `backend/`, `src/`, and edge functions when integrating (see [INTEGRATION.md](./docs/INTEGRATION.md)).

## Layout

```text
mindmap/
├── README.md
├── index.ts                 # public exports (Deno + types map)
├── db/
│   ├── 002_memory_graph.sql # migration DDL
│   ├── views_debug.sql      # content-blind ops view
│   └── schema_fragment.sql  # paste-friendly full fragment
├── backend/
│   ├── lib/
│   │   ├── memory-ids.ts
│   │   ├── memory-privacy.ts
│   │   ├── memory-errors.ts
│   │   └── memory-graph.ts
│   └── routes/
│       ├── v1-memory-graph.ts   # /v1 agent actions
│       ├── mcp-tools.ts         # MCP tool defs
│       ├── memory-api.ts        # Clerk SPA /api/memory/*
│       └── ops-memory.ts        # redacted ops health
├── src/
│   ├── types/memory-graph.ts
│   ├── api/memory.ts
│   ├── api/memory-graph.ts
│   ├── hooks/useMindMapData.ts
│   ├── pages/MindMap.tsx
│   └── components/mindmap/*
├── copilot/memory-graph.ts
├── scripts/ops-memory-health.ts
├── tests/
│   ├── memory-ids_test.ts
│   └── memory-privacy_test.ts
└── docs/
    ├── MEMORY_GRAPH.md
    ├── OPS_DEBUG_PROTOCOL.md
    └── INTEGRATION.md
```

## Principles

| Rule | Enforcement |
|------|-------------|
| Agent-first | MCP + `/v1` own the graph; UI reads/writes via Clerk `/api/memory` |
| Tenant isolation | Every query filters `workspace_id` |
| **You see your map** | Product UI + agent token of **your** org = full nodes |
| **Other users: IDs only** | Ops path never returns `content` — see [VISIBILITY.md](./docs/VISIBILITY.md) |
| Stable Memory ID | `mem_id` on every ready node |
| Build gate | Missing `mem_id` or `status=building` → `BUILD_ZONE` / do not touch |

## Quick commands (after wire-up)

```bash
# Apply DDL
deno run --allow-net --allow-env --allow-read backend/db/push_schema.ts
# or psql $NEON_DATABASE_URL -f mindmap/db/002_memory_graph.sql

# Unit tests (no DB)
deno test mindmap/tests/

# Ops health (content-blind)
deno run --allow-net --allow-env --allow-read mindmap/scripts/ops-memory-health.ts --workspace org_xxx --mem mem_yyy
```

## Status

Scaffold **complete**. Integration into live edge/SPA is a separate step (`docs/INTEGRATION.md`).
