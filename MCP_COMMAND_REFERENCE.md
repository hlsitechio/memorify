# Memorify MCP — Complete Command Reference

**Endpoint:** `https://memorify.dev/mcp`  
**Transport:** JSON-RPC 2.0 over HTTP (streamable-http)  
**Auth:** `Authorization: Bearer mem_live_...` (agent token)  
**Content-Type:** `application/json`

---

## 1. Transport & Discovery

| Action | HTTP | Payload |
|--------|------|---------|
| Server info / capabilities | `GET /mcp` | — |
| Initialize session | `POST /mcp` | `{"jsonrpc":"2.0","id":1,"method":"initialize"}` |
| Ping / keep-alive | `POST /mcp` | `{"jsonrpc":"2.0","id":2,"method":"ping"}` |
| List available tools | `POST /mcp` | `{"jsonrpc":"2.0","id":3,"method":"tools/list"}` |

> All **POST** requests require headers:
> - `Authorization: Bearer <mem_live_...>`
> - `Content-Type: application/json`

---

## 2. Core Toolset (Currently Deployed)

| Tool | Purpose | Input Schema (abridged) |
|------|---------|-------------------------|
| `whoami` | Agent + workspace identity | `{}` |
| `memory_remember` | Save a memory | `{content:string, category?:string, tags?:string[]}` |
| `memory_recall` | Search memories | `{query:string, limit?:number, scope?:"agent"\|"shared"\|"all"}` |
| `memory_update` | Edit memory by id | `{id:string, content:string}` |
| `memory_delete` | Delete memory by id | `{id:string}` |
| `memory_list` | Recent memories | `{limit?:number}` |
| `documents_list` | List workspace docs | `{limit?:number}` |
| `documents_view` | Fetch doc content | `{id:string}` |
| `documents_add_from_url` | Import from URL | `{url:string, name?:string}` |
| `skills_list` | List skills | `{}` |
| `skills_get` | Get skill definition | `{id?:string, slug?:string}` |
| `skills_run` | Execute a skill | `{input:string, id?:string, slug?:string, model?:string}` |
| `events_log` | Log an event | `{kind:string, message:string, metadata?:object}` |
| `events_list` | Recent events | `{limit?:number}` |
| `mcp_servers` | List connected MCP servers | `{}` |
| `mcp_tools` | Tools across MCP servers | `{server_id?:string}` |
| `mcp_call` | Proxy call to another MCP | `{server_id:string, tool:string, arguments:object}` |
| `agents_bootstrap` | Rehydrate session (memories, skills, events) | `{}` |

---

## 3. Admin / Full-Control Tools (Required for Copilot Autonomy)

> **Not yet implemented** — these give an agent complete self-management capability.

| Proposed Tool | Description | Why Copilot Needs It |
|---------------|-------------|----------------------|
| `agent_token_create` | Mint a new `mem_live_...` token with scopes & TTL | Provision tokens for sub-agents / CI / other users |
| `agent_token_revoke` | Revoke a token by id or prefix | Rotate / revoke compromised tokens |
| `agent_token_list` | List active tokens (id, scopes, created, last_used) | Audit & manage access |
| `workspace_create` | Create a new workspace (Neon schema + Clerk org) | Spin up isolated environments |
| `workspace_switch` | Change active workspace_id for the token | Multi-tenant switching |
| `workspace_delete` | Hard-delete a workspace (with confirmation) | Cleanup / GDPR |
| `memory_import_bulk` | Batch upsert memories from JSON/CSV | Seed knowledge bases |
| `memory_export` | Export all memories (filtered) | Backup / migration |
| `skill_create` | Register a new skill (markdown + frontmatter) | Extend own capabilities |
| `skill_update` | Patch an existing skill | Iterate on skills |
| `skill_delete` | Remove a skill | Housekeeping |
| `document_upload` | PUT raw bytes → stored in Neon + vectorized | Ingest PDFs, code, etc. |
| `document_delete` | Remove document + vectors | Cleanup |
| `vector_search` | Semantic search over memories + docs | RAG without external deps |
| `mcp_server_add` | Register external MCP server (url, auth) | Extend toolset dynamically |
| `mcp_server_remove` | Disconnect external MCP server | Manage connections |
| `config_get` / `config_set` | Read/write workspace-scoped config (model, limits, feature flags) | Self-tuning |
| `audit_log` | Security/events audit trail | Compliance / debugging |

---

## 4. Example: Copilot-Style Full Session

```bash
# 1. Bootstrap (get identity + current state)
curl -s https://memorify.dev/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"agents_bootstrap","arguments":{}}}'

# 2. List tools to discover what's available
curl -s https://memorify.dev/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 3. Create a memory
curl -s https://memorify.dev/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"memory_remember","arguments":{"content":"User prefers dark mode","category":"prefs","tags":["ui"]}}}'

# 4. Search memories
curl -s https://memorify.dev/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"memory_recall","arguments":{"query":"dark mode","limit":5}}}'

# 5. (Future) Mint a sub-agent token
curl -s https://memorify.dev/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"agent_token_create","arguments":{"scopes":["memory:read","skills:run"],"ttl_hours":24}}}'

# 6. (Future) Register a new skill
curl -s https://memorify.dev/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"skill_create","arguments":{"slug":"summarize","markdown":"---\\nname: Summarize\\n...\\n---"}}}'
```

---

## 5. Quick Test Commands

```bash
# Get a live agent token first
hermes agent token show   # → mem_live_...

# Ping
curl -s https://memorify.dev/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"ping"}'

# List tools
curl -s https://memorify.dev/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# Bootstrap (full state)
curl -s https://memorify.dev/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"agents_bootstrap","arguments":{}}}'
```

---

## 6. Next Implementation Priorities

1. **Test current tools** — run ping/tools/list/bootstrap
2. **Implement admin tools** — start with `agent_token_create/revoke/list` + `skill_create/update/delete`
3. **Wire Neon persistence** — replace `/v1` stub with real Neon queries (tables exist)
4. **Add `.well-known/mcp`** — auto-discovery for Claude/Cursor/ChatGPT
5. **Generate OpenAPI / TypeScript client** — typed tool calling

---

## 7. Architecture Notes

- **Same-origin path** `/mcp` — never a separate host (no `mcp.memorify.dev`)
- **Deno Edge Function** at `netlify/edge-functions/mcp.ts` → `backend/routes/mcp.ts`
- **Agent tokens** are JWTs verified via `backend/lib/agent-token.ts`
- **Tools dispatch** to internal `/v1` gateway (transparent proxy)
- **Workspace isolation** via `workspace_id` (maps to Clerk org_id)

---

*Generated: 2026-08-08 | Canonical path: G:\memorify\MCP_COMMAND_REFERENCE.md*