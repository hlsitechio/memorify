import { useCallback, useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Input } from "@/components/ui/input";
import { Search, ScrollText } from "lucide-react";

type Event = { id: string; kind: string; source: string | null; payload: any; created_at: string };

export default function Logs() {
  const { user } = useAuth();
  const { action } = useApi();
  const [rows, setRows] = useState<Event[]>([]);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await action("events.list", { limit: 500 });
    setRows((data as Event[]) ?? []);
  }, [user, action]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => rows.filter((r) => !q || r.kind.includes(q) || (r.source ?? "").includes(q) || JSON.stringify(r.payload).includes(q)),
    [rows, q]
  );

  return (
    <>
      <PageHeader title="Logs" description="Searchable history of all gateway activity" />
      <div className="p-6 space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-8 h-9 font-mono" placeholder="Filter by kind, source, payload…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="rounded-lg border border-border bg-card overflow-hidden font-mono text-xs">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <ScrollText className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
              <p className="text-sm font-sans font-medium">No logs match</p>
            </div>
          ) : (
            filtered.map((r) => (
              <div key={r.id} className="px-4 py-1.5 border-b border-border/40 last:border-0 hover:bg-secondary/30">
                <span className="text-muted-foreground">{new Date(r.created_at).toISOString()}</span>{" "}
                <span className="text-primary">[{r.kind}]</span>{" "}
                <span className="text-muted-foreground">{r.source ?? "-"}</span>{" "}
                <span>{JSON.stringify(r.payload)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}