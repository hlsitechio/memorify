// Shared types for the Copilot Action Layer.
//
// One registry, two scopes:
//   - client: handler runs in the browser (navigate, drag, open sheet…)
//   - server: handler runs in the copilot-action edge function (DB CRUD…)

export type Scope = "client" | "server";

export type CommandResult = { ok: boolean; data?: unknown; error?: string };

// JSON Schema (subset) — what we send to the LLM as `parameters`.
export type JsonSchema = {
  type: "object";
  properties?: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
};

export type ClientCtx = {
  navigate: (path: string) => void;
  goBack: () => void;
  goForward: () => void;
  toast: (message: string, variant?: "default" | "success" | "error") => void;
  openCmd: (q?: string) => void;
  setChatOpen: (v: boolean) => void;
  flash: (key: string) => void;
  // Lazy access to the latest dashboard layout state when registered.
  widgets: {
    list: () => Array<{ i: string; x: number; y: number; w: number; h: number }>;
    move: (id: string, x: number, y: number) => void;
    resize: (id: string, w: number, h: number) => void;
    add: (id: string) => void;
    remove: (id: string) => void;
    reset: () => void;
  };
};

export type CommandDef = {
  name: string;
  description: string;
  scope: Scope;
  destructive?: boolean;
  parameters: JsonSchema;
  // Only required for client-scope commands.
  handler?: (args: any, ctx: ClientCtx) => Promise<CommandResult> | CommandResult;
  // Routes where this command is most relevant (used by meta.list_commands_here).
  routes?: string[];
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: any;
};

export type ChatMsg =
  | { role: "system" | "user" | "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
