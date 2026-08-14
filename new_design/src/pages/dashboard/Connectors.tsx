import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth as useClerkAuth, useOrganization } from "@clerk/react";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Plug, RefreshCw, ShieldCheck, Trash2, Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Connector = {
  id: string;
  name: string;
  kind: string;
  status: string;
  config?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
};

type ConnectorPreset = {
  kind: string;
  label: string;
  description: string;
  config: Record<string, unknown>;
};

const PRESETS: ConnectorPreset[] = [
  {
    kind: "http",
    label: "HTTP API",
    description: "Generic HTTPS API or webhook with vault-backed secret references.",
    config: { url: "https://api.example.com/endpoint", method: "POST", headers: { Authorization: "Bearer {{vault.API_TOKEN}}" } },
  },
  {
    kind: "github",
    label: "GitHub",
    description: "Repositories, issues, pull requests, and workflow automation.",
    config: { owner: "", repo: "", token: "{{vault.GITHUB_TOKEN}}" },
  },
  {
    kind: "stripe",
    label: "Stripe",
    description: "Billing, customers, invoices, and subscription operations.",
    config: { restricted_key: "{{vault.STRIPE_RESTRICTED_KEY}}", mode: "test" },
  },
  {
    kind: "notion",
    label: "Notion",
    description: "Workspace pages, databases, docs, and knowledge sync.",
    config: { workspace: "", token: "{{vault.NOTION_TOKEN}}" },
  },
  {
    kind: "slack",
    label: "Slack",
    description: "Channels, messages, alerts, and team notifications.",
    config: { webhook_url: "{{vault.SLACK_WEBHOOK_URL}}" },
  },
  {
    kind: "postgres",
    label: "Postgres",
    description: "Private SQL data source with server-side credential handling.",
    config: { dsn: "{{vault.POSTGRES_URL}}", readonly: true },
  },
  {
    kind: "gmail",
    label: "Gmail",
    description: "Mail search and draft/send workflows once OAuth is configured.",
    config: { oauth: true, scopes: ["gmail.readonly"] },
  },
  {
    kind: "agentmail",
    label: "AgentMail",
    description: "Agent-owned inboxes and outbound mail workflows.",
    config: { api_key: "{{vault.AGENTMAIL_API_KEY}}" },
  },
  {
    kind: "custom",
    label: "Custom",
    description: "Any internal system that should become a managed Memorify tool.",
    config: {},
  },
];

const KINDS = PRESETS.map((p) => p.kind);

const statusColor = (s: string) =>
  s === "active" ? "bg-primary/15 text-primary" :
  s === "error" ? "bg-destructive/15 text-destructive" :
  "bg-secondary text-muted-foreground";

const pretty = (value: unknown) => JSON.stringify(value ?? {}, null, 2);

export default function Connectors() {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  const { organization } = useOrganization();
  const workspaceId = organization?.id ?? "";
  const [rows, setRows] = useState<Connector[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ name: "", kind: "http", config: pretty(PRESETS[0].config) });

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
      const data = await runAction<Connector[]>("connectors.list", { limit: 200 });
      setRows(data ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load connectors");
    }
  }, [runAction, user, workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.kind.toLowerCase().includes(q) ||
      c.status.toLowerCase().includes(q)
    );
  }, [query, rows]);

  const applyPreset = (kind: string) => {
    const preset = PRESETS.find((p) => p.kind === kind);
    setForm((current) => ({
      ...current,
      kind,
      name: current.name || preset?.label || "",
      config: pretty(preset?.config ?? {}),
    }));
  };

  const create = async () => {
    if (!user || !form.name) return toast.error("Name required");
    let config: Record<string, unknown> = {};
    try {
      config = form.config.trim() ? JSON.parse(form.config) : {};
    } catch {
      return toast.error("Config must be valid JSON");
    }
    try {
      await runAction("connectors.add", { name: form.name, kind: form.kind, status: "inactive", config });
      toast.success("Connector added");
      setOpen(false);
      setForm({ name: "", kind: "http", config: pretty(PRESETS[0].config) });
      void load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add connector");
    }
  };

  const toggle = async (c: Connector) => {
    setBusy(c.id);
    try {
      await runAction("connectors.toggle", { id: c.id, active: c.status !== "active" });
      void load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update connector");
    } finally {
      setBusy(null);
    }
  };

  const test = async (c: Connector) => {
    setBusy(c.id);
    try {
      const result = await runAction<any>("connectors.test", { id: c.id });
      toast[result?.ok ? "success" : "error"](result?.ok ? "Connector check passed" : "Connector needs config");
    } catch (e: any) {
      toast.error(e?.message ?? "Connector check failed");
    } finally {
      setBusy(null);
    }
  };

  const sync = async (c: Connector) => {
    setBusy(c.id);
    try {
      await runAction("connectors.sync", { id: c.id });
      toast.success("Sync requested");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not request sync");
    } finally {
      setBusy(null);
    }
  };

  const addAsPlugin = async (c: Connector) => {
    setBusy(c.id);
    try {
      await runAction("plugins.add", {
        name: c.name,
        kind: "connector",
        ref_id: c.id,
        config: { connector_id: c.id, kind: c.kind },
        enabled: true,
      });
      toast.success("Added to plugins");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add plugin");
    } finally {
      setBusy(null);
    }
  };

  const del = async (c: Connector) => {
    setBusy(c.id);
    try {
      await runAction("connectors.delete", { id: c.id });
      toast.success("Connector removed");
      void load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not remove connector");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Connectors"
        description="Accounts and data sources that Memorify can promote into tools for agents"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add connector</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Add connector</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Production GitHub" />
                </div>
                <div className="space-y-1.5">
                  <Label>Kind</Label>
                  <Select value={form.kind} onValueChange={applyPreset}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {KINDS.map((k) => <SelectItem key={k} value={k}>{PRESETS.find((p) => p.kind === k)?.label ?? k}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Config JSON</Label>
                  <Textarea
                    value={form.config}
                    onChange={(e) => setForm({ ...form, config: e.target.value })}
                    className="font-mono text-xs min-h-[180px]"
                    spellCheck={false}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Use vault references like <code className="text-foreground">{"{{vault.API_TOKEN}}"}</code>; secret values stay server-side.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={create}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="p-6 overflow-y-auto scrollbar-thin h-[calc(100vh-3.5rem)] space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span>Configs are redacted on read; secrets should live in Vault references.</span>
          </div>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search connectors..."
            className="h-9 sm:max-w-xs"
          />
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <Plug className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
            <p className="text-sm font-medium">No connectors yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add a tool or data source to extend your agents.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <p className="text-sm font-medium">No matching connectors</p>
            <p className="text-xs text-muted-foreground mt-1">Try another name, kind, or status.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((c) => {
              const preset = PRESETS.find((p) => p.kind === c.kind);
              return (
                <div key={c.id} className="rounded-lg border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold truncate">{c.name}</div>
                        <Badge variant="secondary" className="text-[10px] font-mono">{c.kind}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {preset?.description ?? "Custom managed connector."}
                      </div>
                    </div>
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full shrink-0", statusColor(c.status))}>{c.status}</span>
                  </div>

                  <pre className="mt-4 max-h-24 overflow-hidden rounded-md border border-border bg-secondary/30 p-2 text-[10px] font-mono text-muted-foreground">
                    {pretty(c.config)}
                  </pre>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => toggle(c)} disabled={busy === c.id}>
                      {c.status === "active" ? "Disable" : "Enable"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => test(c)} disabled={busy === c.id}>
                      <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Test
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => sync(c)} disabled={busy === c.id}>
                      <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", busy === c.id && "animate-spin")} /> Sync
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => addAsPlugin(c)} disabled={busy === c.id}>
                      <Wrench className="h-3.5 w-3.5 mr-1.5" /> As plugin
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => del(c)} disabled={busy === c.id}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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
