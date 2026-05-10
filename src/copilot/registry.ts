// In-memory command registry shared by every page.
// Pages call `registerCommands(...defs)` once on mount; the manifest is
// rebuilt automatically on every change so the Copilot sidebar always
// sees the latest tools.

import type { CommandDef } from "./types";

const commands = new Map<string, CommandDef>();
const listeners = new Set<() => void>();

export function registerCommands(defs: CommandDef[]) {
  for (const d of defs) commands.set(d.name, d);
  listeners.forEach((l) => l());
  return () => {
    for (const d of defs) {
      // Only remove if it's still our def (prevents flapping if re-registered).
      if (commands.get(d.name) === d) commands.delete(d.name);
    }
    listeners.forEach((l) => l());
  };
}

export function getCommand(name: string): CommandDef | undefined {
  return commands.get(name);
}

export function listCommands(): CommandDef[] {
  return Array.from(commands.values());
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// OpenAI-compatible tool manifest. Sent to the LLM via agent-chat.
export function getManifest() {
  return listCommands().map((c) => ({
    type: "function" as const,
    function: {
      name: c.name,
      description: c.description,
      parameters: c.parameters ?? { type: "object", properties: {} },
    },
  }));
}
