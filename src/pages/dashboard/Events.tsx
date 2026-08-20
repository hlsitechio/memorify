import { useCallback, useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Activity, Search, Brain, Wrench, Bot, AlertTriangle, Server, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

type Event = {
  id: string;
  agent_id: string | null;
  agent_name: string | null;
  kind: string;
  source: string | null;
  payload: any;
  created_at: string;
};

const CATEGORIES = [
  { id: "all", label: "All", icon: Activity, match: () => true },
  { id: "memory", label: "Memory", icon: Brain, match: (e: Event) => e.kind.startsWith("memory.") },
  { id: "mcp", label: "MCP tools", icon: Wrench, match: (e: Event) => e.kind === "mcp.tool_call" || e.kind === "tool.call" },
  { id: "agents", label: "Agents", icon: Bot, match: (e: Event) => e.kind.startsWith("agent.") },
  { id: "errors", label: "Errors", icon: AlertTriangle, match: (e: Event) => e.kind.startsWith("error") || e.payload?.ok === false },
  { id: "system", label: "System", icon: Server, match: (e: Event) =>
    !e.kind.startsWith("memory.") && e.kind !== "mcp.tool_call" && e.kind !== "tool.call" &&
    !e.kind.startsWith("agent.") && !e.kind.startsWith("error") && e.payload?.ok !== false
  },
] as const;

const categoryOf = (e: Event) => CATEGORIES.slice(1).find((c) => c.match(e))?.id ?? "system";

const TONE: Record<string, string> = {
  memory: "bg-primary/15 text-primary",
  mcp: "bg-violet-500/15 text-violet-400",
  agents: "bg-sky-500/15 text-sky-400",
  errors: "bg-destructive/15 text-destructive",
  system: "bg-muted text-muted-foreground",
};

/** Human-readable sentence for an event row. */
function describe(e: Event): { actor: string; action: React.ReactNode } {
  const actor = e.agent_name || (e.agent_id ? e.agent_id.slice(0, 8) : "") || e.source || "Gateway";
  const p = e.payload ?? {};
  const idShort = (p.memory_id ?? e.source ?? "").toString().slice(0, 8);
  const tool = typeof p.tool === "string" ? p.tool : "";

  switch (e.kind) {
    case "memory.remember":
      return { actor, action: <>saved a memory <span className="font-mono text-[11px] text-muted-foreground">#{idShort}</span> ({p.scope ?? "shared"})</> };
    case "memory.recall":
      return { actor, action: <>searched memory {p.query ? <>"{String(p.query).slice(0, 60)}" </> : null}· {p.count ?? 0} results</> };
    case "memory.update":
      return { actor, action: <>updated memory <span className="font-mono text-[11px] text-muted-foreground">#{idShort}</span></> };
    case "memory.delete":
      return { actor, action: <>deleted memory <span className="font-mono text-[11px] text-muted-foreground">#{idShort}</span></> };
    case "mcp.tool_call":
      return {
        actor,
        action: <>
          called <span className="font-semibold text-violet-400">{e.source ?? "MCP server"}</span> tool{" "}
          <span className="font-mono text-[11px]">{tool || "unknown"}</span>
          {p.ok === false && <span className="text-destructive"> — failed{p.error ? `: ${String(p.error).slice(0, 80)}` : ""}</span>}
        </>,
      };
    case "tool.call":
      return {
        actor,
        action: <>
          used gateway tool <span className="font-mono text-[11px]">{e.source}</span>
          {p.ok === false && <span className="text-destructive"> — failed</span>}
        </>,
      };
    default:
      if (e.kind.startsWith("error")) {
        return { actor, action: <>error <span className="font-mono text-[11px]">{e.kind}</span></> };
      }
      return { actor, action: <><span className="font-mono text-[11px] text-muted-foreground">{e.kind}</span></> };
  }
}

export default function Events() {
  const { user } = useAuth();
  const { action } = useApi();
  const [rows, setRows] = useState<Event[]>([]);
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all");

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await action("events.list", { limit: 200 });
    setRows((data as Event[]) ?? []);
  }, [user, action]);

  useEffect(() => { void load(); }, [load]);

  // Poll for new events every 10s when live
  useEffect(() => {
    if (!user || !live) return;
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [user, live, load]);

  const refresh = async () => {
    setLoading(true);
    try { await load(); toast.success("Feed refreshed"); }
    catch { toast.error("Could not refresh feed"); }
    finally { setLoading(false); }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) {
      const cat = categoryOf(r);
      c[cat] = (c[cat] ?? 0) + 1;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const cat = CATEGORIES.find((c) => c.id === category);
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (cat && !cat.match(r)) return false;
      if (!needle) return true;
      return (
        r.kind.toLowerCase().includes(needle) ||
        (r.agent_name ?? "").toLowerCase().includes(needle) ||
        (r.agent_id ?? "").toLowerCase().includes(needle) ||
        (r.source ?? "").toLowerCase().includes(needle) ||
        JSON.stringify(r.payload).toLowerCase().includes(needle)
      );
    });
  }, [rows, q, category]);

  return (
    <>
      <PageHeader
        title="Events"
        description="Everything your agents and connected MCP tools do, in one feed"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setLive(!live)}>
              <span className={cn("h-1.5 w-1.5 rounded-full mr-2", live ? "bg-primary animate-pulse" : "bg-muted-foreground")} />
              {live ? "Live" : "Paused"}
            </Button>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCcw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} /> Refresh
            </Button>
          </>
        }
      />
      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = category === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {c.label}
                <span className={cn("ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-mono", active ? "bg-primary/15" : "bg-secondary")}>
                  {counts[c.id] ?? 0}
                </span>
              </button>
            );
          })}
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8 h-9" placeholder="Search agent, tool, payload…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {/* Feed */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Activity className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
              <p className="text-sm font-medium">No activity yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Connect an agent or MCP server and every memory write, recall, and tool call will appear here.
              </p>
            </div>
          ) : (
            filtered.map((r) => {
              const cat = categoryOf(r);
              const { actor, action } = describe(r);
              const at = new Date(r.created_at);
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/40 last:border-0 hover:bg-secondary/30">
                  <span className={cn("flex-shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", TONE[cat])}>
                    {CATEGORIES.find((c) => c.id === cat)?.label}
                  </span>
                  <div className="min-w-0 flex-1 text-sm truncate">
                    <span className="font-semibold">{actor}</span> <span className="text-muted-foreground">{action}</span>
                  </div>
                  <time
                    className="flex-shrink-0 text-xs text-muted-foreground tabular-nums"
                    title={at.toLocaleString()}
                    dateTime={at.toISOString()}
                  >
                    {formatDistanceToNow(at, { addSuffix: true })}
                  </time>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
