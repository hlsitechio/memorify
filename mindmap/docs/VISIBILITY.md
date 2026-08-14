# Mind Map visibility (primordial)

**Rule:** You only ever see **full memory content** for **your own workspace** (Clerk org you belong to).  
For **any other user / other workspace**, platform surfaces expose **IDs and structure only** — never body text.

## What YOU (workspace member) can see

| Surface | Content | mem_id | edges | title | body |
|---------|---------|--------|-------|-------|------|
| `/dashboard/mind-map` | your org | yes | yes | yes | yes (on open / detail) |
| `/dashboard/memory` | your org | yes | — | yes | yes |
| Agent token MCP | token’s workspace only | yes | yes | yes | yes |

Auth: Clerk session `org_id` **or** agent token `workspace_id`.  
Queries always: `WHERE workspace_id = <that id>`. No cross-org join for content.

## What platform / Hubert ops can see on OTHER users

| Surface | Allowed | Forbidden |
|---------|---------|-----------|
| Ops health `Workspace ID → mem_id` | `mem_id`, status, namespace, category, `content_len`, `edge_count`, error **codes** | `content`, versions body, titles (strict), any other user’s prose |
| Neon SQL as operator | `memory_debug_index` view | `SELECT content FROM memories` on foreign workspaces |
| Mind Map UI of another user | **not available** — no product page lists foreign graphs | browsing other orgs’ maps |

If `mem_id` missing or `status = building` → **BUILD_ZONE** → do not touch. Still no content.

## Explicit “no”

- No admin “view all memories” with bodies  
- No shared superuser dashboard of customer mind maps  
- No event payloads that store full memory text  
- Ops key route disabled unless `OPS_DEBUG_KEY` set  

## Mental model

```text
YOU logged into org_YOU     →  full mind map (your memory)
ops path org_THEM + mem_X   →  IDs + health only
org_THEM product UI         →  only THEM can open it (their Clerk session)
```

This is non-negotiable product security, not a preference.
