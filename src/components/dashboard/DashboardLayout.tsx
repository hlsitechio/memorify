import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Database,
  Plug,
  Activity,
  ScrollText,
  KeyRound,
  Settings,
  Home,
  Zap,
  LogOut,
  Sparkles,
  Puzzle,
  FileText,
  Image as ImageIcon,
  Mic,
  Table2,
  Lock,
  Search,
  Bot,
  Server,
  BookOpen,
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardUIProvider, useDashboardUI } from "./DashboardUIContext";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { CommandPalette } from "./CommandPalette";
import { AIChatSidebar } from "./AIChatSidebar";
import { Button } from "@/components/ui/button";
import { CopilotBusProvider } from "@/copilot/bus";
import { useRegisterCoreCommands } from "@/copilot/useRegisterCoreCommands";
import { CopilotChatProvider } from "@/copilot/chat-context";
import { docsNavGroups } from "@/pages/dashboard/Docs";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { useEffect, useState } from "react";

const sections: { label: string; items: { to: string; label: string; icon: typeof Home; end?: boolean }[] }[] = [
  {
    label: "Workspace",
    items: [{ to: "/dashboard", label: "Home", icon: Home, end: true }],
  },
  {
    label: "Build",
    items: [
      { to: "/dashboard/agents", label: "Agents", icon: Bot },
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
    items: [{ to: "/dashboard/api-keys", label: "API Keys", icon: KeyRound }],
  },
];

function DocsNav({ collapsed }: { collapsed: boolean }) {
  return (
    <>
      <nav className="flex-1 p-2 space-y-4 overflow-y-auto no-scrollbar">
        {!collapsed && (
          <div className="px-2 pt-2 pb-1 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">Docs</div>
          </div>
        )}
        <NavLink
          to="/dashboard/docs"
          end
          title={collapsed ? "Overview" : undefined}
          className={({ isActive }) =>
            cn(
              "rounded-md text-sm transition-colors",
              collapsed
                ? "mx-auto h-8 w-8 flex items-center justify-center font-mono text-[11px]"
                : "block px-2.5 py-1.5",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
            )
          }
        >
          {collapsed ? "·" : "Overview"}
        </NavLink>
        {docsNavGroups.map((g) => (
          <div key={g.label} className="space-y-0.5">
            {!collapsed && (
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">{g.label}</div>
            )}
            {g.items.map((it) => (
              <NavLink
                key={it.id}
                to={`/dashboard/docs/${it.id}`}
                title={collapsed ? it.title : undefined}
                className={({ isActive }) =>
                  cn(
                    "rounded-md text-sm transition-colors",
                    collapsed
                      ? "mx-auto h-8 w-8 flex items-center justify-center font-mono text-[11px]"
                      : "block px-2.5 py-1.5",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                  )
                }
              >
                {collapsed ? it.title.charAt(0).toUpperCase() : it.title}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="p-2 border-t border-border">
        <NavLink
          to="/dashboard"
          end
          title={collapsed ? "Back to workspace" : undefined}
          className={cn(
            "flex items-center rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors",
            collapsed ? "justify-center h-9 w-9 mx-auto" : "gap-2.5 px-2.5 py-2",
          )}
        >
          <ArrowLeft className="h-4 w-4" /> {!collapsed && "Back to workspace"}
        </NavLink>
      </div>
    </>
  );
}

function MainNav({ collapsed }: { collapsed: boolean }) {
  return (
    <nav className="flex-1 p-2 space-y-3 overflow-y-auto no-scrollbar">
      {sections.map((section) => (
        <div key={section.label} className="space-y-0.5">
          {!collapsed && (
            <div className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              {section.label}
            </div>
          )}
          {section.items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              title={collapsed ? it.label : undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center rounded-md text-sm transition-colors",
                  collapsed ? "justify-center h-9 w-9 mx-auto" : "gap-2.5 px-2.5 py-2",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                )
              }
            >
              <it.icon className="h-4 w-4" />
              {!collapsed && it.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

function DashboardLayoutInner() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const initial = (user?.email ?? "?").charAt(0).toUpperCase();
  const inDocs = pathname.startsWith("/dashboard/docs");
  const [currentWs] = useCurrentWorkspace();
  const wsTitle = inDocs ? "Synapse" : currentWs?.name || "Synapse";
  const wsSubtitle = inDocs
    ? "Documentation"
    : currentWs?.subtitle || (currentWs?.kind === "agent" ? currentWs.id : "Personal workspace");
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar:collapsed") === "1";
  });
  useEffect(() => {
    localStorage.setItem("sidebar:collapsed", collapsed ? "1" : "0");
  }, [collapsed]);
  useRegisterCoreCommands();

  return (
    <div className="h-screen overflow-hidden flex w-full bg-background text-foreground">
      <aside
        className={cn(
          "shrink-0 border-r border-border bg-card flex flex-col transition-[width] duration-300 ease-out",
          collapsed ? "w-14" : "w-60",
        )}
      >
        <div
          className={cn("h-14 flex items-center border-b border-border", collapsed ? "px-1.5 justify-center" : "px-2")}
        >
          {inDocs ? (
            <>
              <div className="h-7 w-7 rounded-md bg-gradient-primary flex items-center justify-center shrink-0 text-primary-foreground mx-1">
                <Zap className="h-4 w-4" />
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0 ml-2">
                  <div className="text-sm font-semibold tracking-tight truncate">{wsTitle}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{wsSubtitle}</div>
                </div>
              )}
            </>
          ) : (
            <WorkspaceSwitcher collapsed={collapsed} />
          )}
        </div>

        <div key={inDocs ? "docs" : "main"} className="flex-1 min-h-0 flex flex-col animate-nav-swap">
          {inDocs ? <DocsNav collapsed={collapsed} /> : <MainNav collapsed={collapsed} />}
        </div>

        <div className="p-2 border-t border-border space-y-1">
          {!inDocs && (
            <NavLink
              to="/dashboard/docs"
              title={collapsed ? "Docs" : undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center rounded-md text-sm transition-colors",
                  collapsed ? "justify-center h-9 w-9 mx-auto" : "gap-2.5 px-2.5 py-2",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                )
              }
            >
              <BookOpen className="h-4 w-4" />
              {!collapsed && "Docs"}
            </NavLink>
          )}
          <NavLink
            to="/dashboard/settings"
            title={collapsed ? "Settings" : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center rounded-md text-sm transition-colors",
                collapsed ? "justify-center h-9 w-9 mx-auto" : "gap-2.5 px-2.5 py-2",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
              )
            }
          >
            <Settings className="h-4 w-4" />
            {!collapsed && "Settings"}
          </NavLink>
          <button
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "flex items-center rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors w-full",
              collapsed ? "justify-center h-9" : "gap-2.5 px-2.5 py-2",
            )}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && "Collapse"}
          </button>
          <button
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
            className={cn(
              "w-full flex items-center rounded-md hover:bg-secondary/60 transition-colors text-left group",
              collapsed ? "justify-center py-2" : "gap-2 px-2 py-2",
            )}
            title={collapsed ? `${user?.email ?? ""} — Sign out` : "Sign out"}
          >
            <div className="h-7 w-7 rounded-full bg-gradient-primary flex items-center justify-center text-xs font-semibold text-primary-foreground shrink-0">
              {initial}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-xs truncate">{user?.email}</div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <LogOut className="h-3 w-3" /> Sign out
                </div>
              </div>
            )}
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
  const { openCmd, toggleChat, chatOpen, pageMeta } = useDashboardUI();
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  const mod = isMac ? "⌘" : "Ctrl";
  return (
    <header className="h-14 shrink-0 border-b border-border bg-background/80 backdrop-blur px-4 flex items-center gap-3 sticky top-0 z-20">
      <div className="flex-1 min-w-0 flex items-center">
        {pageMeta && (
          <div className="min-w-0 flex items-baseline gap-2">
            <h1 className="text-sm font-semibold tracking-tight truncate">{pageMeta.title}</h1>
            {pageMeta.description && (
              <p className="text-xs text-muted-foreground truncate hidden md:block">{pageMeta.description}</p>
            )}
          </div>
        )}
      </div>
      <button
        onClick={() => openCmd()}
        className="shrink-0 w-full max-w-xl flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-secondary/40 hover:bg-secondary text-sm text-muted-foreground transition-colors"
      >
        <Search className="h-4 w-4" />
        <span className="truncate">Search routes, actions, docs…</span>
        <span className="ml-auto text-[11px] font-mono px-1.5 py-0.5 rounded border border-border bg-background">
          {mod}K
        </span>
      </button>
      <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
        {pageMeta?.actions}
        <Button variant={chatOpen ? "secondary" : "outline"} size="sm" onClick={toggleChat} className="gap-2">
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
        <CopilotChatProvider>
          <DashboardLayoutInner />
        </CopilotChatProvider>
      </CopilotBusProvider>
    </DashboardUIProvider>
  );
}
