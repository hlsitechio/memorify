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
  Lock, Plus, Trash2, Eye, EyeOff, Copy, Upload, KeyRound, Search, Clock, Unlock, ShieldCheck, Settings as SettingsIcon,
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
  const unlock = sessionStorage.getItem("vault_unlock") || "";
  const r = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vault`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        ...(unlock ? { "x-vault-unlock": unlock } : {}),
      },
      body: JSON.stringify({ action, ...body }),
    },
  );
  const j = await r.json();
  if (!j.ok) {
    if (j.locked) {
      sessionStorage.removeItem("vault_unlock");
      window.dispatchEvent(new Event("vault:locked"));
    }
    throw new Error(j.error || "Vault error");
  }
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

  // Password gate state
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState<boolean>(!!sessionStorage.getItem("vault_unlock"));
  const [unlockPwd, setUnlockPwd] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdNew2, setPwdNew2] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { items } = await vault("list");
      setItems(items);
    } catch (e: any) {
      if (!/locked/i.test(e.message)) toast.error(e.message);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    vault("password_status").then((r) => {
      setHasPassword(!!r.has_password);
      if (!r.has_password) setUnlocked(true);
    }).catch(() => {});
    const onLock = () => setUnlocked(false);
    window.addEventListener("vault:locked", onLock);
    return () => window.removeEventListener("vault:locked", onLock);
  }, [user]);

  useEffect(() => { if (user && unlocked) refresh(); }, [user, unlocked, refresh]);

  const doUnlock = async () => {
    if (!unlockPwd) return;
    setUnlocking(true);
    try {
      const r = await vault("unlock", { password: unlockPwd });
      sessionStorage.setItem("vault_unlock", r.token);
      setUnlocked(true);
      setUnlockPwd("");
      toast.success("Vault unlocked");
    } catch (e: any) { toast.error(e.message); }
    finally { setUnlocking(false); }
  };

  const lock = () => {
    sessionStorage.removeItem("vault_unlock");
    setUnlocked(false);
    setRevealed({});
    toast.success("Vault locked");
  };

  const savePassword = async () => {
    if (pwdNew.length < 8) return toast.error("Password must be at least 8 characters");
    if (pwdNew !== pwdNew2) return toast.error("Passwords do not match");
    setPwdBusy(true);
    try {
      const r = await vault("password_set", {
        new_password: pwdNew,
        current_password: hasPassword ? pwdCurrent : undefined,
      });
      sessionStorage.setItem("vault_unlock", r.token);
      setHasPassword(true);
      setUnlocked(true);
      setPwdOpen(false);
      setPwdCurrent(""); setPwdNew(""); setPwdNew2("");
      toast.success("Vault password updated");
    } catch (e: any) { toast.error(e.message); }
    finally { setPwdBusy(false); }
  };

  const removePassword = async () => {
    if (!pwdCurrent) return toast.error("Current password required");
    if (!confirm("Remove vault password protection?")) return;
    setPwdBusy(true);
    try {
      await vault("password_remove", { current_password: pwdCurrent });
      setHasPassword(false);
      setPwdOpen(false);
      setPwdCurrent(""); setPwdNew(""); setPwdNew2("");
      toast.success("Password removed");
    } catch (e: any) { toast.error(e.message); }
    finally { setPwdBusy(false); }
  };

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

  // Lock screen
  if (hasPassword && !unlocked) {
    return (
      <div className="space-y-6">
        <PageHeader title="Vault" description="Encrypted secrets — locked." />
        <div className="max-w-md mx-auto rounded-lg border border-border bg-card p-8 text-center space-y-4">
          <div className="h-12 w-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-semibold">Vault locked</div>
            <div className="text-sm text-muted-foreground mt-1">Enter your vault password to access secrets.</div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); doUnlock(); }} className="space-y-3 text-left">
            <Input
              type="password"
              autoFocus
              placeholder="Vault password"
              value={unlockPwd}
              onChange={(e) => setUnlockPwd(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={unlocking || !unlockPwd}>
              <Unlock className="h-3.5 w-3.5 mr-1.5" />
              {unlocking ? "Unlocking…" : "Unlock vault"}
            </Button>
          </form>
          <p className="text-[11px] text-muted-foreground">
            Unlock lasts 30 minutes per browser session. Lock anytime from the header.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vault"
        description="Encrypted secrets — API keys, tokens, credentials. AES-GCM at rest, never logged."
        actions={
          <div className="flex items-center gap-2">
            <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  {hasPassword ? <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-primary" /> : <Lock className="h-3.5 w-3.5 mr-1.5" />}
                  {hasPassword ? "Password" : "Set password"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{hasPassword ? "Change vault password" : "Set vault password"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  {hasPassword && (
                    <div>
                      <Label>Current password</Label>
                      <Input type="password" value={pwdCurrent} onChange={(e) => setPwdCurrent(e.target.value)} />
                    </div>
                  )}
                  <div>
                    <Label>New password</Label>
                    <Input type="password" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)} placeholder="At least 8 characters" />
                  </div>
                  <div>
                    <Label>Confirm new password</Label>
                    <Input type="password" value={pwdNew2} onChange={(e) => setPwdNew2(e.target.value)} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The password gates access to your encrypted secrets. If you forget it, an account admin must reset it — there is no recovery.
                  </p>
                </div>
                <DialogFooter className="flex-col sm:flex-row gap-2">
                  {hasPassword && (
                    <Button variant="ghost" className="text-destructive hover:text-destructive sm:mr-auto" disabled={pwdBusy} onClick={removePassword}>
                      Remove password
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setPwdOpen(false)}>Cancel</Button>
                  <Button onClick={savePassword} disabled={pwdBusy}>
                    {hasPassword ? "Update password" : "Set password"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {hasPassword && (
              <Button size="sm" variant="ghost" onClick={lock} title="Lock vault">
                <Lock className="h-3.5 w-3.5 mr-1.5" />Lock
              </Button>
            )}
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
