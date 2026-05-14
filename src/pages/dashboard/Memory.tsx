import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Trash2, RefreshCcw, Database, Sparkles, X, Archive, ArchiveRestore, History, RotateCcw, Folder, FolderOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PREDEFINED_CATEGORIES = [
  "general",
  "preferences",
  "personal",
  "work",
  "projects",
  "contacts",
  "knowledge",
  "decisions",
  "billing",
  "integrations",
];
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type MemoryRow = {
  id: string;
  mem_id: string | null;
  namespace: string;
  category: string;
  content: string;
  tags: string[] | null;
  metadata: any;
  archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type VersionRow = {
  id: string;
  version: number;
  namespace: string;
  category: string;
  content: string;
  tags: string[] | null;
  metadata: any;
  created_at: string;
};

export default function Memory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ws] = useCurrentWorkspace();
  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [view, setView] = useState<{ kind: "all" } | { kind: "archive" } | { kind: "category"; name: string } | { kind: "namespace"; name: string }>({ kind: "all" });
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const defaultNs = ws?.kind === "agent" && ws.agentId ? `agent:${ws.agentId}` : "default";
  const [form, setForm] = useState({ namespace: defaultNs, category: "general", content: "", tags: "" });
  useEffect(() => { setForm((f) => ({ ...f, namespace: defaultNs })); }, [defaultNs]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("memories")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
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

  // Scope rows by current workspace: agent workspaces see only their own
  // namespace; user workspace sees everything that isn't an agent namespace.
  const scoped = useMemo(() => {
    if (ws?.kind === "agent") {
      if (ws.agentId) {
        const ns = `agent:${ws.agentId}`;
        return rows.filter((r) => r.namespace === ns);
      }
      // Fallback: cached workspace without agentId — match by ws_<last12> suffix
      // of the agent UUID embedded in the namespace.
      const suffix = (ws.id || "").replace(/^ws_/, "");
      if (suffix) {
        return rows.filter((r) => {
          if (!r.namespace.startsWith("agent:")) return false;
          const compact = r.namespace.slice("agent:".length).replace(/-/g, "");
          return compact.endsWith(suffix);
        });
      }
      // Unknown agent → show nothing rather than leaking other agents' memories.
      return [];
    }
    if (ws?.kind === "user") {
      return rows.filter((r) => !r.namespace.startsWith("agent:"));
    }
    return rows;
  }, [rows, ws]);

  const active = scoped.filter((r) => !r.archived);
  const archivedRows = scoped.filter((r) => r.archived);

  const categories = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    active.forEach((r) => {
      const cat = r.category || "general";
      if (!m.has(cat)) m.set(cat, new Map());
      const ns = m.get(cat)!;
      ns.set(r.namespace, (ns.get(r.namespace) ?? 0) + 1);
    });
    return Array.from(m.entries()).sort();
  }, [active]);

  const filtered = useMemo(() => {
    let base: MemoryRow[];
    if (view.kind === "archive") base = archivedRows;
    else if (view.kind === "category") base = active.filter((r) => (r.category || "general") === view.name);
    else if (view.kind === "namespace") base = active.filter((r) => r.namespace === view.name);
    else base = active;
    if (!q) return base;
    const ql = q.toLowerCase();
    return base.filter((r) =>
      r.content.toLowerCase().includes(ql) ||
      r.namespace.toLowerCase().includes(ql) ||
      (r.category || "").toLowerCase().includes(ql) ||
      (r.tags ?? []).some((t) => t.toLowerCase().includes(ql)),
    );
  }, [view, active, archivedRows, q]);

  const create = async () => {
    if (!user) return;
    if (!form.content.trim()) return toast.error("Content required");
    const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const { error } = await supabase.from("memories").insert({
      user_id: user.id,
      namespace: form.namespace || "default",
      category: form.category || "general",
      content: form.content,
      tags,
    } as any);
    if (error) return toast.error(error.message);
    toast.success("Memory created");
    setOpen(false);
    setForm({ namespace: "default", category: "general", content: "", tags: "" });
  };

  const aiSuggest = async () => {
    if (!aiInput.trim()) return;
    setAiBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("memory-suggest", { body: { input: aiInput } });
      if (error) throw error;
      setForm({
        namespace: data?.namespace ?? "default",
        category: data?.category ?? "general",
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

  const archive = async (ids: string[], value: boolean) => {
    const { error } = await supabase.from("memories")
      .update({ archived: value, archived_at: value ? new Date().toISOString() : null } as any)
      .in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(value ? `Archived ${ids.length}` : `Restored ${ids.length}`);
    setSelected(new Set());
  };

  const del = async (ids: string[]) => {
    const { error } = await supabase.from("memories").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${ids.length}`);
    setSelected(new Set());
  };

  const moveCategory = async (ids: string[], target: string) => {
    const { error } = await supabase.from("memories").update({ category: target } as any).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Moved to ${target}`);
    setSelected(new Set());
  };

  const toggle = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const viewLabel =
    view.kind === "all" ? "All memories" :
    view.kind === "archive" ? "Archive" :
    view.kind === "category" ? `Category: ${view.name}` :
    `Namespace: ${view.name}`;

  return (
    <>
      <PageHeader
        title="Memory"
        description="Categories, versions, and archive"
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
                <Textarea rows={5} value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="Free-form note. AI will extract category, namespace, tags, and clean content." />
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setAiOpen(false)}>Cancel</Button>
                  <Button onClick={aiSuggest} disabled={aiBusy}>{aiBusy ? "Thinking…" : "Suggest"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={open} onOpenChange={(o) => {
              setOpen(o);
              if (o) {
                setForm((f) => ({
                  ...f,
                  namespace: view.kind === "namespace" ? view.name : (user?.id ?? "default"),
                  category: view.kind === "category" ? view.name : (f.category || "general"),
                }));
              }
            }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> New memory</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New memory</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label>Category</Label>
                      <Select
                        value={PREDEFINED_CATEGORIES.includes(form.category) ? form.category : "__custom__"}
                        onValueChange={(v) => setForm({ ...form, category: v === "__custom__" ? "" : v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Pick a category" /></SelectTrigger>
                        <SelectContent>
                          {PREDEFINED_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                          <SelectItem value="__custom__">Custom…</SelectItem>
                        </SelectContent>
                      </Select>
                      {!PREDEFINED_CATEGORIES.includes(form.category) && (
                        <Input
                          className="mt-1.5"
                          value={form.category}
                          onChange={(e) => setForm({ ...form, category: e.target.value })}
                          placeholder="Custom category name"
                        />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center justify-between">
                        <span>Workspace ID</span>
                        <span className="text-[10px] text-muted-foreground font-normal">auto</span>
                      </Label>
                      <Input
                        value={form.namespace}
                        onChange={(e) => setForm({ ...form, namespace: e.target.value })}
                        className="font-mono text-xs"
                      />
                    </div>
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

      <div className="p-6 space-y-4 overflow-y-auto scrollbar-thin h-[calc(100vh-3.5rem)]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setView({ kind: "all" })}
            className={cn("text-xs px-3 py-1.5 rounded-md border transition-colors flex items-center gap-1.5",
              view.kind === "all" ? "bg-secondary border-border text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary/50")}
          >
            <Database className="h-3.5 w-3.5" /> All
            <span className="tabular-nums text-muted-foreground">{active.length}</span>
          </button>
          <button
            onClick={() => setView({ kind: "archive" })}
            className={cn("text-xs px-3 py-1.5 rounded-md border transition-colors flex items-center gap-1.5",
              view.kind === "archive" ? "bg-secondary border-border text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary/50")}
          >
            <Archive className="h-3.5 w-3.5" /> Archive
            <span className="tabular-nums text-muted-foreground">{archivedRows.length}</span>
          </button>
          {categories.map(([cat, nsMap]) => {
            const total = Array.from(nsMap.values()).reduce((a, b) => a + b, 0);
            const isActive = view.kind === "category" && view.name === cat;
            return (
              <button
                key={cat}
                onClick={() => setView({ kind: "category", name: cat })}
                className={cn("text-xs px-3 py-1.5 rounded-md border transition-colors flex items-center gap-1.5",
                  isActive ? "bg-secondary border-border text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary/50")}
              >
                {isActive ? <FolderOpen className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
                <span className="truncate max-w-[160px]">{cat}</span>
                <span className="tabular-nums text-muted-foreground">{total}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
            <div className="text-sm font-medium">{viewLabel}</div>
            <div className="relative flex-1 max-w-md ml-4">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">{filtered.length} rows</div>
            {selected.size > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                {view.kind !== "archive" ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => {
                      const target = prompt("Move to category:", "general");
                      if (target) moveCategory(Array.from(selected), target);
                    }}>Move</Button>
                    <Button size="sm" variant="outline" onClick={() => archive(Array.from(selected), true)}>
                      <Archive className="h-3.5 w-3.5 mr-1.5" /> Archive
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => archive(Array.from(selected), false)}>
                    <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" /> Restore
                  </Button>
                )}
                <Button size="sm" variant="destructive" onClick={() => del(Array.from(selected))}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}><X className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-[40px_140px_110px_120px_1fr_140px_110px_40px] text-[11px] uppercase tracking-wider text-muted-foreground bg-secondary/40 px-4 py-2 border-b border-border">
              <div></div>
              <div>Memory ID</div>
              <div>Category</div>
              <div>Namespace</div>
              <div>Content</div>
              <div>Tags</div>
              <div>{view.kind === "archive" ? "Archived" : "Updated"}</div>
              <div></div>
            </div>
            {loading ? (
              <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <Database className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
                <p className="text-sm font-medium">Nothing here</p>
                <p className="text-xs text-muted-foreground mt-1">Create a memory or pick another view.</p>
              </div>
            ) : (
              filtered.map((r) => (
                <div key={r.id} className="grid grid-cols-[40px_140px_110px_120px_1fr_140px_110px_40px] items-center px-4 py-3 border-b border-border last:border-0 hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => navigate(`/dashboard/memory/${r.mem_id ?? r.id}`)}>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                  </div>
                  <div className="font-mono text-[11px] text-primary truncate" title={r.mem_id ?? ""}>{r.mem_id ?? "—"}</div>
                  <div className="text-xs truncate">{r.category || "general"}</div>
                  <div className="font-mono text-xs text-muted-foreground truncate">{r.namespace}</div>
                  <div className="text-sm truncate pr-4">{r.content}</div>
                  <div className="flex flex-wrap gap-1">
                    {(r.tags ?? []).slice(0, 3).map((t) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{t}</span>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground" title={(r.archived_at ?? r.updated_at) || ""}>
                    {formatDistanceToNow(new Date(r.archived_at ?? r.updated_at), { addSuffix: true })}
                  </div>
                  <button onClick={(e) => {
                    e.stopPropagation();
                    view.kind === "archive" ? archive([r.id], false) : archive([r.id], true);
                  }} className="text-muted-foreground hover:text-foreground transition-colors" title={view.kind === "archive" ? "Restore" : "Archive"}>
                    {view.kind === "archive" ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ))
            )}
          </div>
      </div>

    </>
  );
}
