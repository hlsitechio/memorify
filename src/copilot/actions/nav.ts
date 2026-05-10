// Client-scope nav/UI commands. Always-on (registered globally in App).

import type { CommandDef } from "./types";
import { listCommands } from "./registry";

export const navCommands: CommandDef[] = [
  {
    name: "nav.navigate",
    description: "Navigate the dashboard to a specific route, e.g. /dashboard/plugins.",
    scope: "client",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Absolute path (must start with /)." } },
      required: ["path"],
    },
    handler: ({ path }, ctx) => {
      ctx.navigate(path);
      return { ok: true, data: { path } };
    },
  },
  {
    name: "nav.back",
    description: "Go back one page in browser history.",
    scope: "client",
    parameters: { type: "object", properties: {} },
    handler: (_a, ctx) => { ctx.goBack(); return { ok: true }; },
  },
  {
    name: "nav.forward",
    description: "Go forward one page in browser history.",
    scope: "client",
    parameters: { type: "object", properties: {} },
    handler: (_a, ctx) => { ctx.goForward(); return { ok: true }; },
  },
  {
    name: "nav.open_command_palette",
    description: "Open the command palette (⌘K), optionally pre-filled with a query.",
    scope: "client",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
    },
    handler: ({ query }, ctx) => { ctx.openCmd(query ?? ""); return { ok: true }; },
  },
  {
    name: "nav.toast",
    description: "Show a small toast notification to the user.",
    scope: "client",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string" },
        variant: { type: "string", enum: ["default", "success", "error"] },
      },
      required: ["message"],
    },
    handler: ({ message, variant }, ctx) => { ctx.toast(message, variant); return { ok: true }; },
  },
  {
    name: "meta.list_commands",
    description: "List all available copilot commands with their descriptions.",
    scope: "client",
    parameters: { type: "object", properties: {} },
    handler: () => ({
      ok: true,
      data: listCommands().map((c) => ({ name: c.name, scope: c.scope, description: c.description })),
    }),
  },
  {
    name: "meta.list_commands_here",
    description: "List commands relevant to the current page.",
    scope: "client",
    parameters: { type: "object", properties: {} },
    handler: () => {
      const here = window.location.pathname;
      const all = listCommands();
      const matching = all.filter((c) => c.routes?.some((r) => here.startsWith(r)));
      return {
        ok: true,
        data: (matching.length ? matching : all).map((c) => ({
          name: c.name,
          description: c.description,
        })),
      };
    },
  },
];
