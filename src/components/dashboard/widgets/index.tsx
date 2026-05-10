import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import {
  Database, Plug, Activity, ArrowUpRight, BookOpen, Sparkles, Puzzle,
  BarChart3, FileText, KeyRound, Zap, TrendingUp, Clock, GripVertical,
} from "lucide-react";

export function WidgetShell({
  title, icon: Icon, action, children, className = "",
}: {
  title: string;
  icon?: any;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`group/widget h-full w-full rounded-lg border border-border bg-card flex flex-col overflow-hidden ${className}`}>
      <div className="h-9 px-3 flex items-center gap-2 border-b border-border shrink-0">
        <GripVertical className="drag-handle h-3.5 w-3.5 text-muted-foreground/40 cursor-grab active:cursor-grabbing" />
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <div className="text-xs font-medium tracking-tight">{title}</div>
        <div className="ml-auto">{action}</div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-4">{children}</div>
    </div>
  );
}

export function WelcomeWidget() {
  const { user } = useAuth();
  return (
    <WidgetShell title="Welcome" icon={Sparkles}>
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
          <Sparkles className="h-3 w-3" /> Synapse
        </div>
        <h2 className="text-lg font-semibold tracking-tight truncate">{user?.email}</h2>
        <p className="text-xs text-muted-foreground">
          Your agent memory layer is live. Add memories, plug in connectors, and watch your event bus.
        </p>
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

export function MemoriesStatWidget() {
  const { user } = useAuth();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!user) return;
    supabase.from("memories").select("*", { count: "exact", head: true }).eq("user_id", user.id).then(r => setN(r.count ?? 0));
  }, [user]);
  return <WidgetShell title="Memories" icon={Database}><StatCard label="Memories" value={n} hint="Across all namespaces" icon={Database} to="/dashboard/memory" /></WidgetShell>;
}
export function ConnectorsStatWidget() {
  const { user } = useAuth();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!user) return;
    supabase.from("connectors").select("*", { count: "exact", head: true }).eq("user_id", user.id).then(r => setN(r.count ?? 0));
  }, [user]);
  return <WidgetShell title="Connectors" icon={Plug}><StatCard label="Connectors" value={n} hint="Tools & data sources" icon={Plug} to="/dashboard/connectors" /></WidgetShell>;
}
export function EventsStatWidget() {
  const { user } = useAuth();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!user) return;
    supabase.from("events").select("*", { count: "exact", head: true }).eq("user_id", user.id).then(r => setN(r.count ?? 0));
  }, [user]);
  return <WidgetShell title="Events (24h)" icon={Activity}><StatCard label="Events" value={n} hint="Real-time bus" icon={Activity} to="/dashboard/events" /></WidgetShell>;
}

export function QuickStartWidget() {
  return (
    <WidgetShell title="Quick start" icon={BookOpen}>
      <ol className="space-y-2 text-sm text-muted-foreground">
        <li>1. Create your first memory in the <Link to="/dashboard/memory" className="text-primary hover:underline">Memory browser</Link></li>
        <li>2. Connect a tool from the <Link to="/dashboard/connectors" className="text-primary hover:underline">Connectors</Link> page</li>
        <li>3. Generate an <Link to="/dashboard/api-keys" className="text-primary hover:underline">API key</Link> and call the gateway</li>
      </ol>
    </WidgetShell>
  );
}

export function ProjectInfoWidget() {
  const { user } = useAuth();
  return (
    <WidgetShell title="Project info" icon={KeyRound}>
      <dl className="text-sm space-y-2">
        <div className="flex justify-between"><dt className="text-muted-foreground">Plan</dt><dd>Free</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Region</dt><dd>auto</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">User ID</dt><dd className="font-mono text-xs truncate max-w-[180px]">{user?.id}</dd></div>
      </dl>
    </WidgetShell>
  );
}

export function AnalyticsWidget() {
  const bars = [12, 28, 18, 42, 30, 56, 38, 64, 50, 72, 60, 84];
  const max = Math.max(...bars);
  return (
    <WidgetShell title="Analytics" icon={BarChart3} action={<span className="text-[10px] text-muted-foreground">last 12h</span>}>
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

export function SkillsResumeWidget() {
  const skills = [
    { name: "summarize.v3", calls: 1284, status: "live" },
    { name: "classify.intent", calls: 902, status: "live" },
    { name: "extract.entities", calls: 547, status: "draft" },
    { name: "rerank.docs", calls: 318, status: "live" },
  ];
  return (
    <WidgetShell title="Skills resume" icon={Sparkles} action={<Link to="/dashboard/skills" className="text-[11px] text-primary hover:underline">View all</Link>}>
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

export function PluginsSummaryWidget() {
  const plugins = [
    { name: "Slack relay", v: "1.2.0", state: "active" },
    { name: "Gmail digest", v: "0.8.1", state: "active" },
    { name: "Notion sync", v: "2.0.0", state: "paused" },
  ];
  return (
    <WidgetShell title="Plugins" icon={Puzzle} action={<Link to="/dashboard/plugins" className="text-[11px] text-primary hover:underline">Manage</Link>}>
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

export function RecentActivityWidget() {
  const items = [
    { t: "2m", msg: "memory.write · namespace=default" },
    { t: "11m", msg: "connector.slack · channel synced" },
    { t: "34m", msg: "skill.summarize.v3 · 42 calls" },
    { t: "1h", msg: "api_key.created · syn_live_3f…" },
  ];
  return (
    <WidgetShell title="Recent activity" icon={Clock}>
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

export function UsageWidget() {
  const rows = [
    { k: "Tokens", v: "184.2K", pct: 36 },
    { k: "Storage", v: "2.1 GB", pct: 21 },
    { k: "Requests", v: "12,840", pct: 64 },
  ];
  return (
    <WidgetShell title="Usage" icon={Zap}>
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

export function DocsWidget() {
  return (
    <WidgetShell title="Documents" icon={FileText} action={<Link to="/dashboard/documents" className="text-[11px] text-primary hover:underline">Open</Link>}>
      <div className="space-y-1">
        <div className="text-2xl font-semibold tabular-nums">0</div>
        <div className="text-xs text-muted-foreground">Indexed sources · ready for grounding</div>
      </div>
    </WidgetShell>
  );
}
