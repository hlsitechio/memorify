// Single hook to register the always-on command set.

import { useEffect } from "react";
import { registerCommands } from "./registry";
import { navCommands } from "./actions/nav";
import { pluginCommands } from "./actions/plugins";
import { widgetCommands } from "./actions/widgets";
import { agentCommands } from "./actions/agents";

export function useRegisterCoreCommands() {
  useEffect(() => {
    const unreg = registerCommands([
      ...navCommands,
      ...pluginCommands,
      ...widgetCommands,
      ...agentCommands,
    ]);
    return unreg;
  }, []);
}
