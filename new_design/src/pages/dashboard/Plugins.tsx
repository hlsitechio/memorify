import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth as useClerkAuth, useOrganization } from "@clerk/react";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Puzzle, Trash2, Sparkles, Wrench, Plug, Globe, GripVertical,
  Search, Check, Github, CreditCard, FileText, Cloud, Bell, Workflow,
  Image as ImageIcon, Mic, KeyRound,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
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
  auth: "oauth" | "token" | "public";
  token_label?: string;
  token_hint?: string;
  installed?: boolean;
};

const DEFAULT_LIBRARY: LibraryItem[] = [
  { slug: "github", name: "GitHub", category: "Dev", description: "OAuth access for repositories, issues, pull requests, and workflows.", icon: Github, tone: "text-foreground", auth: "oauth" },
  { slug: "deepwiki", name: "DeepWiki", category: "Docs", description: "Public MCP for asking questions about GitHub repo docs.", icon: FileText, tone: "text-blue-400", auth: "public" },
  { slug: "context7", name: "Context7", category: "Docs", description: "Public MCP for current library docs and code examples.", icon: FileText, tone: "text-emerald-400", auth: "public" },
  { slug: "notion", name: "Notion", category: "Docs", description: "OAuth MCP access to workspace pages and databases.", icon: FileText, tone: "text-foreground", auth: "oauth" },
  { slug: "sentry", name: "Sentry", category: "Ops", description: "OAuth MCP access to issues, errors, traces, and releases.", icon: Bell, tone: "text-red-400", auth: "oauth" },
  { slug: "stripe", name: "Stripe", category: "Payments", description: "Token MCP access to payments, invoices, customers, and subscriptions.", icon: CreditCard, tone: "text-violet-400", auth: "token", token_label: "Stripe restricted key" },
  { slug: "huggingface", name: "Hugging Face", category: "AI", description: "Token MCP access to models, datasets, and Spaces.", icon: Sparkles, tone: "text-amber-400", auth: "token", token_label: "Hugging Face access token" },
  { slug: "elevenlabs", name: "ElevenLabs", category: "AI", description: "Token MCP access to TTS, voice cloning, and dubbing tools.", icon: Mic, tone: "text-fuchsia-400", auth: "token", token_label: "ElevenLabs API key" },
];

const ICONS: Record<string, any> = {
  github: Github,
  "github-mcp": Github,
  stripe: CreditCard,
  notion: FileText,
  deepwiki: FileText,
  context7: FileText,
  "cloudflare-docs": Cloud,
  "cloudflare-workers": Cloud,
  sentry: Bell,
  zapier: Workflow,
  elevenlabs: Mic,
  huggingface: Sparkles,
  canva: ImageIcon,
  cloudinary: ImageIcon,
  paypal: CreditCard,
  square: CreditCard,
  asana: Check,
  box: Cloud,
  vercel: Cloud,
  globalping: Globe,
};

const TONES: Record<string, string> = {
  Dev: "text-blue-400",
  Docs: "text-emerald-400",
  Ops: "text-red-400",
  Payments: "text-violet-400",
  AI: "text-fuchsia-400",
  Automation: "text-amber-400",
  Storage: "text-sky-400",
  Media: "text-cyan-400",
};

export default function Plugins() {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  const { organization } = useOrganization();
  const { registerFlash } = useCopilotBus();
  const workspaceId = organization?.id ?? "";
  const [rows, setRows] = useState<Plugin[]>([]);
  const [library, setLibrary] = useState<LibraryItem[]>(DEFAULT_LIBRARY);
  const [flashing, setFlashing] = useState<string | null>(null);
  const [tab, setTab] = useState("installed");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [tokenApp, setTokenApp] = useState<LibraryItem | null>(null);
  const [tokenValue, setTokenValue] = useState("");
  const dragId = useRef<string | null>(null);

  const apiError = (data: any, fallback: string) =>
    data?.detail || data?.error || data?.data?.detail || data?.data?.error || fallback;

  const runAction = useCallback(async <T,>(name: string, args: Record<string, unknown> = {}): Promise<T> => {
    if (!workspaceId) throw new Error("Select or create a workspace first");
    const token = await getToken();
    if (!token) throw new Error("No Clerk session token");
    const res = await fetch("/api/copilot/action", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Workspace-Id": workspaceId,
      },
      body: JSON.stringify({ name, args, workspace_id: workspaceId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.ok === false) throw new Error(apiError(body, `HTTP ${res.status}`));
    return (body?.data ?? body) as T;
  }, [getToken, workspaceId]);

  const load = useCallback(async () => {
    if (!user || !workspaceId) {
      setRows([]);
      return;
    }
    try {
      const [plugins, apps] = await Promise.all([
        runAction<Plugin[]>("plugins.list", { limit: 200 }),
        runAction<Array<Omit<LibraryItem, "icon" | "tone">>>("apps.list", { limit: 200 }),
      ]);
      setRows(plugins ?? []);
      if (apps?.length) {
        setLibrary(apps.map((app) => ({
          ...app,
          icon: ICONS[app.slug] ?? Globe,
          tone: TONES[app.category] ?? "text-muted-foreground",
        })));
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load plugins");
    }
  }, [runAction, user, workspaceId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("github");
    if (!status) return;
    if (status === "connected") {
      toast.success("GitHub connected");
      void load();
    } else if (status === "error") {
      toast.error(params.get("detail") || "GitHub OAuth failed");
    }
    params.delete("github");
    params.delete("detail");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
  }, [load]);

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

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(library.map((l) => l.category)))],
    [library]
  );

  const filteredLibrary = useMemo(() => {
    const q = query.trim().toLowerCase();
    return library.filter((l) =>
      (category === "All" || l.category === category) &&
      (!q || l.name.toLowerCase().includes(q) || l.description.toLowerCase().includes(q) || l.category.toLowerCase().includes(q))
    );
  }, [library, query, category]);

  const handleConnectResult = (item: LibraryItem, data: any) => {
    if (data?.authorize_url) {
      window.location.href = data.authorize_url;
      return;
    }
    if (data?.mode === "token_required") {
      setTokenApp({ ...item, token_label: data.token_label, token_hint: data.token_hint });
      setTokenValue("");
      return;
    }
    if (data?.sync_error) {
      toast.error(`${item.name} connected, but tool sync failed: ${data.sync_error}`);
    } else {
      const tools = Number(data?.tools ?? 0);
      toast.success(tools ? `${item.name} connected with ${tools} tools` : `${item.name} connected`);
    }
    void load();
  };

  const connectLibraryApp = async (item: LibraryItem, token = "") => {
    if (!user) return;
    setConnecting(item.slug);
    try {
      const data = await runAction<any>("apps.connect", { slug: item.slug, ...(token ? { token } : {}) });
      handleConnectResult(item, data);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not connect app");
    } finally {
      setConnecting(null);
    }
  };

  const submitTokenConnect = async () => {
    if (!tokenApp) return;
    if (!tokenValue.trim()) return toast.error("Token required");
    await connectLibraryApp(tokenApp, tokenValue);
    setTokenApp(null);
    setTokenValue("");
  };

  const uninstallFromLibrary = async (item: LibraryItem) => {
    if (!user) return;
    const row = rows.find((r) => r.config?.template === item.slug);
    if (!row) return;
    try {
      await runAction("plugins.delete", { id: row.id });
      toast.success(`${item.name} removed`);
      void load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not remove plugin");
    }
  };

  const toggle = async (p: Plugin) => {
    try {
      await runAction("plugins.toggle", { id: p.id, enabled: !p.enabled });
      void load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update plugin");
    }
  };
  const del = async (id: string) => {
    try {
      await runAction("plugins.delete", { id });
      void load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not delete plugin");
    }
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
    try {
      await runAction("plugins.reorder", { ids });
      void load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not reorder plugins");
    }
  };

  return (
    <>
      <PageHeader
        title="Plugins"
        description="Connect apps once. Memorify handles OAuth, tokens, MCP discovery, and the plugin record for your agents."
      />
      <div className="p-6 overflow-y-auto scrollbar-thin h-[calc(100vh-3.5rem)]">
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="installed">Installed <Badge variant="secondary" className="ml-2">{rows.length}</Badge></TabsTrigger>
            <TabsTrigger value="library">Library <Badge variant="secondary" className="ml-2">{library.length}</Badge></TabsTrigger>
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
                {categories.map((c) => (
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
                            <Check className="h-3 w-3" /> Connected
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
                          <Button size="sm" className="w-full h-8" onClick={() => connectLibraryApp(item)} disabled={connecting === item.slug}>
                            {item.auth === "token" ? <KeyRound className="h-3.5 w-3.5 mr-1.5" /> : <Plug className="h-3.5 w-3.5 mr-1.5" />}
                            {connecting === item.slug ? "Connecting" : "Connect"}
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

      <Dialog open={!!tokenApp} onOpenChange={(next) => {
        if (!next) {
          setTokenApp(null);
          setTokenValue("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {tokenApp?.name}</DialogTitle>
            <DialogDescription>
              {tokenApp?.token_hint || "Paste a least-privilege token. Memorify stores it encrypted and only exposes synced tools to agents."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitTokenConnect();
            }}
          >
            <div className="space-y-2">
              <Label>{tokenApp?.token_label || "Access token"}</Label>
              <Input
                type="password"
                autoComplete="off"
                value={tokenValue}
                onChange={(e) => setTokenValue(e.target.value)}
                placeholder="Paste token"
                className="font-mono text-xs"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setTokenApp(null)}>Cancel</Button>
              <Button type="submit" disabled={!tokenValue.trim() || connecting === tokenApp?.slug}>
                <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                {connecting === tokenApp?.slug ? "Connecting" : "Connect"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
