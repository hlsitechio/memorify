import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Database, Plug, Activity, ArrowUpRight, BookOpen, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

type Stats = { memories: number; connectors: number; events: number };

export default function DashboardHome() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ memories: 0, connectors: 0, events: 0 });

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("memories").select("*", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("connectors").select("*", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("events").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    ]).then(([m, c, e]) =>
      setStats({ memories: m.count ?? 0, connectors: c.count ?? 0, events: e.count ?? 0 })
    );
  }, [user]);

  const cards = [
    { label: "Memories", value: stats.memories, icon: Database, to: "/dashboard/memory", hint: "Stored across all namespaces" },
    { label: "Connectors", value: stats.connectors, icon: Plug, to: "/dashboard/connectors", hint: "Tools & data sources" },
    { label: "Events (24h)", value: stats.events, icon: Activity, to: "/dashboard/events", hint: "Real-time bus" },
  ];

  return (
    <>
      <PageHeader title="Home" description="Project overview" />
      <div className="p-6 space-y-6 max-w-6xl">
        <div className="rounded-lg border border-border bg-card p-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-mesh opacity-40 pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground mb-3">
              <Sparkles className="h-3 w-3" /> Welcome to Synapse
            </div>
            <h2 className="text-xl font-semibold tracking-tight">{user?.email}</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Your agent memory layer is live. Add memories, plug in connectors, and watch your event bus.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cards.map((c) => (
            <Link
              key={c.label}
              to={c.to}
              className="group rounded-lg border border-border bg-card p-5 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center justify-between">
                <c.icon className="h-4 w-4 text-muted-foreground" />
                <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="mt-4 text-3xl font-semibold tabular-nums">{c.value}</div>
              <div className="text-sm font-medium mt-1">{c.label}</div>
              <div className="text-xs text-muted-foreground">{c.hint}</div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Quick start</h3>
            </div>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li>1. Create your first memory in the <Link to="/dashboard/memory" className="text-primary hover:underline">Memory browser</Link></li>
              <li>2. Connect a tool from the <Link to="/dashboard/connectors" className="text-primary hover:underline">Connectors</Link> page</li>
              <li>3. Generate an <Link to="/dashboard/api-keys" className="text-primary hover:underline">API key</Link> and call the gateway</li>
            </ol>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">Project info</h3>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between"><dt className="text-muted-foreground">Plan</dt><dd>Free</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Region</dt><dd>auto</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">User ID</dt><dd className="font-mono text-xs truncate max-w-[180px]">{user?.id}</dd></div>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
