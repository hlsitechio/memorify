import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Puzzle, Trash2, Sparkles, Wrench, Plug, Globe, GripVertical,
  Search, Check, MessageSquare, Github, CreditCard, FileText, Send, Bot,
  Calendar, Mail, Database as DatabaseIcon, Cloud, Bell, Workflow, Image as ImageIcon, Mic,
} from "lucide-react";
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

type LibraryItem = {
  slug: string;
  name: string;
  category: string;
  description: string;
  icon: any;
  tone: string;
  config: { url: string; method: string; headers?: Record<string, string> };
};

const LIBRARY: LibraryItem[] = [
  { slug: "slack",      name: "Slack",           category: "Messaging",   description: "Post messages to channels via webhook.",                icon: MessageSquare, tone: "text-emerald-500", config: { url: "https://hooks.slack.com/services/…",        method: "POST" } },
  { slug: "discord",    name: "Discord",         category: "Messaging",   description: "Send embeds and messages to a Discord channel.",       icon: Bot,           tone: "text-indigo-400",  config: { url: "https://discord.com/api/webhooks/…",        method: "POST" } },
  { slug: "telegram",   name: "Telegram",        category: "Messaging",   description: "Send messages through a Telegram bot.",                icon: Send,          tone: "text-sky-400",     config: { url: "https://api.telegram.org/bot<TOKEN>/sendMessage", method: "POST" } },
  { slug: "github",     name: "GitHub",          category: "Dev",         description: "Open issues, dispatch workflows, comment on PRs.",     icon: Github,        tone: "text-foreground",  config: { url: "https://api.github.com/repos/<owner>/<repo>/issues", method: "POST", headers: { Authorization: "Bearer <TOKEN>" } } },
  { slug: "stripe",     name: "Stripe",          category: "Payments",    description: "Charge customers, query invoices, manage subs.",       icon: CreditCard,    tone: "text-violet-400",  config: { url: "https://api.stripe.com/v1/charges",          method: "POST", headers: { Authorization: "Bearer <SK>" } } },
  { slug: "notion",     name: "Notion",          category: "Docs",        description: "Create pages and append blocks to a database.",        icon: FileText,      tone: "text-foreground",  config: { url: "https://api.notion.com/v1/pages",            method: "POST", headers: { Authorization: "Bearer <TOKEN>", "Notion-Version": "2022-06-28" } } },
  { slug: "openai",     name: "OpenAI",          category: "AI",          description: "Run completions or embeddings on demand.",             icon: Sparkles,      tone: "text-primary",     config: { url: "https://api.openai.com/v1/chat/completions", method: "POST", headers: { Authorization: "Bearer <SK>" } } },
  { slug: "anthropic",  name: "Anthropic",       category: "AI",          description: "Claude model calls via the Messages API.",             icon: Sparkles,      tone: "text-amber-400",   config: { url: "https://api.anthropic.com/v1/messages",      method: "POST", headers: { "x-api-key": "<KEY>", "anthropic-version": "2023-06-01" } } },
  { slug: "resend",     name: "Resend",          category: "Email",       description: "Send transactional emails.",                           icon: Mail,          tone: "text-emerald-400", config: { url: "https://api.resend.com/emails",              method: "POST", headers: { Authorization: "Bearer <KEY>" } } },
  { slug: "gcal",       name: "Google Calendar", category: "Productivity",description: "Create and list calendar events.",                     icon: Calendar,      tone: "text-blue-400",    config: { url: "https://www.googleapis.com/calendar/v3/calendars/primary/events", method: "POST", headers: { Authorization: "Bearer <TOKEN>" } } },
  { slug: "supabase",   name: "Supabase",        category: "Data",        description: "Query a Postgres table via PostgREST.",                icon: DatabaseIcon,  tone: "text-emerald-500", config: { url: "https://<ref>.supabase.co/rest/v1/<table>",  method: "GET",  headers: { apikey: "<KEY>", Authorization: "Bearer <KEY>" } } },
  { slug: "s3",         name: "AWS S3",          category: "Storage",     description: "Upload and read objects via presigned URLs.",          icon: Cloud,         tone: "text-orange-400",  config: { url: "https://<bucket>.s3.amazonaws.com/<key>",    method: "PUT" } },
  { slug: "pagerduty",  name: "PagerDuty",       category: "Ops",         description: "Trigger and resolve incidents.",                       icon: Bell,          tone: "text-red-400",     config: { url: "https://events.pagerduty.com/v2/enqueue",    method: "POST" } },
  { slug: "zapier",     name: "Zapier",          category: "Automation",  description: "Fan out events to any Zap webhook.",                   icon: Workflow,      tone: "text-amber-400",   config: { url: "https://hooks.zapier.com/hooks/catch/…",     method: "POST" } },
  { slug: "n8n",        name: "n8n",             category: "Automation",  description: "Trigger an n8n workflow webhook.",                     icon: Workflow,      tone: "text-rose-400",    config: { url: "https://<host>/webhook/<id>",                method: "POST" } },
  { slug: "elevenlabs", name: "ElevenLabs",      category: "AI",          description: "High-quality text-to-speech.",                         icon: Mic,           tone: "text-fuchsia-400", config: { url: "https://api.elevenlabs.io/v1/text-to-speech/<voice>", method: "POST", headers: { "xi-api-key": "<KEY>" } } },
  { slug: "replicate",  name: "Replicate",       category: "AI",          description: "Run image/video models on demand.",                    icon: ImageIcon,     tone: "text-cyan-400",    config: { url: "https://api.replicate.com/v1/predictions",   method: "POST", headers: { Authorization: "Token <KEY>" } } },
];

const CATEGORIES = ["All", ...Array.from(new Set(LIBRARY.map((l) => l.category)))];

export default function Plugins() {
  const { user } = useAuth();
  const { registerFlash } = useCopilotBus();
  const [rows, setRows] = useState<Plugin[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", method: "POST", headers: "" });
  const [flashing, setFlashing] = useState<string | null>(null);
  const [tab, setTab] = useState("installed");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const dragId = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("plugins").select("*").eq("user_id", user.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false });
    setRows((data as any) ?? []);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`plugins:${user.id}`)
      .on("postgres_changes",
          { event: "*", schema: "public", table: "plugins", filter: `user_id=eq.${user.id}` },
          () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  useEffect(() => {
    const unregs = rows.map((p) =>
      registerFlash(`plugin:${p.id}`, () => {
        setFlashing(p.id);
        window.setTimeout(() => setFlashing((x) => (x === p.id ? null : x)), 1200);
      })
    );
    return () => unregs.forEach((u) => u());
  }, [rows, registerFlash]);

  const installedSlugs = useMemo(
    () => new Set(rows.map((r) => (r.config?.template as string) || "").filter(Boolean)),
    [rows]
  );

  const filteredLibrary = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LIBRARY.filter((l) =>
      (category === "All" || l.category === category) &&
      (!q || l.name.toLowerCase().includes(q) || l.description.toLowerCase().includes(q) || l.category.toLowerCase().includes(q))
    );
  }, [query, category]);

  const installFromLibrary = async (item: LibraryItem) => {
    if (!user) return;
    const { data: last } = await supabase.from("plugins").select("position").eq("user_id", user.id)
      .order("position", { ascending: false }).limit(1);
    const nextPos = ((last?.[0]?.position ?? -1) as number) + 1;
    const { error } = await supabase.from("plugins").insert({
      user_id: user.id, name: item.name, kind: "http",
      config: { ...item.config, template: item.slug },
      position: nextPos,
    });
    if (error) return toast.error(error.message);
    toast.success(`${item.name} added`);
    load();
  };

  const uninstallFromLibrary = async (item: LibraryItem) => {
    if (!user) return;
    const row = rows.find((r) => r.config?.template === item.slug);
    if (!row) return;
    await supabase.from("plugins").delete().eq("id", row.id);
    toast.success(`${item.name} removed`);
    load();
  };

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
        description="Wired tools your agents can call. Browse the library or add a custom HTTP endpoint."
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
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="installed">Installed <Badge variant="secondary" className="ml-2">{rows.length}</Badge></TabsTrigger>
            <TabsTrigger value="library">Library <Badge variant="secondary" className="ml-2">{LIBRARY.length}</Badge></TabsTrigger>
          </TabsList>

          <TabsContent value="installed" className="mt-0">
            {rows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-12 text-center">
                <Puzzle className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
                <p className="text-sm font-medium">No plugins</p>
                <p className="text-xs text-muted-foreground mt-1">Browse the Library tab to add one in a click.</p>
                <Button size="sm" variant="outline" className="mt-4" onClick={() => setTab("library")}>Open library</Button>
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
          </TabsContent>

          <TabsContent value="library" className="mt-0 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search the library…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <Button
                    key={c}
                    size="sm"
                    variant={c === category ? "default" : "outline"}
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            </div>

            {filteredLibrary.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-12 text-center">
                <Search className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
                <p className="text-sm font-medium">Nothing found</p>
                <p className="text-xs text-muted-foreground mt-1">Try a different keyword or category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredLibrary.map((item) => {
                  const Icon = item.icon;
                  const installed = installedSlugs.has(item.slug);
                  return (
                    <div
                      key={item.slug}
                      className={cn(
                        "group relative rounded-lg border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm",
                        installed ? "border-primary/30" : "border-border"
                      )}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className={cn("h-9 w-9 rounded-md bg-secondary/60 flex items-center justify-center", item.tone)}>
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                        {installed && (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Check className="h-3 w-3" /> Installed
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm font-semibold">{item.name}</div>
                      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mt-0.5">{item.category}</div>
                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed line-clamp-2">{item.description}</p>
                      <div className="mt-4">
                        {installed ? (
                          <Button size="sm" variant="outline" className="w-full h-8" onClick={() => uninstallFromLibrary(item)}>
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
                          </Button>
                        ) : (
                          <Button size="sm" className="w-full h-8" onClick={() => installFromLibrary(item)}>
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
