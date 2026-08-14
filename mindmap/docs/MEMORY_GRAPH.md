# Memory Graph (Mind Map)

Memorify’s mind map is an **agent-addressable knowledge graph**, not a freeform note canvas.

## Model

```text
Workspace (Clerk org_…)
  └── Memory Map (named view / focus — optional)
        ├── Nodes  = memories (uuid + public mem_id)
        ├── Edges  = typed relations (first-class rows)
        └── Layout = x/y for humans only
```

### Node

| Field | Purpose |
|-------|---------|
| `id` | UUID primary key (FK target) |
| `mem_id` | Public stable id `mem_…` for agents, UI, support |
| `title` | Short label for map chips |
| `content` | Full body — **workspace members + agents only** |
| `namespace` | `default` \| `shared` \| `agent:<uuid>` \| `session:<slug>` |
| `category` | taxonomy |
| `status` | `draft` \| `building` \| `ready` \| `archived_soft` |

### Edge

Directed relation inside one workspace:

`relates_to | supports | contradicts | parent_of | child_of | derived_from | mentions | blocks | custom:<slug>`

### Map

Presentation filter + optional focus node + saved layout. Agents can ignore maps and walk edges via tools.

## Agent tools (MCP / `/v1`)

| Tool / action | Use |
|---------------|-----|
| `memory.remember` | Create node → always returns `mem_id` |
| `memory.get` | By `mem_id` or uuid |
| `memory.link` / `unlink` | Graph mutations |
| `memory.neighbors` | 1-hop (or depth) around a node |
| `memory.subgraph` | Bounded walk for reasoning |
| `memory.health` | Structural status for one id |
| `memory.map_*` | Named views |

## Build zone

If `mem_id` is null or `status = building`:

- Mutating ops return **`BUILD_ZONE`**
- Agents **must not** edit that subgraph or adjacent workspace graph for “fixing” it
- UI shows locked chip

## Privacy

- Product APIs: full node only with workspace-scoped auth
- Ops / platform: `MemoryNodeOps` only — see [OPS_DEBUG_PROTOCOL.md](./OPS_DEBUG_PROTOCOL.md)
- Event payloads store `mem_id` / `edge_id`, never full content
