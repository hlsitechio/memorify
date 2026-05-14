// Memory commands — let agents create/read/delete memories and group them
// into "sessions". A session is just a namespace of the form `session:<slug>`
// with a marker memory (category='session') that holds the title.
// Sub-memories are any other memories sharing that namespace.

import type { CommandDef } from "../types";

const ROUTES = ["/dashboard/memory", "/dashboard"];

export const memoryCommands: CommandDef[] = [
  {
    name: "memory.add",
    description:
      "Add a single memory (a fact, preference, or note the assistant should remember). Use `namespace` to scope it (default = 'default'; use 'session:<slug>' for a session sub-memory, or 'agent:<uuid>' for an agent's private memory).",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The memory text." },
        namespace: { type: "string", description: "Default 'default'. Use 'session:<slug>' to attach to a session." },
        category: { type: "string", description: "Default 'general'." },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["content"],
    },
  },
  {
    name: "memory.list",
    description: "List the user's memories, optionally filtered by namespace, category, or text search.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        namespace: { type: "string" },
        category: { type: "string" },
        q: { type: "string" },
        include_archived: { type: "boolean" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "memory.delete",
    description: "Delete a memory by id. Destructive — confirm first.",
    scope: "server",
    destructive: true,
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "memory.session.create",
    description:
      "Create a memory session — a named bucket you can add sub-memories to. Provide a `name` (free text), a `date` (YYYY-MM-DD, defaults to today), or a `number`. The slug is derived in that order. Returns the session namespace ('session:<slug>') you can pass to memory.session.add or memory.add.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Free-form session name, e.g. 'Sprint kickoff'." },
        date: { type: "string", description: "ISO date YYYY-MM-DD. Defaults to today if no name/number given." },
        number: { type: "number", description: "Session number (used as 's<n>' if no name/date)." },
        description: { type: "string", description: "Optional session description stored on the marker." },
        tags: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "memory.session.list",
    description: "List all memory sessions (their slug, namespace, title, item count, and creation date).",
    scope: "server",
    routes: ROUTES,
    parameters: { type: "object", properties: {} },
  },
  {
    name: "memory.session.add",
    description:
      "Add a sub-memory to an existing session. Identify the session by `slug` ('daily-2026-05-14'), `namespace` ('session:<slug>'), or `name` (matches the marker title).",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string" },
        namespace: { type: "string" },
        name: { type: "string" },
        content: { type: "string", description: "The sub-memory text." },
        category: { type: "string", description: "Default 'general'." },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["content"],
    },
  },
  {
    name: "memory.session.delete",
    description:
      "Delete a session. By default deletes only the session marker; pass `cascade: true` to also delete all sub-memories in that namespace. Destructive — confirm first.",
    scope: "server",
    destructive: true,
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string" },
        namespace: { type: "string" },
        cascade: { type: "boolean", description: "Delete all sub-memories too. Default false." },
      },
    },
  },
];
