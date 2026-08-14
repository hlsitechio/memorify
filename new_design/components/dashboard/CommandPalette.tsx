import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { dashboardRoutes } from "./routes";
import { useDashboardUI } from "./DashboardUIContext";

export function CommandPalette() {
  const { cmd, closeCmd } = useDashboardUI();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (cmd.open) setQuery(cmd.initialQuery ?? "");
  }, [cmd.open, cmd.initialQuery]);

  const groups = Array.from(new Set(dashboardRoutes.map((r) => r.group)));

  return (
    <CommandDialog open={cmd.open} onOpenChange={(o) => (o ? null : closeCmd())}>
      <CommandInput
        placeholder="Search routes, actions, docs…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {groups.map((g, i) => (
          <div key={g}>
            {i > 0 && <CommandSeparator />}
            <CommandGroup heading={g}>
              {dashboardRoutes
                .filter((r) => r.group === g)
                .map((r) => (
                  <CommandItem
                    key={r.to}
                    value={`${r.label} ${r.group} ${r.keywords ?? ""}`}
                    onSelect={() => {
                      navigate(r.to);
                      closeCmd();
                    }}
                  >
                    <r.icon className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span>{r.label}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{r.to}</span>
                  </CommandItem>
                ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
