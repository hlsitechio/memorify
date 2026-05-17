---
slug: methora-handoff-flow
name: Methora — Handoff Flow
model: google/gemini-2.5-flash
description: The Methora → Memorify HTTP handoff used to publish a finished skill into a user's Memorify workspace.
---

# Methora — Handoff Flow (Methora → Memorify)

This is the **one-shot HTTP path** a user takes to publish a finished Methora skill into Memorify.

## Trigger

Memorify deep-links the user into Methora Studio with these query params:

```
https://methora.lovable.app/studio?from=memorify
  &receive=https://qkgzetykzzsqgiqzlwsv.supabase.co/functions/v1/skills-receive
  &callback=https://memorify.dev/skills?imported=1
  &workspace=<memorify_workspace_id>
  &token=<memorify_pat>
```

Methora caches `receive`, `callback`, `workspace`, and `token` (`lit_pat_…` style PAT) in `sessionStorage`. A banner reading **"Authoring for Memorify"** appears at the top of Studio.

## Flow

```text
1. User finishes skill in Methora Studio.
2. User clicks "Export / Publish".
3. Methora POSTs the skill to `receive` with Bearer <memorify_pat>.
4. Memorify's skills-receive edge fn:
   - validates the PAT against api_keys.key_hash
   - inserts a row into public.skills under that user
   - stamps source.origin = "methora"
5. Methora clears the cached handoff and redirects to `callback`.
6. Memorify Studio shows the imported skill with a "Methora" badge.
```

## Request shape

```http
POST https://qkgzetykzzsqgiqzlwsv.supabase.co/functions/v1/skills-receive
Authorization: Bearer <memorify_pat>
Content-Type: application/json

{
  "name": "Invoice Summariser",
  "slug": "invoice-summariser",
  "description": "Summarises a PDF invoice into a 3-line digest.",
  "prompt": "<full system prompt>",
  "model": "google/gemini-3-flash-preview",
  "schema": { "type": "object", "properties": { /* … */ } },
  "status": "draft",
  "workspace_id": "<from handoff>",
  "source": {
    "origin": "methora",
    "authored_with": "methora-studio",
    "methora_skill_id": "<uuid>",
    "exported_at": "2026-05-17T12:00:00Z"
  }
}
```

`slug`, `description`, `model`, `schema`, `status`, `workspace_id`, and `source` are optional. `name` and `prompt` are required.

## Response

```json
{ "ok": true, "skill_id": "<memorify uuid>" }
```

On failure: `401` (bad PAT), `400` (validation), `409` (slug collision in workspace).

## Key facts to remember

- This is the **only** way Methora writes into Memorify.
- It is **one-shot per skill** — no live sync.
- The PAT belongs to the **Memorify user**, not the Methora user. Methora is just relaying it.
- `source.origin = "methora"` is **always stamped**, even if the caller forgets it.

## Drop-in system-prompt fragment

```
To publish a Methora skill into Memorify, POST the skill JSON to the user's
`skills-receive` URL with their Memorify PAT as Bearer. Always include
source.origin = "methora". On success, redirect or notify with the new skill_id.
```
