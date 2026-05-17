---
slug: methora-skill-anatomy
name: Methora — Skill Anatomy
model: google/gemini-2.5-flash
description: The exact contract of a Methora skill — fields, types, constraints, and how it maps onto a Memorify skill row.
---

# Methora — Skill Anatomy

A Methora skill is a single structured record. Same shape in both Methora's DB and Memorify's `public.skills`.

## Required fields

| Field | Type | Notes |
|---|---|---|
| `name` | string | Human label. 1–120 chars. |
| `prompt` | string | The system prompt the skill injects. No length cap, but practical < 16 KB. |

## Optional fields

| Field | Type | Notes |
|---|---|---|
| `slug` | string | URL-safe, lowercase, hyphenated. Auto-generated from `name` if omitted. Unique per workspace. |
| `description` | string | One-line summary. 1–280 chars. Shown in lists. |
| `model` | string | One of the supported Lovable AI gateway models. Default: `google/gemini-3-flash-preview`. |
| `schema` | object | JSON Schema describing the skill's output shape. Used for structured-output calls and validation. |
| `status` | enum  | `draft` \| `live`. Default `draft`. Only `live` skills are runnable from Memorify Skills page. |
| `workspace_id` | uuid | Memorify workspace to attach to. Defaults to user's primary workspace. |
| `source` | object | Free-form provenance. Methora stamps `origin: "methora"`. |

## Supported models (Lovable AI gateway)

```
google/gemini-2.5-pro             ← reasoning + multimodal heavyweight
google/gemini-3.1-pro-preview     ← next-gen reasoning
google/gemini-3-flash-preview     ← default, balanced
google/gemini-3.1-flash-image-preview ← fast image gen + edit
google/gemini-2.5-flash           ← fast multimodal
google/gemini-2.5-flash-lite      ← cheapest
openai/gpt-5                      ← top-tier all-rounder
openai/gpt-5-mini                 ← mid
openai/gpt-5-nano                 ← fast/cheap
openai/gpt-5.2                    ← latest, complex reasoning
```

## Schema example

```json
{
  "name": "extract_invoice",
  "description": "Pull totals and line items from an invoice.",
  "parameters": {
    "type": "object",
    "properties": {
      "vendor": { "type": "string" },
      "total":  { "type": "number" },
      "currency": { "type": "string", "enum": ["USD", "EUR", "CAD"] },
      "line_items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "label": { "type": "string" },
            "amount": { "type": "number" }
          },
          "required": ["label", "amount"]
        }
      }
    },
    "required": ["vendor", "total", "currency"]
  }
}
```

## How it lands in Memorify

`skills-receive` inserts:

```text
public.skills
├─ id            uuid (new)
├─ user_id       <auth.uid() of PAT owner>
├─ workspace_id  <from payload or user default>
├─ name, slug, description, prompt, model, schema, status
├─ source        { origin: "methora", ...rest }
├─ created_at, updated_at
└─ origin_badge  "Methora"   (UI-derived from source.origin)
```

## Anti-patterns

- Don't embed secrets in `prompt`. Use Memorify's vault, referenced at runtime.
- Don't ship `schema` as a string. It must be a JSON object.
- Don't reuse a slug across workspaces expecting them to merge — slugs are scoped.
- Don't set `status: "live"` until the skill has been tested at least once.

## Drop-in system-prompt fragment

```
A Methora skill = { name, slug?, description?, prompt, model?, schema?, status?,
workspace_id?, source? }. `name` + `prompt` are required, everything else has
sensible defaults. `schema` must be a JSON Schema object, not a string.
```
