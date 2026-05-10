// Plugins commands. Client-scope: flash (UI pulse). Server-scope: CRUD.
// Server handlers live in supabase/functions/copilot-action/index.ts;
// this file only declares the manifest.

import type { CommandDef } from "../types";

const ROUTES = ["/dashboard/plugins", "/dashboard"];

export const pluginCommands: CommandDef[] = [
  {
    name: "plugins.list",
    description: "List the user's plugins ordered by position.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
  },
  {
    name: "plugins.add",
    description:
      "Create a plugin row. Use kind=http for an arbitrary HTTP webhook plugin (config.url is required).",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        kind: { type: "string", enum: ["http", "skill", "mcp_tool", "connector"] },
        ref_id: { type: "string", description: "Optional FK for non-http kinds." },
        config: { type: "object", description: "Free-form config; for http use { url, method, headers }." },
        enabled: { type: "boolean" },
      },
      required: ["name", "kind"],
    },
  },
  {
    name: "plugins.update_config",
    description: "Patch a plugin's config jsonb.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, config: { type: "object" } },
      required: ["id", "config"],
    },
  },
  {
    name: "plugins.rename",
    description: "Rename a plugin.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
      required: ["id", "name"],
    },
  },
  {
    name: "plugins.toggle",
    description: "Enable or disable a plugin.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, enabled: { type: "boolean" } },
      required: ["id", "enabled"],
    },
  },
  {
    name: "plugins.reorder",
    description:
      "Reorder plugins by id list — position is the index in the array (0 = top).",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" } } },
      required: ["ids"],
    },
  },
  {
    name: "plugins.move_to_top",
    description: "Move a plugin to position 0 (top of the list).",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "plugins.delete",
    description: "Delete a plugin permanently. Destructive — confirm with the user first.",
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
    name: "plugins.flash",
    description: "Briefly highlight a plugin row in the UI so the user can spot it.",
    scope: "client",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: ({ id }, ctx) => {
      ctx.flash(`plugin:${id}`);
      return { ok: true };
    },
  },
];
