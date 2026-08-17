import { useEffect, useState } from "react";
import { useOrganization } from "@clerk/react";
import { useApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { setCurrentWorkspace, useCurrentWorkspace, workspaceIdForAgent } from "@/hooks/useCurrentWorkspace";
import { Link } from "react-router-dom";
import {
  Database, Plug, Activity, ArrowUpRight, BookOpen, Sparkles, Puzzle,
  BarChart3, FileText, KeyRound, Zap, TrendingUp, Clock, GripVertical, X,
  StickyNote, ListTodo, Bookmark, Plus, Trash2, Calendar,
} from "lucide-react";

type RProps = { onRemove?: () => void };

export function WidgetShell({
  title, icon: Icon, action, children, className = "", onRemove,
}: {
  title: string;
  icon?: any;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  onRemove?: () => void;
}) {
  return (
    <div className={`group/widget h-full w-full rounded-lg border border-border bg-card flex flex-col overflow-hidden ${className}`}>
      <div className="h-9 px-3 flex items-center gap-2 border-b border-border shrink-0">
        <GripVertical className="drag-handle h-3.5 w-3.5 text-muted-foreground/40 cursor-grab active:cursor-grabbing" />
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <div className="text-xs font-medium tracking-tight">{title}</div>
        <div className="ml-auto flex items-center gap-1">
          {action}
          {onRemove && (
            <button
              onClick={onRemove}
              title="Remove widget"
              className="opacity-0 group-hover/widget:opacity-100 transition-opacity h-5 w-5 inline-flex items-center justify-center rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto scrollbar-thin p-4">{children}</div>
    </div>
  );
}

export function WelcomeWidget({ onRemove }: RProps) {
  const { user } = useAuth();
  const [ws] = useCurrentWorkspace();
  const isAgent = ws?.kind === "agent";
  const title = ws?.name || user?.email || "Welcome";
  const wsId = ws?.id || (user ? `user:${user.id}` : "");
  const blurb = isAgent
    ? "You're now in this agent's workspace. Memories, events and tools below are scoped to it."
    : "Your agent memory layer is live. Add memories, plug in connectors, and watch your event bus.";

  return (
    <WidgetShell title="Welcome" icon={Sparkles} onRemove={onRemove}>
      <div className="flex items-start gap-3">
        {ws?.short && (
          <div className="h-10 w-10 rounded-md bg-gradient-primary text-primary-foreground flex items-center justify-center shrink-0 text-sm font-semibold tracking-tight">
            {ws.short}
          </div>
        )}
        <div className="space-y-2 min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
            <Sparkles className="h-3 w-3" /> {isAgent ? "Agent workspace" : "Memorify"}
          </div>
          <h2 className="text-lg font-semibold tracking-tight truncate">{title}</h2>
          {wsId && (
            <div className="text-[11px] font-mono text-muted-foreground truncate">{wsId}</div>
          )}
          <p className="text-xs text-muted-foreground">{blurb}</p>

          {isAgent && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Link
                to="/dashboard/agents"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/60 hover:bg-secondary px-2.5 py-1 text-[11px] font-medium transition-colors"
                title="Open Agents to download a secure connection file"
              >
                <KeyRound className="h-3 w-3" />
                Get connection file
              </Link>
            </div>
          )}
        </div>
      </div>
    </WidgetShell>
  );
}

function StatCard({ label, value, hint, icon: Icon, to }: any) {
  return (
    <Link to={to} className="group h-full flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
      <div>
        <div className="text-3xl font-semibold tabular-nums">{value}</div>
        <div className="text-sm font-medium mt-0.5">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
    </Link>
  );
}

export type WorkspaceStats = {
  memories: number;
  documents: number;
  events: number;
  connectors: number;
  agents: number;
  skills: number;
  loading: boolean;
};

export function useWorkspaceStats(): WorkspaceStats {
  const { user } = useAuth();
  const [ws] = useCurrentWorkspace();
  const { action } = useApi();
  const [stats, setStats] = useState<WorkspaceStats>({
    memories: 0,
    documents: 0,
    events: 0,
    connectors: 0,
    agents: 0,
    skills: 0,
    loading: true,
  });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    action("workspace.stats", {}).then(({ data }) => {
      if (cancelled || !data) return;
      const d = data as any;
      setStats({
        memories: Number(d.memories ?? 0),
        documents: Number(d.documents ?? 0),
        events: Number(d.events ?? 0),
        connectors: Number(d.connectors ?? 0),
        agents: Number(d.agents ?? 0),
        skills: Number(d.skills ?? 0),
        loading: false,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [user, ws?.id, action]);

  return stats;
}

export function MemoriesStatWidget({ onRemove }: RProps) {
  const stats = useWorkspaceStats();
  return (
    <WidgetShell title="Memories" icon={Database} onRemove={onRemove}>
      <StatCard label="Memories" value={stats.memories} hint="Across all namespaces" icon={Database} to="/dashboard/memory" />
    </WidgetShell>
  );
}
export function ConnectorsStatWidget({ onRemove }: RProps) {
  const stats = useWorkspaceStats();
  return (
    <WidgetShell title="Connectors" icon={Plug} onRemove={onRemove}>
      <StatCard label="Connectors" value={stats.connectors} hint="Tools & data sources" icon={Plug} to="/dashboard/connectors" />
    </WidgetShell>
  );
}
export function EventsStatWidget({ onRemove }: RProps) {
  const stats = useWorkspaceStats();
  return (
    <WidgetShell title="Events (24h)" icon={Activity} onRemove={onRemove}>
      <StatCard label="Events" value={stats.events} hint="Real-time bus" icon={Activity} to="/dashboard/events" />
    </WidgetShell>
  );
}
export function AgentsStatWidget({ onRemove }: RProps) {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const [ws] = useCurrentWorkspace();
  const activeId = ws?.id ?? organization?.id ?? "";
  const [agents, setAgents] = useState<Array<{ id: string; name: string; kind: string; status: string; metadata: any }>>([]);
  const { action } = useApi();
  useEffect(() => {
    if (!user) return;
    action("agents.list", {}).then(({ data }) => setAgents((data as any[]) ?? []));
  }, [user, action]);

  return (
    <WidgetShell
      title="Agents"
      icon={Sparkles}
      action={<Link to="/dashboard/agents" className="text-[11px] text-primary hover:underline">Manage</Link>}
      onRemove={onRemove}
    >
      {(() => {
        const orgRowId = organization?.id ?? "";
        const orgName = organization?.name || "Workspace";
        const orgActive = !!organization && activeId === orgRowId;

        const renderOrgRow = (active: boolean) => (
          <Link
            key="org-ws"
            to="/dashboard"
            onClick={() => setCurrentWorkspace(null)}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
              active
                ? "border border-primary bg-primary/15 ring-1 ring-primary/40"
                : "border border-transparent hover:bg-secondary/60 hover:border-border"
            }`}
          >
            <div className="h-6 w-6 rounded bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Sparkles className="h-3 w-3" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{orgName}</div>
              <div className="text-[10px] text-muted-foreground truncate font-mono">
                {organization?.slug || organization?.id || "active org"}
              </div>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
          </Link>
        );

        const renderAgentRow = (a: typeof agents[number], active: boolean) => {
          const meta = (a.metadata as any) || {};
          const wsName = meta.workspace_name as string | undefined;
          const wsId = workspaceIdForAgent(a.id);
          const shortName = (meta.short_name as string | undefined) ||
            (a.name || a.kind || "A").slice(0, 2).toUpperCase();
          const connected = a.status === "connected";
          return (
            <Link
              key={a.id}
              to="/dashboard"
              onClick={() => setCurrentWorkspace({
                id: wsId,
                name: `WS - ${a.name || a.kind}`,
                subtitle: wsName || wsId,
                kind: "agent",
                short: shortName,
                agentId: a.id,
              })}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
                active
                  ? "border border-primary bg-primary/15 ring-1 ring-primary/40"
                  : "border border-transparent hover:bg-secondary/60 hover:border-border"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${connected ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{a.name || a.kind}</div>
                <div className="text-[10px] text-muted-foreground truncate font-mono">
                  {wsName || wsId}
                </div>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary/60 border border-border text-muted-foreground">
                {shortName}
              </span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          );
        };

        const activeAgent = agents.find((a) => activeId === workspaceIdForAgent(a.id));
        const otherAgents = agents.filter((a) => a.id !== activeAgent?.id);

        // Build a single ordered list: active row first, then the rest.
        const rows: React.ReactNode[] = [];
        if (activeAgent) {
          rows.push(renderAgentRow(activeAgent, true));
          if (organization) rows.push(renderOrgRow(false));
        } else {
          if (organization) rows.push(renderOrgRow(orgActive));
        }
        for (const a of otherAgents) rows.push(renderAgentRow(a, false));

        return (
          <div className="space-y-1.5">
            {rows}
            {agents.length === 0 && (
              <div className="px-2 py-3 text-[11px] text-muted-foreground">
                No agents yet. <Link to="/dashboard/agents" className="text-primary hover:underline">Connect one →</Link>
              </div>
            )}
          </div>
        );
      })()}
    </WidgetShell>
  );
}
export function SkillsStatWidget({ onRemove }: RProps) {
  const stats = useWorkspaceStats();
  return <WidgetShell title="Skills" icon={Sparkles} onRemove={onRemove}><StatCard label="Skills" value={stats.skills} hint="Reusable prompt bundles" icon={Sparkles} to="/dashboard/skills" /></WidgetShell>;
}

export function QuickStartWidget({ onRemove }: RProps) {
  return (
    <WidgetShell title="Quick start" icon={BookOpen} onRemove={onRemove}>
      <ol className="space-y-2 text-sm text-muted-foreground">
        <li>1. Create your first memory in the <Link to="/dashboard/memory" className="text-primary hover:underline">Memory browser</Link></li>
        <li>2. Connect a tool from the <Link to="/dashboard/connectors" className="text-primary hover:underline">Connectors</Link> page</li>
        <li>3. Generate an <Link to="/dashboard/api-keys" className="text-primary hover:underline">API key</Link> and call the gateway</li>
      </ol>
    </WidgetShell>
  );
}

export function ProjectInfoWidget({ onRemove }: RProps) {
  const { user } = useAuth();
  const stats = useWorkspaceStats();
  return (
    <WidgetShell title="Project info" icon={KeyRound} onRemove={onRemove}>
      <dl className="text-sm space-y-2">
        <div className="flex justify-between"><dt className="text-muted-foreground">Agents</dt><dd className="tabular-nums">{stats.agents}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Skills</dt><dd className="tabular-nums">{stats.skills}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Connectors</dt><dd className="tabular-nums">{stats.connectors}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">User ID</dt><dd className="font-mono text-xs truncate max-w-[180px]">{user?.id}</dd></div>
      </dl>
    </WidgetShell>
  );
}

export function AnalyticsWidget({ onRemove }: RProps) {
  const { user } = useAuth();
  const { action } = useApi();
  const [bars, setBars] = useState<number[]>(Array(12).fill(0));
  const [total, setTotal] = useState(0);
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await action("events.list", { limit: 5000 });
      const rows = (data as any[]) ?? [];
      const now = Date.now();
      const buckets = Array(12).fill(0);
      let cur = 0, last = 0;
      for (const r of rows) {
        const ts = new Date(r.created_at).getTime();
        const ageH = (now - ts) / 3600000;
        if (ageH < 12) {
          cur++;
          const idx = Math.min(11, Math.max(0, 11 - Math.floor(ageH)));
          buckets[idx]++;
        } else if (ageH < 24) {
          last++;
        }
      }
      setBars(buckets);
      setTotal(cur);
      setDelta(last > 0 ? ((cur - last) / last) * 100 : null);
    })();
  }, [user, action]);

  const max = Math.max(...bars, 1);
  return (
    <WidgetShell title="Analytics" icon={BarChart3} action={<span className="text-[10px] text-muted-foreground">last 12h</span>} onRemove={onRemove}>
      <div className="space-y-3">
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-semibold tabular-nums">{total.toLocaleString()}</div>
          {delta !== null && (
            <div className={`flex items-center text-[11px] ${delta >= 0 ? "text-emerald-400" : "text-destructive"}`}>
              <TrendingUp className={`h-3 w-3 mr-0.5 ${delta < 0 ? "rotate-180" : ""}`} />
              {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
            </div>
          )}
        </div>
        <div className="flex items-end gap-1 h-16">
          {bars.map((b, i) => (
            <div key={i} className="flex-1 rounded-sm bg-gradient-to-t from-primary/50 to-primary" style={{ height: `${(b / max) * 100}%`, minHeight: 2 }} />
          ))}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {total === 0 ? "No calls yet — connect an agent to see activity." : "Inference calls across all agents"}
        </div>
      </div>
    </WidgetShell>
  );
}

export function SkillsResumeWidget({ onRemove }: RProps) {
  const { user } = useAuth();
  const { action } = useApi();
  const [rows, setRows] = useState<Array<{ name: string; calls: number; status: string }>>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: skills } = await action("skills.list", {});
      const merged = ((skills as any[]) ?? []).map((s) => ({ name: s.name, status: s.status, calls: 0 }));
      merged.sort((a, b) => b.calls - a.calls);
      setRows(merged.slice(0, 4));
    })();
  }, [user, action]);

  return (
    <WidgetShell title="Skills resume" icon={Sparkles} action={<Link to="/dashboard/skills" className="text-[11px] text-primary hover:underline">View all</Link>} onRemove={onRemove}>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No skills yet. <Link to="/dashboard/skills" className="text-primary hover:underline">Create one →</Link></p>
      ) : (
        <ul className="space-y-2">
          {rows.map(s => (
            <li key={s.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`h-1.5 w-1.5 rounded-full ${s.status === "live" || s.status === "published" ? "bg-emerald-400" : "bg-amber-400"}`} />
                <span className="font-mono text-xs truncate">{s.name}</span>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">{s.calls.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}

export function PluginsSummaryWidget({ onRemove }: RProps) {
  const { user } = useAuth();
  const { action } = useApi();
  const [plugins, setPlugins] = useState<Array<{ id: string; name: string; enabled: boolean; kind: string }>>([]);
  useEffect(() => {
    if (!user) return;
    action("plugins.list", {}).then(({ data }) => setPlugins((data as any[]) ?? []));
  }, [user, action]);
  return (
    <WidgetShell title="Plugins" icon={Puzzle} action={<Link to="/dashboard/plugins" className="text-[11px] text-primary hover:underline">Manage</Link>} onRemove={onRemove}>
      {plugins.length === 0 ? (
        <p className="text-xs text-muted-foreground">No plugins installed. <Link to="/dashboard/plugins" className="text-primary hover:underline">Browse →</Link></p>
      ) : (
        <ul className="space-y-2">
          {plugins.map(p => (
            <li key={p.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <Puzzle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{p.name}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{p.kind}</span>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${p.enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"}`}>{p.enabled ? "active" : "paused"}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}

export function RecentActivityWidget({ onRemove }: RProps) {
  const { user } = useAuth();
  const { action } = useApi();
  const [items, setItems] = useState<Array<{ id: string; created_at: string; kind: string; source: string | null }>>([]);
  useEffect(() => {
    if (!user) return;
    action("events.list", { limit: 6 }).then(({ data }) => setItems((data as any[]) ?? []));
  }, [user, action]);
  const ago = (iso: string) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  };
  return (
    <WidgetShell title="Recent activity" icon={Clock} onRemove={onRemove}>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No events yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground tabular-nums w-10 shrink-0">{ago(i.created_at)}</span>
              <span className="font-mono truncate">{i.kind}{i.source ? ` · ${i.source}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}

export function UsageWidget({ onRemove }: RProps) {
  const stats = useWorkspaceStats();
  const rows = [
    { k: "Memories", v: stats.memories.toLocaleString(), pct: Math.min(100, (stats.memories / 1000) * 100) },
    { k: "Documents", v: stats.documents.toLocaleString(), pct: Math.min(100, (stats.documents / 500) * 100) },
    { k: "Events", v: stats.events.toLocaleString(), pct: Math.min(100, (stats.events / 20_000) * 100) },
  ];
  return (
    <WidgetShell title="Usage (30d)" icon={Zap} onRemove={onRemove}>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.k}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">{r.k}</span>
              <span className="font-medium tabular-nums">{r.v}</span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-gradient-primary" style={{ width: `${r.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </WidgetShell>
  );
}

export function DocsWidget({ onRemove }: RProps) {
  const stats = useWorkspaceStats();
  return (
    <WidgetShell title="Documents" icon={FileText} onRemove={onRemove}>
      <StatCard label="Documents" value={stats.documents} hint="Indexed sources · ready for grounding" icon={FileText} to="/dashboard/documents" />
    </WidgetShell>
  );
}

// ---------- New widgets ----------

export function ClockWidget({ onRemove }: RProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  return (
    <WidgetShell title="Clock" icon={Clock} onRemove={onRemove}>
      <div className="h-full flex flex-col justify-center">
        <div className="text-4xl font-semibold tabular-nums tracking-tight">{time}</div>
        <div className="text-xs text-muted-foreground mt-1">{date}</div>
      </div>
    </WidgetShell>
  );
}

export function NotesWidget({ onRemove }: RProps) {
  const [text, setText] = useState<string>("");
  return (
    <WidgetShell title="Notes" icon={StickyNote} onRemove={onRemove}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Jot something down…"
        className="w-full h-full resize-none bg-transparent outline-none text-sm placeholder:text-muted-foreground scrollbar-thin"
      />
    </WidgetShell>
  );
}

type Task = { id: string; t: string; done: boolean };
export function TasksWidget({ onRemove }: RProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim();
    if (!t) return;
    setTasks((cur) => [...cur, { id: crypto.randomUUID(), t, done: false }]);
    setInput("");
  };
  return (
    <WidgetShell title="Tasks" icon={ListTodo} onRemove={onRemove}>
      <div className="flex flex-col h-full gap-2">
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="New task…"
            className="flex-1 h-8 px-2 rounded-md bg-secondary/40 border border-border text-sm outline-none focus:border-primary"
          />
          <button onClick={add} className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:opacity-90">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <ul className="flex-1 min-h-0 overflow-auto scrollbar-thin space-y-1">
          {tasks.length === 0 && <li className="text-xs text-muted-foreground py-2">No tasks yet.</li>}
          {tasks.map((t) => (
            <li key={t.id} className="group flex items-center gap-2 text-sm py-1">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => setTasks((cur) => cur.map(x => x.id === t.id ? { ...x, done: !x.done } : x))}
                className="accent-primary"
              />
              <span className={`flex-1 truncate ${t.done ? "line-through text-muted-foreground" : ""}`}>{t.t}</span>
              <button
                onClick={() => setTasks((cur) => cur.filter(x => x.id !== t.id))}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </WidgetShell>
  );
}

type BM = { id: string; label: string; url: string };
export function BookmarksWidget({ onRemove }: RProps) {
  const [items, setItems] = useState<BM[]>([
    { id: "1", label: "Docs", url: "/dashboard/docs" },
  ]);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const add = () => {
    if (!label.trim() || !url.trim()) return;
    setItems((cur) => [...cur, { id: crypto.randomUUID(), label: label.trim(), url: url.trim() }]);
    setLabel(""); setUrl("");
  };
  return (
    <WidgetShell title="Bookmarks" icon={Bookmark} onRemove={onRemove}>
      <div className="flex flex-col h-full gap-2">
        <ul className="flex-1 min-h-0 overflow-auto scrollbar-thin space-y-1">
          {items.map((b) => (
            <li key={b.id} className="group flex items-center gap-2 text-sm py-1">
              <Bookmark className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <a href={b.url} target={b.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="flex-1 truncate hover:text-primary hover:underline">{b.label}</a>
              <button
                onClick={() => setItems((cur) => cur.filter(x => x.id !== b.id))}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-1.5">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className="flex-1 h-8 px-2 rounded-md bg-secondary/40 border border-border text-xs outline-none focus:border-primary" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL" className="flex-[2] h-8 px-2 rounded-md bg-secondary/40 border border-border text-xs outline-none focus:border-primary" />
          <button onClick={add} className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:opacity-90">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </WidgetShell>
  );
}

// ---------- Catalog ----------

import type { ComponentType } from "react";

export type WidgetCatalogItem = {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: "Workspace" | "Stats" | "Analytics" | "Productivity" | "Info";
  Component: ComponentType<RProps>;
  default: { x: number; y: number; w: number; h: number; minW?: number; minH?: number };
};

export const WIDGET_CATALOG: WidgetCatalogItem[] = [
  { id: "welcome",    name: "Welcome",        description: "Greeting and workspace status.",           icon: Sparkles,  category: "Workspace",   Component: WelcomeWidget,        default: { x: 0, y: 0,  w: 8, h: 6, minW: 4, minH: 5 } },
  { id: "usage",      name: "Usage",          description: "Tokens, storage, requests.",                icon: Zap,       category: "Stats",       Component: UsageWidget,          default: { x: 8, y: 0,  w: 4, h: 6, minW: 3, minH: 5 } },
  { id: "memories",   name: "Memories",       description: "Total stored memories.",                    icon: Database,  category: "Stats",       Component: MemoriesStatWidget,   default: { x: 0, y: 6,  w: 3, h: 6, minW: 2, minH: 5 } },
  { id: "connectors", name: "Connectors",     description: "Tools and data sources count.",             icon: Plug,      category: "Stats",       Component: ConnectorsStatWidget, default: { x: 3, y: 6,  w: 3, h: 6, minW: 2, minH: 5 } },
  { id: "events",     name: "Events",         description: "Recent event-bus activity.",                icon: Activity,  category: "Stats",       Component: EventsStatWidget,     default: { x: 6, y: 6,  w: 3, h: 6, minW: 2, minH: 5 } },
  { id: "docs",       name: "Documents",      description: "Indexed sources ready for grounding.",      icon: FileText,  category: "Stats",       Component: DocsWidget,           default: { x: 9, y: 6,  w: 3, h: 6, minW: 2, minH: 5 } },
  { id: "agents",     name: "Agents",         description: "User workspace + connected sub-agents.",    icon: Sparkles,  category: "Workspace",   Component: AgentsStatWidget,     default: { x: 0, y: 12, w: 4, h: 9, minW: 3, minH: 6 } },
  { id: "skills_stat",name: "Skills count",   description: "Reusable prompt bundles.",                  icon: Sparkles,  category: "Stats",       Component: SkillsStatWidget,     default: { x: 3, y: 12, w: 3, h: 6, minW: 2, minH: 5 } },
  { id: "analytics",  name: "Analytics",      description: "Inference calls bar chart.",                icon: BarChart3, category: "Analytics",   Component: AnalyticsWidget,      default: { x: 0, y: 18, w: 6, h: 8, minW: 4, minH: 6 } },
  { id: "skills",     name: "Skills resume",  description: "Top skills by call volume.",                icon: Sparkles,  category: "Analytics",   Component: SkillsResumeWidget,   default: { x: 6, y: 18, w: 3, h: 8, minW: 3, minH: 5 } },
  { id: "plugins",    name: "Plugins",        description: "Installed plugins state.",                  icon: Puzzle,    category: "Workspace",   Component: PluginsSummaryWidget, default: { x: 9, y: 18, w: 3, h: 8, minW: 3, minH: 5 } },
  { id: "activity",   name: "Recent activity",description: "Latest events stream.",                     icon: Clock,     category: "Analytics",   Component: RecentActivityWidget, default: { x: 0, y: 26, w: 6, h: 6, minW: 4, minH: 5 } },
  { id: "quickstart", name: "Quick start",    description: "Onboarding checklist.",                     icon: BookOpen,  category: "Info",        Component: QuickStartWidget,     default: { x: 6, y: 26, w: 3, h: 6, minW: 3, minH: 5 } },
  { id: "project",    name: "Project info",   description: "Plan, region, user ID.",                    icon: KeyRound,  category: "Info",        Component: ProjectInfoWidget,    default: { x: 9, y: 26, w: 3, h: 6, minW: 3, minH: 5 } },
  // Productivity (off by default)
  { id: "clock",      name: "Clock",          description: "Live time and date.",                       icon: Clock,     category: "Productivity",Component: ClockWidget,          default: { x: 0, y: 32, w: 3, h: 5, minW: 2, minH: 4 } },
  { id: "notes",      name: "Notes",          description: "Personal scratchpad (saved locally).",      icon: StickyNote,category: "Productivity",Component: NotesWidget,          default: { x: 3, y: 32, w: 4, h: 7, minW: 3, minH: 5 } },
  { id: "tasks",      name: "Tasks",          description: "Lightweight to-do list (saved locally).",   icon: ListTodo,  category: "Productivity",Component: TasksWidget,          default: { x: 7, y: 32, w: 3, h: 7, minW: 3, minH: 5 } },
  { id: "bookmarks",  name: "Bookmarks",      description: "Quick links to anywhere.",                  icon: Bookmark,  category: "Productivity",Component: BookmarksWidget,      default: { x: 9, y: 32, w: 3, h: 7, minW: 3, minH: 5 } },
];

export const DEFAULT_VISIBLE_IDS = [
  "welcome","usage","memories","connectors","events","docs",
  "analytics","skills","plugins","activity","quickstart","project",
];
