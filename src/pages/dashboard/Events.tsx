import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Activity, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Event = { id: string; kind: string; source: string | null; payload: any; created_at: string };

const kindColor = (k: string) =>
  k.includes("error") ? "text-destructive" :
  k.includes("memory") ? "text-primary" :
  k.includes("tool") ? "text-accent-foreground" :
  "text-foreground";

export default function Events() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Event[]>([]);
  const [live, setLive] = useState(true);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("events").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
    setRows((data as any) ?? []);
  };

  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    if (!user || !live) return;
    const ch = supabase
      .channel("events-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events", filter: `user_id=eq.${user.id}` }, (p) => {
        setRows((prev) => [p.new as any, ...prev].slice(0, 100));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, live]);

  const emitDemo = async () => {
    if (!user) return;
    const kinds = ["memory.write", "memory.read", "tool.call", "agent.message", "error.timeout"];
    const sources = ["agent-1", "agent-2", "gateway", "scheduler"];
    const { error } = await supabase.from("events").insert({
      user_id: user.id,
      kind: kinds[Math.floor(Math.random() * kinds.length)],
      source: sources[Math.floor(Math.random() * sources.length)],
      payload: { ts: Date.now(), demo: true },
    });
    if (error) toast.error(error.message);
  };

  return (
    <>
      <PageHeader
        title="Events"
        description="Real-time event bus across all agents"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setLive(!live)}>
              <span className={cn("h-1.5 w-1.5 rounded-full mr-2", live ? "bg-primary animate-pulse" : "bg-muted-foreground")} />
              {live ? "Live" : "Paused"}
            </Button>
            <Button size="sm" onClick={emitDemo}><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Emit test event</Button>
          </>
        }
      />
      <div className="p-6">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-[180px_180px_120px_1fr] text-[11px] uppercase tracking-wider text-muted-foreground bg-secondary/40 px-4 py-2 border-b border-border">
            <div>Time</div>
            <div>Kind</div>
            <div>Source</div>
            <div>Payload</div>
          </div>
          {rows.length === 0 ? (
            <div className="p-12 text-center">
              <Activity className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
              <p className="text-sm font-medium">No events yet</p>
              <p className="text-xs text-muted-foreground mt-1">Emit a test event or wire up your gateway.</p>
            </div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[180px_180px_120px_1fr] items-center px-4 py-2 border-b border-border last:border-0 font-mono text-xs">
                <div className="text-muted-foreground">{new Date(r.created_at).toLocaleTimeString()}</div>
                <div className={kindColor(r.kind)}>{r.kind}</div>
                <div className="text-muted-foreground">{r.source ?? "—"}</div>
                <div className="truncate text-muted-foreground">{JSON.stringify(r.payload)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
