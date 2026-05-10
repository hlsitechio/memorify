import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Trash2, RefreshCcw, Database, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type MemoryRow = {
  id: string;
  namespace: string;
  content: string;
  tags: string[] | null;
  metadata: any;
  created_at: string;
};

export default function Memory() {
  const { user } = useAuth();
  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [ns, setNs] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [form, setForm] = useState({ namespace: "default", content: "", tags: "" });
  const [editing, setEditing] = useState<MemoryRow | null>(null);
  const [editForm, setEditForm] = useState({ namespace: "", content: "", tags: "", metadata: "{}" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("memories")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500);
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

  const namespaces = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.namespace, (m.get(r.namespace) ?? 0) + 1));
    return Array.from(m.entries()).sort();
  }, [rows]);

  const filtered = rows.filter((r) =>
    (!ns || r.namespace === ns) &&
    (!q ||
      r.content.toLowerCase().includes(q.toLowerCase()) ||
      r.namespace.toLowerCase().includes(q.toLowerCase()) ||
      (r.tags ?? []).some((t) => t.toLowerCase().includes(q.toLowerCase())))
  );

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

  const aiSuggest = async () => {
    if (!aiInput.trim()) return;
    setAiBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("memory-suggest", {
        body: { input: aiInput },
      });
      if (error) throw error;
      setForm({
        namespace: data?.namespace ?? "default",
        content: data?.content ?? aiInput,
        tags: (data?.tags ?? []).join(", "),
      });
      setAiOpen(false);
      setAiInput("");
      setOpen(true);
    } catch (e: any) {
      toast.error(e.message ?? "AI suggest failed");
    } finally {
      setAiBusy(false);
    }
  };

  const openEdit = (r: MemoryRow) => {
    setEditing(r);
    setEditForm({
      namespace: r.namespace,
      content: r.content,
      tags: (r.tags ?? []).join(", "),
      metadata: JSON.stringify(r.metadata ?? {}, null, 2),
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    let metadata: any = {};
    try { metadata = JSON.parse(editForm.metadata || "{}"); } catch { return toast.error("Invalid JSON metadata"); }
    const tags = editForm.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const { error } = await supabase.from("memories")
      .update({ namespace: editForm.namespace, content: editForm.content, tags, metadata })
      .eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setEditing(null);
  };

  const del = async (ids: string[]) => {
    const { error } = await supabase.from("memories").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${ids.length}`);
    setSelected(new Set());
  };

  const moveNs = async (ids: string[], target: string) => {
    const { error } = await supabase.from("memories").update({ namespace: target }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Moved to ${target}`);
    setSelected(new Set());
  };

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

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
            <Dialog open={aiOpen} onOpenChange={setAiOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm"><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Suggest</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Insert with AI</DialogTitle></DialogHeader>
                <Textarea rows={5} value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="Free-form note. AI will extract namespace, tags, and clean content." />
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setAiOpen(false)}>Cancel</Button>
                  <Button onClick={aiSuggest} disabled={aiBusy}>{aiBusy ? "Thinking…" : "Suggest"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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

      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* namespace rail */}
        <aside className="w-56 border-r border-border bg-secondary/20 overflow-y-auto scrollbar-thin p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">Namespaces</div>
          <button
            onClick={() => setNs(null)}
            className={cn("w-full text-left text-xs px-2 py-1.5 rounded hover:bg-secondary flex items-center justify-between",
              ns === null && "bg-secondary text-foreground")}
          >
            <span>All</span><span className="text-muted-foreground tabular-nums">{rows.length}</span>
          </button>
          {namespaces.map(([name, count]) => (
            <button
              key={name}
              onClick={() => setNs(name)}
              className={cn("w-full text-left font-mono text-xs px-2 py-1.5 rounded hover:bg-secondary flex items-center justify-between truncate",
                ns === name && "bg-secondary text-foreground")}
            >
              <span className="truncate">{name}</span><span className="text-muted-foreground tabular-nums">{count}</span>
            </button>
          ))}
        </aside>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-9" placeholder="Search content, namespace, tags…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">{filtered.length} rows</div>
            {selected.size > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                <Button size="sm" variant="outline" onClick={() => {
                  const target = prompt("Move to namespace:", "default");
                  if (target) moveNs(Array.from(selected), target);
                }}>Move</Button>
                <Button size="sm" variant="destructive" onClick={() => del(Array.from(selected))}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}><X className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-[40px_140px_1fr_180px_120px_40px] text-[11px] uppercase tracking-wider text-muted-foreground bg-secondary/40 px-4 py-2 border-b border-border">
              <div></div>
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
                <div key={r.id} className="grid grid-cols-[40px_140px_1fr_180px_120px_40px] items-center px-4 py-3 border-b border-border last:border-0 hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => openEdit(r)}>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                  </div>
                  <div className="font-mono text-xs text-muted-foreground truncate">{r.namespace}</div>
                  <div className="text-sm truncate pr-4">{r.content}</div>
                  <div className="flex flex-wrap gap-1">
                    {(r.tags ?? []).slice(0, 3).map((t) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{t}</span>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</div>
                  <button onClick={(e) => { e.stopPropagation(); del([r.id]); }} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto scrollbar-thin">
          <SheetHeader><SheetTitle>Edit memory</SheetTitle></SheetHeader>
          <div className="space-y-3 mt-4">
            <div className="space-y-1.5">
              <Label>Namespace</Label>
              <Input value={editForm.namespace} onChange={(e) => setEditForm({ ...editForm, namespace: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Content</Label>
              <Textarea rows={6} value={editForm.content} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <Input value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Metadata (JSON)</Label>
              <Textarea rows={6} className="font-mono text-xs" value={editForm.metadata} onChange={(e) => setEditForm({ ...editForm, metadata: e.target.value })} />
            </div>
          </div>
          <SheetFooter className="mt-4">
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
