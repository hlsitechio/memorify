import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { setCurrentWorkspace, useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
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
            <Sparkles className="h-3 w-3" /> {isAgent ? "Agent workspace" : "Synapse"}
          </div>
          <h2 className="text-lg font-semibold tracking-tight truncate">{title}</h2>
          {wsId && (
            <div className="text-[11px] font-mono text-muted-foreground truncate">{wsId}</div>
          )}
          <p className="text-xs text-muted-foreground">{blurb}</p>
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

function useCount(table: string) {
  const { user } = useAuth();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!user) return;
    supabase.from(table as any).select("*", { count: "exact", head: true }).eq("user_id", user.id).then((r: any) => setN(r.count ?? 0));
  }, [user, table]);
  return n;
}

export function MemoriesStatWidget({ onRemove }: RProps) {
  const n = useCount("memories");
  return <WidgetShell title="Memories" icon={Database} onRemove={onRemove}><StatCard label="Memories" value={n} hint="Across all namespaces" icon={Database} to="/dashboard/memory" /></WidgetShell>;
}
export function ConnectorsStatWidget({ onRemove }: RProps) {
  const n = useCount("connectors");
  return <WidgetShell title="Connectors" icon={Plug} onRemove={onRemove}><StatCard label="Connectors" value={n} hint="Tools & data sources" icon={Plug} to="/dashboard/connectors" /></WidgetShell>;
}
export function EventsStatWidget({ onRemove }: RProps) {
  const n = useCount("events");
  return <WidgetShell title="Events (24h)" icon={Activity} onRemove={onRemove}><StatCard label="Events" value={n} hint="Real-time bus" icon={Activity} to="/dashboard/events" /></WidgetShell>;
}
export function AgentsStatWidget({ onRemove }: RProps) {
  const { user } = useAuth();
  const [ws] = useCurrentWorkspace();
  const activeId = ws?.id ?? (user ? `user:${user.id}` : "");
  const [agents, setAgents] = useState<Array<{ id: string; name: string; kind: string; status: string; metadata: any }>>([]);
  useEffect(() => {
    if (!user) return;
    supabase
      .from("agents")
      .select("id,name,kind,status,metadata")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then((r: any) => setAgents(r.data ?? []));
  }, [user]);

  return (
    <WidgetShell
      title="Agents"
      icon={Sparkles}
      action={<Link to="/dashboard/agents" className="text-[11px] text-primary hover:underline">Manage</Link>}
      onRemove={onRemove}
    >
      <div className="space-y-1.5">
        {/* User workspace — always first */}
        {(() => {
          const userActive = user && activeId === `user:${user.id}`;
          return (
            <Link
              to="/dashboard"
              onClick={() => user && setCurrentWorkspace({
                id: `user:${user.id}`,
                name: "User Workspace",
                subtitle: "main",
                kind: "user",
                short: (user.email ?? "U").charAt(0).toUpperCase(),
              })}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
                userActive
                  ? "border border-primary/30 bg-primary/5"
                  : "border border-transparent hover:bg-secondary/60 hover:border-border"
              }`}
            >
              <div className="h-6 w-6 rounded bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Sparkles className="h-3 w-3" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">User Workspace</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  user:{user?.id?.slice(0, 8)}… · main
                </div>
              </div>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          );
        })()}

        {/* Divider */}
        <div className="px-2 pt-1.5 pb-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
          Sub-agents ({agents.length})
        </div>

        {agents.length === 0 && (
          <div className="px-2 py-3 text-[11px] text-muted-foreground">
            No agents yet. <Link to="/dashboard/agents" className="text-primary hover:underline">Connect one →</Link>
          </div>
        )}

        {agents.map((a) => {
          const meta = (a.metadata as any) || {};
          const wsName = meta.workspace_name as string | undefined;
          const shortName = (meta.short_name as string | undefined) ||
            (a.name || a.kind || "A").slice(0, 2).toUpperCase();
          const connected = a.status === "connected";
          return (
            <Link
              key={a.id}
              to="/dashboard"
              onClick={() => setCurrentWorkspace({
                id: `agent:${a.id}`,
                name: `WS - ${a.name || a.kind}`,
                subtitle: wsName || `agent:${a.id.slice(0, 8)}…`,
                kind: "agent",
                short: shortName,
              })}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/60 transition-colors border border-transparent hover:border-border"
            >
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${connected ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{a.name || a.kind}</div>
                <div className="text-[10px] text-muted-foreground truncate font-mono">
                  {wsName || `agent:${a.id.slice(0, 8)}…`}
                </div>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary/60 border border-border text-muted-foreground">
                {shortName}
              </span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </WidgetShell>
  );
}
export function SkillsStatWidget({ onRemove }: RProps) {
  const n = useCount("skills");
  return <WidgetShell title="Skills" icon={Sparkles} onRemove={onRemove}><StatCard label="Skills" value={n} hint="Reusable prompt bundles" icon={Sparkles} to="/dashboard/skills" /></WidgetShell>;
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
  return (
    <WidgetShell title="Project info" icon={KeyRound} onRemove={onRemove}>
      <dl className="text-sm space-y-2">
        <div className="flex justify-between"><dt className="text-muted-foreground">Plan</dt><dd>Free</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Region</dt><dd>auto</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">User ID</dt><dd className="font-mono text-xs truncate max-w-[180px]">{user?.id}</dd></div>
      </dl>
    </WidgetShell>
  );
}

export function AnalyticsWidget({ onRemove }: RProps) {
  const bars = [12, 28, 18, 42, 30, 56, 38, 64, 50, 72, 60, 84];
  const max = Math.max(...bars);
  return (
    <WidgetShell title="Analytics" icon={BarChart3} action={<span className="text-[10px] text-muted-foreground">last 12h</span>} onRemove={onRemove}>
      <div className="space-y-3">
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-semibold tabular-nums">2,418</div>
          <div className="flex items-center text-[11px] text-emerald-400"><TrendingUp className="h-3 w-3 mr-0.5" />+12.4%</div>
        </div>
        <div className="flex items-end gap-1 h-16">
          {bars.map((b, i) => (
            <div key={i} className="flex-1 rounded-sm bg-gradient-to-t from-primary/50 to-primary" style={{ height: `${(b / max) * 100}%` }} />
          ))}
        </div>
        <div className="text-[11px] text-muted-foreground">Inference calls across all skills</div>
      </div>
    </WidgetShell>
  );
}

export function SkillsResumeWidget({ onRemove }: RProps) {
  const skills = [
    { name: "summarize.v3", calls: 1284, status: "live" },
    { name: "classify.intent", calls: 902, status: "live" },
    { name: "extract.entities", calls: 547, status: "draft" },
    { name: "rerank.docs", calls: 318, status: "live" },
  ];
  return (
    <WidgetShell title="Skills resume" icon={Sparkles} action={<Link to="/dashboard/skills" className="text-[11px] text-primary hover:underline">View all</Link>} onRemove={onRemove}>
      <ul className="space-y-2">
        {skills.map(s => (
          <li key={s.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`h-1.5 w-1.5 rounded-full ${s.status === "live" ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span className="font-mono text-xs truncate">{s.name}</span>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">{s.calls.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}

export function PluginsSummaryWidget({ onRemove }: RProps) {
  const plugins = [
    { name: "Slack relay", v: "1.2.0", state: "active" },
    { name: "Gmail digest", v: "0.8.1", state: "active" },
    { name: "Notion sync", v: "2.0.0", state: "paused" },
  ];
  return (
    <WidgetShell title="Plugins" icon={Puzzle} action={<Link to="/dashboard/plugins" className="text-[11px] text-primary hover:underline">Manage</Link>} onRemove={onRemove}>
      <ul className="space-y-2">
        {plugins.map(p => (
          <li key={p.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Puzzle className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate">{p.name}</span>
              <span className="text-[10px] font-mono text-muted-foreground">{p.v}</span>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${p.state === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>{p.state}</span>
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}

export function RecentActivityWidget({ onRemove }: RProps) {
  const items = [
    { t: "2m", msg: "memory.write · namespace=default" },
    { t: "11m", msg: "connector.slack · channel synced" },
    { t: "34m", msg: "skill.summarize.v3 · 42 calls" },
    { t: "1h", msg: "api_key.created · syn_live_3f…" },
  ];
  return (
    <WidgetShell title="Recent activity" icon={Clock} onRemove={onRemove}>
      <ul className="space-y-2">
        {items.map((i, idx) => (
          <li key={idx} className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground tabular-nums w-8">{i.t}</span>
            <span className="font-mono truncate">{i.msg}</span>
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}

export function UsageWidget({ onRemove }: RProps) {
  const rows = [
    { k: "Tokens", v: "184.2K", pct: 36 },
    { k: "Storage", v: "2.1 GB", pct: 21 },
    { k: "Requests", v: "12,840", pct: 64 },
  ];
  return (
    <WidgetShell title="Usage" icon={Zap} onRemove={onRemove}>
      <div className="space-y-3">
        {rows.map(r => (
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
  const n = useCount("documents");
  return (
    <WidgetShell title="Documents" icon={FileText} onRemove={onRemove}>
      <StatCard label="Documents" value={n} hint="Indexed sources · ready for grounding" icon={FileText} to="/dashboard/documents" />
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
  const [text, setText] = useState<string>(() => localStorage.getItem("synapse:notes") || "");
  useEffect(() => { localStorage.setItem("synapse:notes", text); }, [text]);
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
  const [tasks, setTasks] = useState<Task[]>(() => {
    try { return JSON.parse(localStorage.getItem("synapse:tasks") || "[]"); } catch { return []; }
  });
  const [input, setInput] = useState("");
  useEffect(() => { localStorage.setItem("synapse:tasks", JSON.stringify(tasks)); }, [tasks]);
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
  const [items, setItems] = useState<BM[]>(() => {
    try {
      const raw = localStorage.getItem("synapse:bookmarks");
      if (raw) return JSON.parse(raw);
    } catch {}
    return [
      { id: "1", label: "Docs", url: "/dashboard/docs" },
      { id: "2", label: "Lovable", url: "https://lovable.dev" },
    ];
  });
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => { localStorage.setItem("synapse:bookmarks", JSON.stringify(items)); }, [items]);
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
