import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Search, Trash2, RefreshCcw, Database } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Memory = {
  id: string;
  namespace: string;
  content: string;
  tags: string[] | null;
  metadata: any;
  created_at: string;
};

export default function Memory() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ namespace: "default", content: "", tags: "" });

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("memories")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setRows((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("memories-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "memories", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const create = async () => {
    if (!user) return;
    if (!form.content.trim()) return toast.error("Content required");
    const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const { error } = await supabase.from("memories").insert({
      user_id: user.id,
      namespace: form.namespace || "default",
      content: form.content,
      tags,
    });
    if (error) return toast.error(error.message);
    toast.success("Memory created");
    setOpen(false);
    setForm({ namespace: "default", content: "", tags: "" });
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("memories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
  };

  const filtered = rows.filter((r) =>
    !q ||
    r.content.toLowerCase().includes(q.toLowerCase()) ||
    r.namespace.toLowerCase().includes(q.toLowerCase()) ||
    (r.tags ?? []).some((t) => t.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <>
      <PageHeader
        title="Memory"
        description="Browse, search, and manage memories"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Refresh
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> New memory</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New memory</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Namespace</Label>
                    <Input value={form.namespace} onChange={(e) => setForm({ ...form, namespace: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Content</Label>
                    <Textarea rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="What should the agent remember?" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tags (comma separated)</Label>
                    <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="user, preference, billing" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={create}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8 h-9" placeholder="Search content, namespace, tags…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">{filtered.length} rows</div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-[140px_1fr_180px_120px_40px] text-[11px] uppercase tracking-wider text-muted-foreground bg-secondary/40 px-4 py-2 border-b border-border">
            <div>Namespace</div>
            <div>Content</div>
            <div>Tags</div>
            <div>Created</div>
            <div></div>
          </div>
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Database className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
              <p className="text-sm font-medium">No memories yet</p>
              <p className="text-xs text-muted-foreground mt-1">Create your first memory to get started.</p>
            </div>
          ) : (
            filtered.map((r) => (
              <div key={r.id} className="grid grid-cols-[140px_1fr_180px_120px_40px] items-center px-4 py-3 border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                <div className="font-mono text-xs text-muted-foreground truncate">{r.namespace}</div>
                <div className="text-sm truncate pr-4">{r.content}</div>
                <div className="flex flex-wrap gap-1">
                  {(r.tags ?? []).slice(0, 3).map((t) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{t}</span>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</div>
                <button onClick={() => del(r.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
