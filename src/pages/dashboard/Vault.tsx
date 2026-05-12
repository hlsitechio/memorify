import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Lock, Plus, Trash2, Eye, EyeOff, Copy, Upload, KeyRound, Search, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Secret = {
  id: string;
  name: string;
  scope: string;
  description: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

const SCOPES = ["dev", "staging", "prod"] as const;

async function vault(action: string, body: Record<string, any> = {}) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const r = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vault`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ action, ...body }),
    },
  );
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Vault error");
  return j;
}

export default function Vault() {
  const { user } = useAuth();
  const [items, setItems] = useState<Secret[]>([]);
  const [q, setQ] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newScope, setNewScope] = useState<string>("dev");
  const [newDesc, setNewDesc] = useState("");
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const { items } = await vault("list");
      setItems(items);
    } catch (e: any) {
      toast.error(e.message);
    }
  }, []);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  const addSecret = async () => {
    if (!newName.trim() || !newValue) return toast.error("Name and value required");
    try {
      await vault("set", { name: newName.trim(), value: newValue, scope: newScope, description: newDesc || null });
      toast.success("Secret stored");
      setAddOpen(false);
      setNewName(""); setNewValue(""); setNewDesc("");
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const reveal = async (id: string) => {
    if (revealed[id]) {
      setRevealed((r) => { const c = { ...r }; delete c[id]; return c; });
      return;
    }
    try {
      const { value } = await vault("reveal", { id });
      setRevealed((r) => ({ ...r, [id]: value }));
      setTimeout(() => {
        setRevealed((r) => { const c = { ...r }; delete c[id]; return c; });
      }, 30000);
    } catch (e: any) { toast.error(e.message); }
  };

  const copyValue = async (id: string, name: string) => {
    try {
      const v = revealed[id] ?? (await vault("reveal", { id })).value;
      await navigator.clipboard.writeText(v);
      toast.success(`Copied ${name}`);
    } catch (e: any) { toast.error(e.message); }
  };

  const copyRef = async (name: string) => {
    await navigator.clipboard.writeText(`{{vault.${name}}}`);
    toast.success(`Copied {{vault.${name}}}`);
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete secret "${name}"?`)) return;
    try {
      await vault("delete", { id });
      toast.success("Deleted");
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const importEnv = async (text: string) => {
    if (!text.trim()) return;
    setImporting(true);
    try {
      const { imported, total } = await vault("import_env", { text, scope: "dev" });
      toast.success(`Imported ${imported}/${total} secrets`);
      refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setImporting(false); }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const text = await file.text();
    importEnv(text);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    importEnv(text);
    e.target.value = "";
  };

  const filtered = items.filter((s) =>
    !q || s.name.toLowerCase().includes(q.toLowerCase()) || (s.description ?? "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Lock}
        title="Vault"
        description="Encrypted secrets — API keys, tokens, credentials. AES-GCM at rest, never logged."
        actions={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" />New secret</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add secret</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))} placeholder="STRIPE_SECRET_KEY" className="font-mono" />
                </div>
                <div>
                  <Label>Value</Label>
                  <Input type="password" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="sk_live_..." className="font-mono" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Scope</Label>
                    <Select value={newScope} onValueChange={setNewScope}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SCOPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Description (optional)</Label>
                    <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button onClick={addSecret}>Save secret</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Drop zone — ultra-easy import */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`rounded-lg border-2 border-dashed transition-colors cursor-pointer p-6 text-center ${
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-secondary/30"
        }`}
      >
        <Upload className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
        <div className="text-sm font-medium">
          {importing ? "Importing…" : "Drop a .env file here or click to upload"}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          All KEY=VALUE pairs are encrypted and added to the <code className="font-mono">dev</code> scope.
        </div>
        <input ref={fileRef} type="file" accept=".env,.txt,*" className="hidden" onChange={onFile} />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search secrets…" className="pl-9" />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border p-12 text-center">
          <KeyRound className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <div className="font-medium mb-1">No secrets yet</div>
          <div className="text-sm text-muted-foreground">Drop a .env file above or add one manually.</div>
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border bg-card">
          {filtered.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm truncate">{s.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{s.scope}</Badge>
                  {s.description && <span className="text-xs text-muted-foreground truncate">· {s.description}</span>}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                  {revealed[s.id] ? (
                    <span className="font-mono truncate max-w-md text-foreground bg-secondary/40 px-2 py-0.5 rounded">{revealed[s.id]}</span>
                  ) : (
                    <span className="font-mono">••••••••••••</span>
                  )}
                  {s.last_used_at && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />used {formatDistanceToNow(new Date(s.last_used_at), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => reveal(s.id)} title={revealed[s.id] ? "Hide" : "Reveal (auto-hides in 30s)"}>
                  {revealed[s.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copyValue(s.id, s.name)} title="Copy value">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copyRef(s.name)} title="Copy reference {{vault.NAME}}">
                  <span className="text-[10px] font-mono">{`{{ }}`}</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(s.id, s.name)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Reference secrets in skills, connectors, or agent prompts using <code className="font-mono">{`{{vault.NAME}}`}</code>. Values are resolved server-side and never sent to the browser unless you click reveal.
      </p>
    </div>
  );
}
