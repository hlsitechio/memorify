// Single hook to register the always-on command set.

import { useEffect } from "react";
import { registerCommands } from "./registry";
import { navCommands } from "./actions/nav";
import { pluginCommands } from "./actions/plugins";
import { widgetCommands } from "./actions/widgets";

export function useRegisterCoreCommands() {
  useEffect(() => {
    const unreg = registerCommands([
      ...navCommands,
      ...pluginCommands,
      ...widgetCommands,
    ]);
    return unreg;
  }, []);
}
