import { useCallback, useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Sparkles, Trash2, Play, Plug2, Download, Link2, Loader2, Wand2, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Skill = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  prompt: string;
  model: string;
  version: number;
  source?: any;
};

const METHORA_STUDIO_URL = "https://memorify.dev/studio";

const MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "openai/gpt-5-mini",
  "openai/gpt-5",
];

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function Skills() {
  const { user } = useAuth();
  const { action } = useApi();
  const [currentWs] = useCurrentWorkspace();
  const wsId = currentWs?.kind === "agent" && currentWs.agentId ? `agent:${currentWs.agentId}` : null;
  const wsLabel = currentWs?.kind === "agent" ? (currentWs.name || "agent workspace") : "Org workspace";
  const [rows, setRows] = useState<Skill[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [tryOpen, setTryOpen] = useState<Skill | null>(null);
  const [tryInput, setTryInput] = useState("");
  const [tryOutput, setTryOutput] = useState("");
  const [tryBusy, setTryBusy] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", prompt: "", model: MODELS[0], status: "draft" });
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importBusy, setImportBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await action("skills.list", {});
    setRows((data as Skill[]) ?? []);
  }, [user, action]);

  useEffect(() => { load(); }, [load]);

  const runImport = async () => {
    if (!/^https?:\/\//i.test(importUrl.trim())) { toast.error("Paste a valid URL (https://…)"); return; }
    setImportBusy(true);
    try {
      const { data, error } = await action("skills.import_url", { url: importUrl.trim() });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);
      toast.success(`Imported "${data?.name ?? "skill"}"`);
      setImportOpen(false); setImportUrl(""); load();
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setImportBusy(false);
    }
  };

  const upsert = async () => {
    if (!user) return;
    if (!form.name) return toast.error("Name required");
    const slug = slugify(form.name);
    if (editing) {
      const { error } = await action("skills.update", {
        id: editing.id,
        name: form.name,
        description: form.description,
        prompt: form.prompt,
        model: form.model,
        status: form.status,
      });
      if (error) return toast.error(error);
    } else {
      const { error } = await action("skills.create", {
        name: form.name,
        slug,
        description: form.description,
        prompt: form.prompt,
        model: form.model,
        status: form.status,
      });
      if (error) return toast.error(error);
    }
    toast.success("Saved");
    setOpen(false); setEditing(null);
    setForm({ name: "", description: "", prompt: "", model: MODELS[0], status: "draft" });
    load();
  };

  const openEdit = (s: Skill) => {
    setEditing(s);
    setForm({ name: s.name, description: s.description ?? "", prompt: s.prompt, model: s.model, status: s.status });
    setOpen(true);
  };

  const del = async (id: string) => {
    const { error } = await action("skills.delete", { id });
    if (error) return toast.error(error);
    load();
  };

  const runTry = async () => {
    if (!tryOpen) return;
    setTryBusy(true); setTryOutput("");
    try {
      const { data, error } = await action("skills.run", { id: tryOpen.id, input: tryInput });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);
      setTryOutput(data?.output ?? JSON.stringify(data, null, 2));
    } catch (e: any) {
      toast.error(e.message ?? "run failed");
    } finally {
      setTryBusy(false);
    }
  };

  const addAsPlugin = async (s: Skill) => {
    if (!user) return;
    const { error } = await action("plugins.add", {
      name: s.name, kind: "skill", ref_id: s.id, config: { slug: s.slug },
    });
    if (error) return toast.error(error);
    toast.success("Added to plugins");
  };

  return (
    <>
      <PageHeader
        title="Skills"
        description={`Reusable agent capabilities · scoped to ${wsLabel}`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
              onClick={() => {
                const callback = `${window.location.origin}/dashboard/skills`;
                const receiveUrl = `${window.location.origin}/api/skills-receive`;
                const url = `${METHORA_STUDIO_URL}?from=memorify&callback=${encodeURIComponent(callback)}&receive=${encodeURIComponent(receiveUrl)}&workspace=${encodeURIComponent(wsLabel)}`;
                window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              <Wand2 className="h-3.5 w-3.5 mr-1.5" /> Author in Methora Studio
              <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
            </Button>
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline"><Download className="h-3.5 w-3.5 mr-1.5" /> Import from URL</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Import skill from URL</DialogTitle>
                  <DialogDescription>
                    Paste any link to a SKILL.md, GitHub file/folder, doc page, or article.
                    AI will extract the skill and install it into <span className="font-medium text-foreground">{wsLabel}</span>.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Source URL</Label>
                    <div className="relative">
                      <Link2 className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-8"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        placeholder="https://github.com/mattpocock/skills/tree/main/skills/typescript"
                        onKeyDown={(e) => { if (e.key === "Enter" && !importBusy) runImport(); }}
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Examples: <code className="text-foreground/80">https://github.com/mattpocock/skills</code> ·
                    a raw <code className="text-foreground/80">SKILL.md</code> URL ·
                    an Anthropic docs page.
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setImportOpen(false)} disabled={importBusy}>Cancel</Button>
                  <Button onClick={runImport} disabled={importBusy}>
                    {importBusy ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Importing…</> : <><Download className="h-3.5 w-3.5 mr-1.5" /> Import</>}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm({ name: "", description: "", prompt: "", model: MODELS[0], status: "draft" }); } }}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> New skill</Button></DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader><DialogTitle>{editing ? "Edit skill" : "New skill"}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="live">Live</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                  <div className="space-y-1.5">
                    <Label>Model</Label>
                    <Select value={form.model} onValueChange={(v) => setForm({ ...form, model: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>System prompt</Label>
                    <Textarea rows={8} value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} placeholder="You are an expert at…" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={upsert}>{editing ? "Update" : "Create"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />
      <div className="p-6 overflow-y-auto scrollbar-thin h-[calc(100vh-3.5rem)]">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <Sparkles className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
            <p className="text-sm font-medium">No skills yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create your first AI skill — a versioned prompt + model pair.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map((s) => (
              <div key={s.id} className="rounded-lg border border-border bg-card p-4 hover:bg-secondary/20 transition-colors group">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                      {s.name}
                      {s.source?.origin === "methora" && (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 flex items-center gap-0.5">
                          <Wand2 className="h-2.5 w-2.5" /> Methora
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground truncate">{s.slug} · v{s.version}</div>
                  </div>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded",
                    s.status === "live" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground")}>{s.status}</span>
                </div>
                {s.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{s.description}</p>}
                <div className="text-[10px] font-mono text-muted-foreground mt-2 truncate">{s.model}</div>
                <div className="mt-3 flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => { setTryOpen(s); setTryInput(""); setTryOutput(""); }}>
                    <Play className="h-3 w-3 mr-1" /> Try
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => addAsPlugin(s)}><Plug2 className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground hover:text-destructive" onClick={() => del(s.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={!!tryOpen} onOpenChange={(o) => !o && setTryOpen(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto scrollbar-thin">
          <SheetHeader><SheetTitle>Try {tryOpen?.name}</SheetTitle></SheetHeader>
          <div className="space-y-3 mt-4">
            <Label>Input</Label>
            <Textarea rows={5} value={tryInput} onChange={(e) => setTryInput(e.target.value)} placeholder="User input" />
            <Button onClick={runTry} disabled={tryBusy} className="w-full">
              <Play className="h-3.5 w-3.5 mr-1.5" /> {tryBusy ? "Running…" : "Run"}
            </Button>
            {tryOutput && (
              <div className="space-y-1.5">
                <Label>Output</Label>
                <pre className="text-xs bg-secondary/40 rounded p-3 whitespace-pre-wrap font-mono">{tryOutput}</pre>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}