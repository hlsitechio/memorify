import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Puzzle, Trash2, Sparkles, Wrench, Plug, Globe } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  const [rows, setRows] = useState<Plugin[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", method: "POST", headers: "" });

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("plugins").select("*").eq("user_id", user.id).order("position").order("created_at", { ascending: false });
    setRows((data as any) ?? []);
  };
  useEffect(() => { load(); }, [user]);

  const createHttp = async () => {
    if (!user || !form.name || !form.url) return toast.error("Name and URL required");
    let headers: any = {};
    if (form.headers.trim()) { try { headers = JSON.parse(form.headers); } catch { return toast.error("Headers must be JSON"); } }
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

  return (
    <>
      <PageHeader
        title="Plugins"
        description="Wired tools your agents can call"
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
            <p className="text-xs text-muted-foreground mt-1">Add an HTTP plugin here, or wire skills/MCP tools as plugins from their pages.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {rows.map((p) => {
              const meta = KIND_META[p.kind] ?? { icon: Puzzle, label: p.kind, tone: "text-muted-foreground" };
              const Icon = meta.icon;
              return (
                <div key={p.id} className="grid grid-cols-[28px_120px_1fr_auto] items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
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
