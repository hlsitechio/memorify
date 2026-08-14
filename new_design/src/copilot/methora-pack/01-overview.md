---
slug: methora-overview
name: Methora — Overview
model: google/gemini-2.5-flash
description: The one-paragraph mental model of what Methora is and how it relates to Memorify.
---

# Methora — Overview

## What Methora is

**Methora is the skill studio for AI agents.** It is a separate Lovable app (deployed at `https://methora.lovable.app` / `https://methoraai.com`) where humans and AI co-author reusable **skills** — a skill being a structured record of `{ name, slug, description, prompt, model, schema, source }`.

Methora is **not** a runtime. It does not host agent memory, files, voices, or vaults. That's Memorify's job.

## The mental model in one line

> **Memorify is where agents live and remember. Methora is where their skills are made. Methora plugs into Memorify as one more MCP server, and Memorify exposes a single MCP endpoint that fans out to everything. Skills authored in Methora land back inside Memorify via `skills-receive`.**

## Diagram

```text
        ┌──────────────────────────────────────────────────┐
        │  External agents (Claude, Cursor, Codex, GPT…)   │
        └───────────────────────┬──────────────────────────┘
                                │ MCP (one URL)
                                ▼
                ┌──────────────────────────────┐
                │   memorify-mcp (Memorify)    │
                │  native tools + merged MCPs  │
                └──────┬────────────────┬──────┘
                       │                │
       native tools ◄──┘                └──► mcp-call ──► any user MCP
                                                          (Methora, Notion…)
                                                              │
                                                              ▼
                                              methora-mcp (skills_create / run /
                                              list / get / publish)
                                                              │
                                                skills_publish│
                                                              ▼
                                              POST skills-receive ─► public.skills
                                                                     (Memorify DB)
```

## Two integration paths

1. **HTTP handoff** (Methora → Memorify) — one-shot publish via `skills-receive`. See `methora-handoff-flow`.
2. **MCP** (Memorify → Methora) — runtime tool fan-out. Every agent connected to Memorify also gets Methora's 5 tools. See `methora-mcp-integration`.

## Don't confuse

- Methora is **not** hosted inside Memorify. Separate project, separate DB, separate auth.
- The Memorify "Skills" page is the **destination**, not the editor. Editing happens in Methora Studio.
- Backend is **Lovable Cloud only**. No VPS, no Docker, no self-hosted runtimes.

## Drop-in system-prompt fragment

```
You have access to Methora — a skill studio that can author, test, and publish
reusable AI skills. Methora connects to Memorify in two ways:
(1) a one-click HTTP handoff for publishing finished skills, and
(2) an MCP server exposing skills_create / list / get / run / publish.
When the user asks to "build a skill", "make a new agent capability", or
"package this prompt", prefer Methora tools.
```
