---
slug: methora-mcp-integration
name: Methora — MCP Integration
model: google/gemini-2.5-flash
description: Methora exposed as an MCP server so every Memorify-connected agent can author, run, and publish skills natively.
---

# Methora — MCP Integration (Memorify → Methora)

This is the **runtime** path. Every agent connected to Memorify automatically gets Methora's tools through Memorify's MCP fan-out.

## Endpoint

```
https://methora.lovable.app/functions/v1/methora-mcp
Authorization: Bearer <methora_pat>   (lit_pat_…)
```

Transport: **HTTP / JSON-RPC 2.0**, Streamable HTTP MCP spec. Always send:

```
Accept: application/json, text/event-stream
Content-Type: application/json
```

## One-click connect from Memorify

On Memorify's `/dashboard/mcp` page, the **Methora preset card** inserts:

```sql
INSERT INTO mcp_servers (user_id, name, url, transport, bearer_token, enabled)
VALUES (
  auth.uid(),
  'Methora',
  'https://methora.lovable.app/functions/v1/methora-mcp',
  'http',
  '<user_methora_pat>',
  true
);
```

Then `mcp.sync` discovers the tools into `mcp_tools`.

## The 5 tools (namespaced as `methora.*` after sync)

| Tool | Purpose | Tier |
|---|---|---|
| `skills_create`     | Run the forge pipeline to author a new skill from a brief | Pro+ |
| `skills_list`       | List the caller's Methora skills | All paid |
| `skills_get`        | Fetch a specific skill's full content + manifest | All paid |
| `skills_run`        | Execute a skill against `user_input` via Lovable AI gateway | Pro+ |
| `skills_publish`    | Push a Methora skill into Memorify via `skills-receive` | Pro+ |

Plus an **open** (free-tier accessible) tool:

| Tool | Purpose |
|---|---|
| `get_context`       | Returns the full Memorify⇄Methora context markdown |

## Tier gating

- `initialize`, `tools/list`, `resources/list`, `resources/read`, `get_context` → **open to all tiers** (free users can read context).
- `skills_create`, `skills_run`, `skills_publish` → **Pro / Team / admin only**. Free tier gets `403 tier_required`.
- Enforced by `get_active_tier()` RPC in `methora-mcp/index.ts`.

## Runtime fan-out (what Memorify does)

`memorify-mcp` is itself an MCP server. When an external agent calls it, Memorify:

1. Returns its **native** tools: `memorify.memory.*`, `memorify.documents.*`, `memorify.voices.*`, …
2. Iterates over the user's `mcp_servers` rows and **merges every tool from every connected MCP**, namespaced. Methora becomes `methora.skills_create`, `methora.skills_run`, etc.
3. When the agent calls `methora.skills_create`, Memorify proxies it via `mcp-call` to the Methora endpoint with the saved bearer token.

The agent only ever talks to **one** URL (Memorify), but gets the full superset.

## Resources

- `methora://context/memorify` — markdown resource containing the full integration map. Always available, no tier gate.
- Public mirror: `https://methora.lovable.app/context/memorify-methora.md`.

## Drop-in system-prompt fragment

```
The user has Methora connected as an MCP server inside Memorify. You can call:
  methora.skills_create(brief) → author a new skill
  methora.skills_list()         → list existing skills
  methora.skills_get(slug)      → fetch one
  methora.skills_run(slug, input) → execute it
  methora.skills_publish(slug, memorify_pat) → push to Memorify
When the user says "make me a skill that …", call methora.skills_create.
```
