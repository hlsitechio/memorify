import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Database, Plug, Activity, ScrollText, KeyRound, Settings, Home, Zap, LogOut, ChevronsUpDown, Sparkles, Puzzle, FileText, Image as ImageIcon, Mic, Table2, Lock, Search, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DashboardUIProvider, useDashboardUI } from "./DashboardUIContext";
import { CommandPalette } from "./CommandPalette";
import { AIChatSidebar } from "./AIChatSidebar";
import { Button } from "@/components/ui/button";

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
      { to: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

export default function DashboardLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const initial = (user?.email ?? "?").charAt(0).toUpperCase();

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

        <div className="p-2 border-t border-border">
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-secondary/60 transition-colors">
              <div className="h-7 w-7 rounded-full bg-gradient-primary flex items-center justify-center text-xs font-semibold text-primary-foreground">
                {initial}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="text-sm truncate">{user?.email}</div>
                <div className="text-[11px] text-muted-foreground">Free plan</div>
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => navigate("/dashboard/settings")}>
                <Settings className="h-4 w-4 mr-2" /> Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
              >
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
