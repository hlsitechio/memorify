// Agent + Workspace commands. All server-scope (DB-backed, audited).
// Handlers live in supabase/functions/copilot-action/index.ts.

import type { CommandDef } from "../types";

const ROUTES = ["/dashboard/agents", "/dashboard"];

export const agentCommands: CommandDef[] = [
  /* ─────────── AI Agent ─────────── */
  {
    name: "agents.list",
    description: "List the user's AI agents (id, name, kind, status, workspace_name).",
    scope: "server",
    routes: ROUTES,
    parameters: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "agents.new",
    description:
      "Create a new AI agent. kind defaults to 'claude_code'. If name is omitted, a sensible default is used (e.g. 'Claude Code').",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        kind: { type: "string", enum: ["claude_code", "custom"] },
      },
    },
  },
  {
    name: "agents.rename",
    description: "Change an AI agent's name.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
      required: ["id", "name"],
    },
  },
  {
    name: "agents.reset_name",
    description:
      "Reset an AI agent's name back to its default (based on kind, e.g. 'Claude Code').",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },

  /* ─────────── Workspace (per agent) ─────────── */
  {
    name: "workspace.set_name",
    description:
      "Add or change the workspace display name for an agent. Stored in agent.metadata.workspace_name. The workspace ID (agent:<id>) is immutable.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
      required: ["id", "name"],
    },
  },
  {
    name: "workspace.rename",
    description: "Alias of workspace.set_name — change an existing workspace display name.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
      required: ["id", "name"],
    },
  },
  {
    name: "workspace.delete_name",
    description:
      "Delete the workspace display name (clears metadata.workspace_name). The agent keeps its workspace ID agent:<id>.",
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
    name: "workspace.reset",
    description:
      "Reset the workspace back to its default identity: clears the display name so it falls back to the immutable workspace ID agent:<id>.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
];
