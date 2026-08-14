import { useEffect, useState } from "react";
import { ChevronsUpDown, Sparkles, Check, Zap, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@clerk/react";
import { useApi } from "@/lib/api";
import {
  setCurrentWorkspace,
  useCurrentWorkspace,
  workspaceIdForAgent,
} from "@/hooks/useCurrentWorkspace";

type AgentRow = { id: string; name: string; kind: string; status: string; metadata: any };

export function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const navigate = useNavigate();
  const [currentWs] = useCurrentWorkspace();
  const { action } = useApi();
  const [agents, setAgents] = useState<AgentRow[]>([]);

  useEffect(() => {
    if (!user) return;
    action("agents.list", {}).then(({ data }) => setAgents((data as AgentRow[]) ?? []));
  }, [user, action]);

  const orgRowId = organization?.id ?? "";
  const orgName = organization?.name || "Workspace";
  const wsTitle = currentWs?.name || orgName || "Memorify";
  const wsSubtitle =
    currentWs?.subtitle || (currentWs?.kind === "agent" ? currentWs.id : organization?.slug || organization?.id || "Workspace");
  const activeId = currentWs?.id ?? orgRowId;

  const selectOrg = () => {
    setCurrentWorkspace(null);
    navigate("/dashboard");
  };

  const selectAgent = (a: AgentRow) => {
    const meta = (a.metadata as any) || {};
    const wsName = meta.workspace_name as string | undefined;
    const wsId = workspaceIdForAgent(a.id);
    const shortName =
      (meta.short_name as string | undefined) || (a.name || a.kind || "A").slice(0, 2).toUpperCase();
    setCurrentWorkspace({
      id: wsId,
      name: `WS - ${a.name || a.kind}`,
      subtitle: wsName || wsId,
      kind: "agent",
      short: shortName,
      agentId: a.id,
    });
    navigate("/dashboard");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          title={collapsed ? wsTitle : undefined}
          className={cn(
            "w-full flex items-center gap-2 rounded-md hover:bg-secondary/60 transition-colors",
            collapsed ? "justify-center p-1.5" : "p-1.5 pr-2 text-left"
          )}
        >
          <div className="h-7 w-7 rounded-md bg-gradient-primary flex items-center justify-center shrink-0 text-primary-foreground">
            {currentWs?.short ? (
              <span className="text-[11px] font-semibold tracking-tight">{currentWs.short}</span>
            ) : (
              <Zap className="h-4 w-4" />
            )}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold tracking-tight truncate">{wsTitle}</div>
                <div className="text-[11px] text-muted-foreground truncate">{wsSubtitle}</div>
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" className="w-64">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Organization
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={selectOrg} className="gap-2">
          <div className="h-6 w-6 rounded bg-primary/15 text-primary flex items-center justify-center">
            <Sparkles className="h-3 w-3" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{orgName}</div>
            <div className="text-[10px] text-muted-foreground truncate font-mono">{organization?.slug || organization?.id || "active org"}</div>
          </div>
          {activeId === orgRowId && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>

        {agents.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Agents
            </DropdownMenuLabel>
            {agents.map((a) => {
              const meta = (a.metadata as any) || {};
              const wsId = workspaceIdForAgent(a.id);
              const wsName = (meta.workspace_name as string | undefined) || wsId;
              const shortName =
                (meta.short_name as string | undefined) ||
                (a.name || a.kind || "A").slice(0, 2).toUpperCase();
              const isActive = activeId === wsId;
              const connected = a.status === "connected";
              return (
                <DropdownMenuItem key={a.id} onClick={() => selectAgent(a)} className="gap-2">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      connected ? "bg-emerald-400" : "bg-muted-foreground/40"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{a.name || a.kind}</div>
                    <div className="text-[10px] text-muted-foreground truncate font-mono">{wsName}</div>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary/60 border border-border text-muted-foreground">
                    {shortName}
                  </span>
                  {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
              );
            })}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/dashboard/agents" className="gap-2 cursor-pointer">
            <Plus className="h-3.5 w-3.5" />
            <span className="text-xs">Manage agents</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
