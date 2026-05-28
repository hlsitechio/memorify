// Single hook to register the always-on command set.

import { useEffect } from "react";
import { registerCommands } from "./registry";
import { navCommands } from "./actions/nav";
import { pluginCommands } from "./actions/plugins";
import { widgetCommands } from "./actions/widgets";
import { agentCommands } from "./actions/agents";
import { documentCommands } from "./actions/documents";
import { memoryCommands } from "./actions/memory";
import { mcpCommands } from "./actions/mcp";

export function useRegisterCoreCommands() {
  useEffect(() => {
    const unreg = registerCommands([
      ...navCommands,
      ...pluginCommands,
      ...widgetCommands,
      ...agentCommands,
      ...documentCommands,
      ...memoryCommands,
      ...mcpCommands,
    ]);
    return unreg;
  }, []);
}
