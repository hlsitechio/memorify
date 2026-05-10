import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Puzzle, Trash2, Sparkles, Wrench, Plug, Globe, GripVertical } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCopilotBus } from "@/copilot/bus";

type Plugin = {
  id: string;
  name: string;
  kind: string;
  ref_id: string | null;
  config: any;
  enabled: boolean;
  position: number;
};

const KIND_META: Record<string, { icon: any; label: string; tone: string }> = {
  skill: { icon: Sparkles, label: "Skill", tone: "text-primary" },
  mcp_tool: { icon: Wrench, label: "MCP", tone: "text-blue-500" },
  connector: { icon: Plug, label: "Connector", tone: "text-amber-500" },
  http: { icon: Globe, label: "HTTP", tone: "text-emerald-500" },
};

export default function Plugins() {
  const { user } = useAuth();
  const { registerFlash } = useCopilotBus();
  const [rows, setRows] = useState<Plugin[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", method: "POST", headers: "" });
  const [flashing, setFlashing] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("plugins").select("*").eq("user_id", user.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false });
    setRows((data as any) ?? []);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Realtime: refetch on any change so copilot mutations show up live.
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`plugins:${user.id}`)
      .on("postgres_changes",
          { event: "*", schema: "public", table: "plugins", filter: `user_id=eq.${user.id}` },
          () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  // Allow plugins.flash to pulse a row.
  useEffect(() => {
    const unregs = rows.map((p) =>
      registerFlash(`plugin:${p.id}`, () => {
        setFlashing(p.id);
        window.setTimeout(() => setFlashing((x) => (x === p.id ? null : x)), 1200);
      })
    );
    return () => unregs.forEach((u) => u());
  }, [rows, registerFlash]);

  const createHttp = async () => {
    if (!user || !form.name || !form.url) return toast.error("Name and URL required");
    let headers: any = {};
    if (form.headers.trim()) {
      try { headers = JSON.parse(form.headers); } catch { return toast.error("Headers must be JSON"); }
    }
    const { error } = await supabase.from("plugins").insert({
      user_id: user.id, name: form.name, kind: "http",
      config: { url: form.url, method: form.method, headers },
    });
    if (error) return toast.error(error.message);
    toast.success("Plugin added");
    setOpen(false); setForm({ name: "", url: "", method: "POST", headers: "" });
    load();
  };

  const toggle = async (p: Plugin) => {
    await supabase.from("plugins").update({ enabled: !p.enabled }).eq("id", p.id);
    load();
  };
  const del = async (id: string) => {
    await supabase.from("plugins").delete().eq("id", id);
    load();
  };

  // Native HTML5 drag reorder. Persists positions on drop.
  const onDragStart = (id: string) => { dragId.current = id; };
  const onDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    if (!dragId.current || dragId.current === overId) return;
    setRows((prev) => {
      const from = prev.findIndex((r) => r.id === dragId.current);
      const to = prev.findIndex((r) => r.id === overId);
      if (from === -1 || to === -1) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };
  const onDrop = async () => {
    dragId.current = null;
    const ids = rows.map((r) => r.id);
    for (let i = 0; i < ids.length; i++) {
      await supabase.from("plugins").update({ position: i }).eq("id", ids[i]);
    }
    load();
  };

  return (
    <>
      <PageHeader
        title="Plugins"
        description="Wired tools your agents can call. Drag to reorder."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add HTTP plugin</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add HTTP plugin</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>URL</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://api.example.com/tool" /></div>
                <div className="space-y-1.5">
                  <Label>Method</Label>
                  <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["GET", "POST", "PUT", "DELETE", "PATCH"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Headers (JSON, optional)</Label><Input value={form.headers} onChange={(e) => setForm({ ...form, headers: e.target.value })} placeholder='{"Authorization":"Bearer …"}' /></div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={createHttp}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="p-6 overflow-y-auto scrollbar-thin h-[calc(100vh-3.5rem)]">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <Puzzle className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
            <p className="text-sm font-medium">No plugins</p>
            <p className="text-xs text-muted-foreground mt-1">Add an HTTP plugin here, or ask Copilot: "Add a Slack relay HTTP plugin".</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {rows.map((p) => {
              const meta = KIND_META[p.kind] ?? { icon: Puzzle, label: p.kind, tone: "text-muted-foreground" };
              const Icon = meta.icon;
              return (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => onDragStart(p.id)}
                  onDragOver={(e) => onDragOver(e, p.id)}
                  onDrop={onDrop}
                  onDragEnd={onDrop}
                  className={cn(
                    "grid grid-cols-[20px_28px_120px_1fr_auto] items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-secondary/30 transition-colors",
                    flashing === p.id && "bg-primary/15 ring-1 ring-primary/40"
                  )}
                >
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 cursor-grab active:cursor-grabbing" />
                  <Icon className={cn("h-4 w-4", meta.tone)} />
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{meta.label}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    {p.config?.url && <div className="text-[11px] font-mono text-muted-foreground truncate">{p.config.url}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={p.enabled} onCheckedChange={() => toggle(p)} />
                    <Button size="sm" variant="ghost" onClick={() => del(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
