import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Plug } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Connector = { id: string; name: string; kind: string; status: string; created_at: string };

const KINDS = ["http", "slack", "github", "postgres", "stripe", "notion", "gmail", "custom"];

const statusColor = (s: string) =>
  s === "active" ? "bg-primary text-primary-foreground" :
  s === "error" ? "bg-destructive text-destructive-foreground" :
  "bg-secondary text-secondary-foreground";

export default function Connectors() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Connector[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", kind: "http" });

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("connectors").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setRows((data as any) ?? []);
  };

  useEffect(() => { load(); }, [user]);

  const create = async () => {
    if (!user || !form.name) return;
    const { error } = await supabase.from("connectors").insert({ user_id: user.id, name: form.name, kind: form.kind, status: "inactive" });
    if (error) return toast.error(error.message);
    toast.success("Connector added");
    setOpen(false);
    setForm({ name: "", kind: "http" });
    load();
  };

  const toggle = async (c: Connector) => {
    const next = c.status === "active" ? "inactive" : "active";
    const { error } = await supabase.from("connectors").update({ status: next }).eq("id", c.id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <>
      <PageHeader
        title="Connectors"
        description="Tools and data sources connected to your agents"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add connector</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add connector</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My Slack workspace" />
                </div>
                <div className="space-y-1.5">
                  <Label>Kind</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter><Button onClick={create}>Add</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="p-6">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <Plug className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
            <p className="text-sm font-medium">No connectors yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add a tool or data source to extend your agents.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map((c) => (
              <div key={c.id} className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold">{c.name}</div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">{c.kind}</div>
                  </div>
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full", statusColor(c.status))}>{c.status}</span>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => toggle(c)}>
                    {c.status === "active" ? "Disable" : "Enable"}
                  </Button>
                  <Button size="sm" variant="ghost">Configure</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
