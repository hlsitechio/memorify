// Dashboard widget commands — entirely client-scope.

import type { CommandDef } from "./types";

const ROUTES = ["/dashboard"];

export const widgetCommands: CommandDef[] = [
  {
    name: "widgets.list",
    description: "List the widgets currently on the home dashboard with their positions.",
    scope: "client",
    routes: ROUTES,
    parameters: { type: "object", properties: {} },
    handler: (_a, ctx) => ({ ok: true, data: ctx.widgets.list() }),
  },
  {
    name: "widgets.move",
    description: "Move a widget to grid coordinates (x, y) on the 12-col grid.",
    scope: "client",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        widget_id: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
      },
      required: ["widget_id", "x", "y"],
    },
    handler: ({ widget_id, x, y }, ctx) => {
      ctx.widgets.move(widget_id, x, y);
      return { ok: true };
    },
  },
  {
    name: "widgets.resize",
    description: "Resize a widget to (w, h) grid units.",
    scope: "client",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        widget_id: { type: "string" },
        w: { type: "number" },
        h: { type: "number" },
      },
      required: ["widget_id", "w", "h"],
    },
    handler: ({ widget_id, w, h }, ctx) => {
      ctx.widgets.resize(widget_id, w, h);
      return { ok: true };
    },
  },
  {
    name: "widgets.add",
    description: "Add a known widget back to the home grid (welcome, usage, memories, connectors, events, docs, analytics, skills, plugins, activity, quickstart, project).",
    scope: "client",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { widget_id: { type: "string" } },
      required: ["widget_id"],
    },
    handler: ({ widget_id }, ctx) => {
      ctx.widgets.add(widget_id);
      return { ok: true };
    },
  },
  {
    name: "widgets.remove",
    description: "Remove a widget from the home grid.",
    scope: "client",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { widget_id: { type: "string" } },
      required: ["widget_id"],
    },
    handler: ({ widget_id }, ctx) => {
      ctx.widgets.remove(widget_id);
      return { ok: true };
    },
  },
  {
    name: "widgets.reset_layout",
    description: "Reset the home dashboard layout to its defaults.",
    scope: "client",
    routes: ROUTES,
    parameters: { type: "object", properties: {} },
    handler: (_a, ctx) => { ctx.widgets.reset(); return { ok: true }; },
  },
];
