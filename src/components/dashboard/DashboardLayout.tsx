import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Database, Plug, Activity, ScrollText, KeyRound, Settings, Home, Zap, LogOut, Sparkles, Puzzle, FileText, Image as ImageIcon, Mic, Table2, Lock, Search, Bot, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardUIProvider, useDashboardUI } from "./DashboardUIContext";
import { CommandPalette } from "./CommandPalette";
import { AIChatSidebar } from "./AIChatSidebar";
import { Button } from "@/components/ui/button";
import { CopilotBusProvider } from "@/copilot/bus";
import { useRegisterCoreCommands } from "@/copilot/useRegisterCoreCommands";

const sections: { label: string; items: { to: string; label: string; icon: typeof Home; end?: boolean }[] }[] = [
  {
    label: "Workspace",
    items: [{ to: "/dashboard", label: "Home", icon: Home, end: true }],
  },
  {
    label: "Build",
    items: [
      { to: "/dashboard/skills", label: "Skills", icon: Sparkles },
      { to: "/dashboard/plugins", label: "Plugins", icon: Puzzle },
      { to: "/dashboard/connectors", label: "Connectors", icon: Plug },
      { to: "/dashboard/mcp", label: "MCP", icon: Server },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { to: "/dashboard/memory", label: "Memory", icon: Database },
      { to: "/dashboard/documents", label: "Documents", icon: FileText },
      { to: "/dashboard/images", label: "Images", icon: ImageIcon },
      { to: "/dashboard/voices", label: "Voices", icon: Mic },
    ],
  },
  {
    label: "Data",
    items: [
      { to: "/dashboard/database", label: "Database", icon: Table2 },
      { to: "/dashboard/vault", label: "Vault", icon: Lock },
    ],
  },
  {
    label: "Observe",
    items: [
      { to: "/dashboard/events", label: "Events", icon: Activity },
      { to: "/dashboard/logs", label: "Logs", icon: ScrollText },
    ],
  },
  {
    label: "Project",
    items: [
      { to: "/dashboard/api-keys", label: "API keys", icon: KeyRound },
    ],
  },
];

function DashboardLayoutInner() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const initial = (user?.email ?? "?").charAt(0).toUpperCase();
  useRegisterCoreCommands();

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      <aside className="w-60 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="h-14 px-4 flex items-center gap-2 border-b border-border">
          <div className="h-7 w-7 rounded-md bg-gradient-primary flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold tracking-tight truncate">Synapse</div>
            <div className="text-[11px] text-muted-foreground truncate">Personal workspace</div>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-3 overflow-y-auto">
          {sections.map((section) => (
            <div key={section.label} className="space-y-0.5">
              <div className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                {section.label}
              </div>
              {section.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                    )
                  }
                >
                  <it.icon className="h-4 w-4" />
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="p-2 border-t border-border space-y-1">
          <NavLink
            to="/dashboard/settings"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              )
            }
          >
            <Settings className="h-4 w-4" />
            Settings
          </NavLink>
          <button
            onClick={async () => { await signOut(); navigate("/"); }}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-secondary/60 transition-colors text-left group"
            title="Sign out"
          >
            <div className="h-7 w-7 rounded-full bg-gradient-primary flex items-center justify-center text-xs font-semibold text-primary-foreground shrink-0">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs truncate">{user?.email}</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <LogOut className="h-3 w-3" /> Sign out
              </div>
            </div>
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <DashboardTopbar />
        <div className="flex-1 min-h-0 flex flex-col">
          <Outlet />
        </div>
      </main>

      <AIChatSidebar />
      <CommandPalette />
    </div>
  );
}

function DashboardTopbar() {
  const { openCmd, toggleChat, chatOpen } = useDashboardUI();
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  const mod = isMac ? "⌘" : "Ctrl";
  return (
    <header className="h-14 shrink-0 border-b border-border bg-background/80 backdrop-blur px-4 flex items-center gap-3 sticky top-0 z-20">
      <button
        onClick={() => openCmd()}
        className="flex-1 max-w-xl flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-secondary/40 hover:bg-secondary text-sm text-muted-foreground transition-colors"
      >
        <Search className="h-4 w-4" />
        <span>Search routes, actions, docs…</span>
        <span className="ml-auto text-[11px] font-mono px-1.5 py-0.5 rounded border border-border bg-background">
          {mod}K
        </span>
      </button>
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant={chatOpen ? "secondary" : "outline"}
          size="sm"
          onClick={toggleChat}
          className="gap-2"
        >
          <Bot className="h-4 w-4" />
          Copilot
          <span className="text-[11px] font-mono px-1 py-0.5 rounded border border-border bg-background text-muted-foreground">
            {mod}I
          </span>
        </Button>
      </div>
    </header>
  );
}

export default function DashboardLayout() {
  return (
    <DashboardUIProvider>
      <CopilotBusProvider>
        <DashboardLayoutInner />
      </CopilotBusProvider>
    </DashboardUIProvider>
  );
}
