import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, KeyRound, Copy, Trash2, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

type ApiKey = { id: string; name: string; key_prefix: string; last_used_at: string | null; created_at: string };

const genKey = () => {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return "syn_live_" + Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const hash = async (s: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

export default function ApiKeys() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ApiKey[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("api_keys").select("id, name, key_prefix, last_used_at, created_at").eq("user_id", user.id).order("created_at", { ascending: false });
    setRows((data as any) ?? []);
  };

  useEffect(() => { load(); }, [user]);

  const create = async () => {
    if (!user || !name) return;
    const key = genKey();
    const key_hash = await hash(key);
    const { error } = await supabase.from("api_keys").insert({
      user_id: user.id,
      name,
      key_prefix: key.slice(0, 12),
      key_hash,
    });
    if (error) return toast.error(error.message);
    setCreated(key);
    setShow(true);
    setName("");
    load();
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("api_keys").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  return (
    <>
      <PageHeader
        title="API Keys"
        description="Use these keys to authenticate with the Memorify gateway"
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setCreated(null); setShow(false); } }}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> Generate key</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{created ? "Save your key" : "New API key"}</DialogTitle></DialogHeader>
              {!created ? (
                <>
                  <div className="space-y-1.5">
                    <Label>Name</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Production server" />
                  </div>
                  <DialogFooter><Button onClick={create}>Generate</Button></DialogFooter>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">This is the only time you'll see this key. Copy it now.</p>
                  <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 font-mono text-xs">
                    <span className="flex-1 truncate">{show ? created : "•".repeat(40)}</span>
                    <button onClick={() => setShow(!show)} className="text-muted-foreground hover:text-foreground">
                      {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => { navigator.clipboard.writeText(created); toast.success("Copied"); }} className="text-muted-foreground hover:text-foreground">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <DialogFooter><Button onClick={() => { setOpen(false); setCreated(null); }}>Done</Button></DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        }
      />
      <div className="p-6">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-[1fr_220px_160px_160px_40px] text-[11px] uppercase tracking-wider text-muted-foreground bg-secondary/40 px-4 py-2 border-b border-border">
            <div>Name</div><div>Prefix</div><div>Last used</div><div>Created</div><div></div>
          </div>
          {rows.length === 0 ? (
            <div className="p-12 text-center">
              <KeyRound className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
              <p className="text-sm font-medium">No API keys yet</p>
              <p className="text-xs text-muted-foreground mt-1">Generate a key to start calling the gateway.</p>
            </div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_220px_160px_160px_40px] items-center px-4 py-3 border-b border-border last:border-0 hover:bg-secondary/30">
                <div className="text-sm font-medium">{r.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{r.key_prefix}…</div>
                <div className="text-xs text-muted-foreground">{r.last_used_at ? new Date(r.last_used_at).toLocaleDateString() : "Never"}</div>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</div>
                <button onClick={() => del(r.id)} className="text-muted-foreground hover:text-destructive">
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
