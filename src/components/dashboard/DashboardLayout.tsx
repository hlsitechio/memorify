import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Database, Plug, Activity, ScrollText, KeyRound, Settings, Home, Zap, LogOut, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const items = [
  { to: "/dashboard", label: "Home", icon: Home, end: true },
  { to: "/dashboard/memory", label: "Memory", icon: Database },
  { to: "/dashboard/connectors", label: "Connectors", icon: Plug },
  { to: "/dashboard/events", label: "Events", icon: Activity },
  { to: "/dashboard/logs", label: "Logs", icon: ScrollText },
  { to: "/dashboard/api-keys", label: "API keys", icon: KeyRound },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
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

        <nav className="flex-1 p-2 space-y-0.5">
          <div className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">Workspace</div>
          {items.map((it) => (
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
