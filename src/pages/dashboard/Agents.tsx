import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { workspaceIdForAgent } from "@/hooks/useCurrentWorkspace";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Terminal, Copy, Check, Plus, Trash2, Zap, Wifi, RefreshCw, ExternalLink, Sparkles, ShieldCheck, Activity, AlertTriangle, MoreVertical, Pause, Play, KeyRound, Pencil, X, Eye, EyeOff, Clock } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Agent = {
  id: string;
  name: string;
  kind: string;
  status: "pending" | "connected" | "disconnected" | string;
  token: string;
  last_seen_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  token_expires_at: string | null;
  token_rotated_at: string | null;
};

type InstallInfo =
  | {
      type: "cli";
      docs: string;
      mac?: string;
      linux?: string;
      windows?: string;
      note?: string;
    }
  | {
      type: "app";
      docs: string;
      downloadUrl: string;
      downloadLabel?: string;
      note?: string;
    };

const CATALOG: Array<{
  kind: string;
  name: string;
  tagline: string;
  description: string;
  icon: any;
  logo?: string;
  tone: string;
  featured: boolean;
  install?: InstallInfo;
}> = [
  {
    kind: "claude_code",
    name: "Claude Code",
    tagline: "Anthropic's terminal coding agent",
    description: "Connect Claude Code to this workspace as an MCP server — no ngrok, no local tunnel. Paste one command.",
    icon: Terminal,
    logo: "/logos/claude-ai-icon.svg",
    tone: "text-amber-400",
    featured: true,
    install: {
      type: "cli",
      docs: "https://code.claude.com/docs/en/overview",
      mac: "curl -fsSL https://claude.ai/install.sh | bash",
      linux: "curl -fsSL https://claude.ai/install.sh | bash",
      windows: "irm https://claude.ai/install.ps1 | iex",
      note: "Or via npm (any OS): npm install -g @anthropic-ai/claude-code",
    },
  },
  {
    kind: "github_copilot",
    name: "GitHub Copilot",
    tagline: "Copilot CLI / agent mode",
    description: "Connect GitHub Copilot (CLI or agent mode) to this workspace. Uses the same hosted MCP endpoint + token — no tunnel needed.",
    icon: Bot,
    logo: "/logos/copilot_dark.svg",
    tone: "text-violet-400",
    featured: true,
    install: {
      type: "cli",
      docs: "https://docs.github.com/en/copilot/how-tos/use-copilot-in-the-cli",
      mac: "brew install gh && gh extension install github/gh-copilot",
      linux: "sudo apt install gh -y && gh extension install github/gh-copilot",
      windows: "winget install --id GitHub.cli && gh extension install github/gh-copilot",
      note: "Requires GitHub CLI (gh). Then run: gh auth login",
    },
  },
  {
    kind: "openai_codex",
    name: "OpenAI Codex CLI",
    tagline: "Terminal coding agent",
    description: "OpenAI's terminal coding agent. MCP-native via ~/.codex/config.toml.",
    icon: Sparkles,
    logo: "/logos/codex.svg",
    tone: "text-emerald-400",
    featured: false,
    install: {
      type: "cli",
      docs: "https://github.com/openai/codex",
      mac: "brew install codex",
      linux: "npm install -g @openai/codex",
      windows: "npm install -g @openai/codex",
      note: "Then run: codex login",
    },
  },
  {
    kind: "microsoft_copilot",
    name: "Microsoft Copilot",
    tagline: "Coming soon",
    description: "Microsoft 365 Copilot — assistant for Word, Excel, Teams.",
    icon: Bot,
    logo: "/logos/microsoft-copilot.svg",
    tone: "text-cyan-400",
    featured: false,
    install: {
      type: "app",
      docs: "https://www.microsoft.com/en-us/microsoft-copilot",
      downloadUrl: "https://copilot.microsoft.com/",
      downloadLabel: "Open Copilot",
      note: "Desktop app available on Windows 11 and via the Microsoft 365 mobile apps.",
    },
  },
  {
    kind: "cursor",
    name: "Cursor",
    tagline: "Coming soon",
    description: "Cursor MCP integration.",
    icon: Bot,
    logo: "/logos/cursor_dark.svg",
    tone: "text-sky-400",
    featured: false,
    install: {
      type: "app",
      docs: "https://docs.cursor.com/",
      downloadUrl: "https://cursor.com/download",
      downloadLabel: "Download Cursor",
      note: "Native apps for macOS, Windows and Linux.",
    },
  },
  {
    kind: "hermes",
    name: "Hermes Agents",
    tagline: "Coming soon",
    description: "Open-source autonomous agent framework. MCP-native.",
    icon: Sparkles,
    logo: "/logos/hermes.png",
    tone: "text-yellow-400",
    featured: false,
    install: {
      type: "cli",
      docs: "https://github.com/Mervyn-Vala/Hermes",
      mac: "pip install hermes-agents",
      linux: "pip install hermes-agents",
      windows: "pip install hermes-agents",
      note: "Python 3.10+ required.",
    },
  },
  {
    kind: "manus",
    name: "Manus AI",
    tagline: "Coming soon",
    description: "General-purpose autonomous AI agent by Manus.",
    icon: Sparkles,
    logo: "/logos/manus.svg",
    tone: "text-zinc-200",
    featured: false,
    install: {
      type: "app",
      docs: "https://manus.im/",
      downloadUrl: "https://manus.im/",
      downloadLabel: "Open Manus",
      note: "Hosted SaaS — sign up at manus.im.",
    },
  },
  {
    kind: "opencode",
    name: "OpenCode",
    tagline: "Coming soon",
    description: "Open-source terminal coding agent (opencode.ai).",
    icon: Terminal,
    logo: "/logos/opencode-dark.svg",
    tone: "text-orange-400",
    featured: false,
    install: {
      type: "cli",
      docs: "https://opencode.ai/docs",
      mac: "brew install sst/tap/opencode",
      linux: "curl -fsSL https://opencode.ai/install | bash",
      windows: "npm install -g opencode-ai",
      note: "Configure MCP servers in ~/.config/opencode/opencode.json",
    },
  },
  {
    kind: "pi_dev",
    name: "Pi",
    tagline: "Coming soon",
    description: "Minimal terminal coding harness (pi.dev) — extensions, skills, MCP-friendly.",
    icon: Terminal,
    logo: "/logos/pi-dev.png",
    tone: "text-pink-400",
    featured: false,
    install: {
      type: "cli",
      docs: "https://pi.dev/",
      mac: "npm install -g @earendil/pi",
      linux: "npm install -g @earendil/pi",
      windows: "npm install -g @earendil/pi",
      note: "Source: github.com/earendil-works/pi",
    },
  },
  {
    kind: "custom",
    name: "Custom agent",
    tagline: "Bring your own",
    description: "Any MCP-capable agent via the hosted URL + token.",
    icon: Zap,
    tone: "text-primary",
    featured: false,
  },
];

function endpointUrl() {
  // Public hosted ping endpoint — replaces the need for ngrok / local tunnels.
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-ping`;
}

function CopyField({
  value,
  label,
  mono = true,
  multiline = false,
  secret = false,
}: {
  value: string;
  label?: string;
  mono?: boolean;
  multiline?: boolean;
  /** If true, content is blurred until the user clicks the eye. Copy still works while hidden. */
  secret?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hidden = secret && !revealed;
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(`${label ?? "Copied"} to clipboard`);
    setTimeout(() => setCopied(false), 1400);
  };
  if (multiline) {
    return (
      <div className="relative rounded-md border border-border bg-secondary/40 overflow-hidden min-w-0 w-full">
        <pre
          className={cn(
            "max-h-72 overflow-auto px-3 py-2 pr-20 text-[11px] leading-relaxed whitespace-pre-wrap break-words transition select-none",
            mono && "font-mono",
            hidden && "blur-sm pointer-events-none"
          )}
        >
          {value}
        </pre>
        {hidden && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/30 backdrop-blur-[2px] text-[11px] text-muted-foreground">
            <span className="rounded-full border border-border bg-background/80 px-3 py-1">Click eye to reveal — copy still works</span>
          </div>
        )}
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
          {secret && (
            <button
              onClick={() => setRevealed(v => !v)}
              className="rounded-md border border-border bg-background/80 backdrop-blur px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title={revealed ? "Hide" : "Reveal"}
            >
              {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          )}
          <button
            onClick={copy}
            className="rounded-md border border-border bg-background/80 backdrop-blur px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Copy"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    );
  }
  const display = hidden ? "•".repeat(Math.min(Math.max(value.length, 12), 48)) : value;
  return (
    <div className="flex items-stretch rounded-md border border-border bg-secondary/40 overflow-hidden group min-w-0 w-full">
      <code
        className={cn(
          "flex-1 min-w-0 px-3 py-2 text-xs truncate select-none",
          mono && "font-mono",
          hidden && "tracking-widest text-muted-foreground"
        )}
        title={hidden ? "Hidden — click eye to reveal" : value}
      >
        {display}
      </code>
      {secret && (
        <button
          onClick={() => setRevealed(v => !v)}
          className="px-3 shrink-0 border-l border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title={revealed ? "Hide" : "Reveal"}
        >
          {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      )}
      <button
        onClick={copy}
        className="px-3 shrink-0 border-l border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        title="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}


export default function Agents() {
  return (
    <>
      <PageHeader
        title="Agents"
        description="Connect AI agents to this workspace. No ngrok, no local tunnel — just a hosted URL and a token."
      />
      <div className="p-6 overflow-y-auto scrollbar-thin h-[calc(100vh-3.5rem)]">
        <AgentsManager />
      </div>
    </>
  );
}

export function AgentsManager({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardId, setWizardId] = useState<string | null>(null);
  const [rotateId, setRotateId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("agents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setAgents((data as Agent[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Deep-link: ?open=<agent_id> auto-opens that agent's workspace wizard.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("open");
    if (id && agents.some((a) => a.id === id)) setWizardId(id);
  }, [agents]);

  // Realtime — flips status to "connected" the moment the agent pings.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`agents:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agents", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  const connect = async (kind: string, name: string) => {
    if (!user) return;
    if (kind !== "claude_code" && kind !== "custom" && kind !== "github_copilot" && kind !== "openai_codex") {
      toast.info(`${name} support is coming soon.`);
      return;
    }
    const { data, error } = await supabase
      .from("agents")
      .insert({ user_id: user.id, kind, name, status: "pending" })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setWizardId((data as Agent).id);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("agents").delete().eq("id", id);
    if (wizardId === id) setWizardId(null);
    toast.success("Agent removed");
    load();
  };

  const pauseToggle = async (a: Agent) => {
    const next = a.status === "paused" ? "connected" : "paused";
    await supabase.from("agents").update({ status: next }).eq("id", a.id);
    toast.success(next === "paused" ? "Agent paused — API calls blocked" : "Agent resumed");
    load();
  };

  const resync = async (a: Agent) => {
    // Clear onboarded flag so next GET /agent-api re-sends the full welcome + command catalog.
    const meta = { ...(a.metadata || {}) } as Record<string, unknown>;
    delete meta.onboarded;
    delete meta.onboarded_at;
    await supabase.from("agents").update({ metadata: meta as any }).eq("id", a.id);
    toast.success("Resync queued — agent will receive the new command list on its next call");
    load();
  };

  const revokeToken = async (a: Agent) => {
    // Rotate the bearer token; old token immediately stops working.
    const newToken = crypto.getRandomValues(new Uint8Array(24));
    const hex = Array.from(newToken).map(b => b.toString(16).padStart(2, "0")).join("");
    await supabase.from("agents").update({ token: hex, status: "pending", last_seen_at: null }).eq("id", a.id);
    toast.success("Token rotated — old token revoked. Open Setup to copy the new one.");
    setWizardId(a.id);
    load();
  };

  const rename = async (a: Agent, name: string) => {
    await supabase.from("agents").update({ name }).eq("id", a.id);
    toast.success("Agent renamed");
    load();
  };

  const renameWorkspace = async (a: Agent, workspaceName: string) => {
    const meta = { ...(a.metadata || {}), workspace_name: workspaceName } as Record<string, unknown>;
    await supabase.from("agents").update({ metadata: meta as any }).eq("id", a.id);
    toast.success("Workspace renamed");
    load();
  };

  const setShortName = async (a: Agent, shortName: string) => {
    const meta = { ...(a.metadata || {}), short_name: shortName.slice(0, 3) } as Record<string, unknown>;
    await supabase.from("agents").update({ metadata: meta as any }).eq("id", a.id);
    toast.success("Short name updated");
    load();
  };


  const wizardAgent = useMemo(
    () => agents.find((a) => a.id === wizardId) ?? null,
    [agents, wizardId],
  );

  return (
    <>
      {!embedded && (
        <div className="flex justify-end mb-3">
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
      )}
      <Tabs defaultValue={agents.length ? "connected" : "library"} className="space-y-6">
        <TabsList>
          <TabsTrigger value="connected">
            Connected <Badge variant="secondary" className="ml-2">{agents.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Activity className="h-3.5 w-3.5 mr-1.5" /> Activity
          </TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
        </TabsList>

        <TabsContent value="connected" className="mt-0 space-y-3">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : agents.length === 0 ? (
            <EmptyHero onConnect={() => connect("claude_code", "Claude Code")} />
          ) : (
            agents.map((a) => <AgentRow key={a.id} agent={a} onOpen={() => setWizardId(a.id)} onDelete={() => remove(a.id)} onPauseToggle={() => pauseToggle(a)} onResync={() => resync(a)} onRevoke={() => revokeToken(a)} onRename={(n) => rename(a, n)} onRenameWorkspace={(n) => renameWorkspace(a, n)} onSetShortName={(n) => setShortName(a, n)} />)
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-0">
          <ActivityFeed userId={user?.id} agents={agents} />
        </TabsContent>

        <TabsContent value="library" className="mt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CATALOG.map((c) => {
              const Icon = c.icon;
              const available = c.kind === "claude_code" || c.kind === "custom" || c.kind === "github_copilot" || c.kind === "openai_codex";
              return (
                <div key={c.kind} className={cn(
                  "relative rounded-lg border bg-card p-4 transition-all hover:border-primary/40",
                  c.featured ? "border-primary/40 shadow-sm" : "border-border"
                )}>
                  {c.featured && (
                    <Badge className="absolute top-3 right-3 text-[10px]" variant="default">Featured</Badge>
                  )}
                  <div className={cn("h-10 w-10 rounded-md bg-secondary/60 flex items-center justify-center mb-3 overflow-hidden", c.tone)}>
                    {c.logo ? (
                      <img src={c.logo} alt={`${c.name} logo`} className="h-6 w-6 object-fill" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <div className="text-sm font-semibold">{c.name}</div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">{c.tagline}</div>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{c.description}</p>
                  <div className="mt-4 flex items-center gap-2">
                    <Button
                      size="sm"
                      className="flex-1 h-8"
                      variant={available ? "default" : "outline"}
                      disabled={!available}
                      onClick={() => connect(c.kind, c.name)}
                    >
                      {available ? <><Plus className="h-3.5 w-3.5 mr-1.5" /> Connect</> : "Coming soon"}
                    </Button>
                    {c.install && <InstallButton agent={c} />}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <ConnectWizard
        agent={wizardAgent}
        onClose={() => setWizardId(null)}
      />
    </>
  );
}

function InstallButton({ agent }: { agent: { name: string; logo?: string; tone: string; icon: any; install?: InstallInfo } }) {
  const [open, setOpen] = useState(false);
  const info = agent.install!;
  const Icon = agent.icon;
  const osTabs =
    info.type === "cli"
      ? ([
          { id: "mac", label: "macOS", cmd: info.mac },
          { id: "linux", label: "Linux", cmd: info.linux },
          { id: "windows", label: "Windows", cmd: info.windows },
        ].filter((t) => !!t.cmd) as { id: string; label: string; cmd: string }[])
      : [];
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-2.5"
        onClick={() => setOpen(true)}
        title="Install instructions"
      >
        <Terminal className="h-3.5 w-3.5 mr-1.5" /> Install
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md overflow-hidden [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className={cn("h-7 w-7 rounded-md bg-secondary/60 flex items-center justify-center overflow-hidden", agent.tone)}>
                {agent.logo ? (
                  <img src={agent.logo} alt="" className="h-5 w-5 object-contain" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </span>
              Install {agent.name}
            </DialogTitle>
            <DialogDescription>
              Pick your OS, copy the command, then come back and click <span className="text-foreground font-medium">Connect</span>.
            </DialogDescription>
          </DialogHeader>

          {info.type === "cli" ? (
            <div className="space-y-3">
              <Tabs defaultValue={osTabs[0]?.id ?? "mac"} className="w-full">
                <TabsList className="grid grid-cols-3 w-full">
                  {osTabs.map((t) => (
                    <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
                  ))}
                </TabsList>
                {osTabs.map((t) => (
                  <TabsContent key={t.id} value={t.id} className="mt-3">
                    <CopyField value={t.cmd} label={`${agent.name} ${t.label} install`} multiline />
                  </TabsContent>
                ))}
              </Tabs>
              {info.note && (
                <p className="text-[11px] text-muted-foreground leading-relaxed">{info.note}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <Button asChild className="w-full">
                <a href={info.downloadUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  {info.downloadLabel ?? `Open ${agent.name}`}
                </a>
              </Button>
              {info.note && (
                <p className="text-[11px] text-muted-foreground leading-relaxed">{info.note}</p>
              )}
            </div>
          )}

          <div className="pt-2 border-t border-border">
            <a
              href={info.docs}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Official docs
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EmptyHero({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-gradient-to-b from-card to-card/30 p-10 text-center">
      <div className="mx-auto h-12 w-12 rounded-lg bg-gradient-primary flex items-center justify-center mb-4">
        <Terminal className="h-6 w-6 text-primary-foreground" />
      </div>
      <h2 className="text-lg font-semibold">Bring your first AI agent online</h2>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
        Connect Claude Code in one click. We give you a public HTTPS endpoint and a token — no ngrok, no tunnels, no port forwarding.
      </p>
      <div className="flex items-center justify-center gap-3 mt-5">
        <Button onClick={onConnect}>
          <Terminal className="h-4 w-4 mr-1.5" /> Connect Claude Code
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8 max-w-2xl mx-auto text-left">
        <Feature icon={Zap}        title="Zero setup"      body="No ngrok, no local tunnel. The endpoint is already hosted." />
        <Feature icon={ShieldCheck} title="Token-scoped"    body="Each agent gets its own revocable token. Delete to disconnect." />
        <Feature icon={Wifi}       title="Live status"     body="Status flips to Connected the instant your agent calls in." />
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <Icon className="h-4 w-4 text-primary mb-1.5" />
      <div className="text-xs font-semibold">{title}</div>
      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{body}</p>
    </div>
  );
}

function EditableLabel({
  value,
  onSave,
  className,
  inputClassName,
  placeholder,
  title,
}: {
  value: string;
  onSave: (next: string) => Promise<void> | void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  title?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(value); }, [value]);
  const commit = async () => {
    const next = draft.trim();
    if (!next || next === value) { setEditing(false); setDraft(value); return; }
    setBusy(true);
    try { await onSave(next); } finally { setBusy(false); setEditing(false); }
  };
  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setEditing(false); setDraft(value); }
          }}
          onBlur={commit}
          placeholder={placeholder}
          className={cn("bg-background border border-primary/40 rounded px-1.5 py-0.5 outline-none focus:border-primary", inputClassName)}
        />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors group/edit", className)}
      title={title || "Click to rename"}
    >
      <span>{value || placeholder}</span>
      <Pencil className="h-3 w-3 opacity-0 group-hover/edit:opacity-60 transition-opacity" />
    </button>
  );
}

function AgentRow({ agent, onOpen, onDelete, onPauseToggle, onResync, onRevoke, onRename, onRenameWorkspace, onSetShortName }: {
  agent: Agent;
  onOpen: () => void;
  onDelete: () => void;
  onPauseToggle: () => void;
  onResync: () => void;
  onRevoke: () => void;
  onRename: (name: string) => Promise<void>;
  onRenameWorkspace: (name: string) => Promise<void>;
  onSetShortName: (name: string) => Promise<void>;
}) {
  const connected = agent.status === "connected";
  const paused = agent.status === "paused";
  const last = agent.last_seen_at ? new Date(agent.last_seen_at).toLocaleString() : "Never";
  const statusLabel = paused ? "Paused" : connected ? "Connected" : "Pending";
  const statusDot = paused ? "bg-amber-400" : connected ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground";
  const statusBadgeClass = paused
    ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/20"
    : connected
      ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20"
      : "";
  const workspaceName = ((agent.metadata as any)?.workspace_name as string) || "";
  const shortName = ((agent.metadata as any)?.short_name as string) || "";
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-4 group hover:border-primary/30 transition-colors">
      <div className={cn(
        "h-10 w-10 rounded-md flex items-center justify-center shrink-0 relative",
        paused ? "bg-amber-500/15 text-amber-400" : connected ? "bg-emerald-500/15 text-emerald-400" : "bg-secondary text-muted-foreground"
      )}>
        {shortName ? (
          <span className="text-sm font-semibold tracking-tight">{shortName}</span>
        ) : (
          <Terminal className="h-5 w-5" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <EditableLabel
            value={agent.name}
            onSave={onRename}
            className="text-sm font-semibold truncate"
            inputClassName="text-sm font-semibold"
            placeholder="Agent name"
          />
          <Badge variant={connected || paused ? "default" : "secondary"} className={cn("text-[10px] gap-1", statusBadgeClass)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", statusDot)} />
            {statusLabel}
          </Badge>
        </div>
        <div className="text-[11px] font-mono text-muted-foreground mt-0.5 truncate">
          {agent.kind} · last seen {last}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(agent.id); toast.success("Agent ID copied"); }}
            className="inline-flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
            title="Click to copy full ID"
          >
            <span className="opacity-60">ID</span>
            <code className="px-1.5 py-0.5 rounded bg-secondary/60 border border-border">{agent.id.slice(0, 8)}…</code>
            <Copy className="h-3 w-3 opacity-50" />
          </button>
          <WorkspaceStats
            agentId={agent.id}
            workspaceName={workspaceName}
            onRenameWorkspace={onRenameWorkspace}
          />
          <EditableLabel
            value={shortName}
            onSave={onSetShortName}
            className={cn(
              "px-1.5 py-0.5 rounded border text-[10px] font-mono",
              shortName
                ? "bg-primary/10 border-primary/30 text-primary"
                : "border-dashed border-border text-muted-foreground italic"
            )}
            inputClassName="text-[10px] w-14"
            placeholder="+ short"
            title="Short name (1–3 chars) — used as the logo/avatar placeholder"
          />
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onOpen}>
        <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Setup
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="px-2">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={onPauseToggle}>
            {paused ? <><Play className="h-3.5 w-3.5 mr-2" /> Resume agent</> : <><Pause className="h-3.5 w-3.5 mr-2" /> Pause agent</>}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onResync}>
            <RefreshCw className="h-3.5 w-3.5 mr-2" /> Resync commands
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onRevoke} className="text-amber-300 focus:text-amber-200">
            <KeyRound className="h-3.5 w-3.5 mr-2" /> Rotate token
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete agent
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function WorkspaceStats({ agentId, workspaceName, onRenameWorkspace }: {
  agentId: string;
  workspaceName: string;
  onRenameWorkspace: (name: string) => Promise<void>;
}) {
  const [stats, setStats] = useState<{ memories: number; events: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ count: memories }, { data: eventRows }] = await Promise.all([
        supabase.from("memories").select("id", { count: "exact", head: true }).eq("namespace", `agent:${agentId}`),
        supabase.from("events").select("id, payload").eq("payload->>agent_id", agentId),
      ]);
      if (!cancelled) setStats({ memories: memories ?? 0, events: eventRows?.length ?? 0 });
    })();
    return () => { cancelled = true; };
  }, [agentId]);
  const workspaceId = workspaceIdForAgent(agentId);
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono">
      <button
        type="button"
        onClick={() => { navigator.clipboard.writeText(workspaceId); toast.success("Workspace ID copied"); }}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors"
        title="Click to copy workspace ID"
      >
        <span className="opacity-70">ws</span>
        <code>{workspaceId}</code>
        <Copy className="h-3 w-3 opacity-60" />
      </button>
      <EditableLabel
        value={workspaceName}
        onSave={onRenameWorkspace}
        className={cn(
          "px-1.5 py-0.5 rounded border text-[10px]",
          workspaceName
            ? "bg-secondary/60 border-border text-foreground"
            : "border-dashed border-border text-muted-foreground italic"
        )}
        inputClassName="text-[10px]"
        placeholder="+ name (optional)"
        title="Optional friendly name for this workspace"
      />
      {stats && (
        <span className="px-1.5 py-0.5 rounded bg-secondary/60 border border-border text-muted-foreground">
          {stats.memories}m · {stats.events}e
        </span>
      )}
    </span>
  );
}

function ConnectWizard({ agent, onClose }: { agent: Agent | null; onClose: () => void }) {
  const open = !!agent;
  const mcpHttpUrl = "https://mcp.memorify.dev";
  const apiUrl = mcpHttpUrl; // public, white-labelled MCP endpoint
  const token = agent?.token ?? "";

  const curlWhoami =
    `curl -s -X POST ${mcpHttpUrl} \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -H "Accept: application/json, text/event-stream" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"whoami","arguments":{}}}'`;
  const curlRemember =
    `curl -s -X POST ${mcpHttpUrl} \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -H "Accept: application/json, text/event-stream" \\\n  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"memory_remember","arguments":{"content":"User prefers dark mode","tags":["preference"]}}}'`;
  const curlRecall =
    `curl -s -X POST ${mcpHttpUrl} \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -H "Accept: application/json, text/event-stream" \\\n  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"memory_recall","arguments":{"query":"dark"}}}'`;
  const mcpCmd = `claude mcp add memorify --transport http ${mcpHttpUrl} --header "Authorization: Bearer ${token}"`;
  const isCodex = agent?.kind === "openai_codex";
  const codexToml = `[mcp_servers.memorify]
url = "${mcpHttpUrl}"
bearer_token = "${token}"`;
  const codexExport = `export MEMORIFY_TOKEN="${token}"`;
  const codexTomlEnv = `[mcp_servers.memorify]
url = "${mcpHttpUrl}"
bearer_token_env_var = "MEMORIFY_TOKEN"`;

  const agentId = agent?.id ?? "";
  const workspaceId = agentId ? workspaceIdForAgent(agentId) : "";
  const workspaceName = ((agent?.metadata as any)?.workspace_name as string) || "";

  const reconnectPrompt = `You are ${agent?.name ?? "this agent"} — a Memorify agent.

## Your identity
- Agent ID:    ${agentId}
- Workspace:   ${workspaceId}${workspaceName ? `  ("${workspaceName}")` : ""}
- MCP server:  ${mcpHttpUrl}
- Auth:        Authorization: Bearer $MEMORIFY_TOKEN  ← set this env var once; do NOT paste the token in this file

## Connect (once per host)
Add the Memorify MCP server to your client:

\`\`\`bash
claude mcp add memorify --transport http ${mcpHttpUrl} --header "Authorization: Bearer $MEMORIFY_TOKEN"
\`\`\`

For Cursor / ChatGPT / n8n / Codex: point them at \`${mcpHttpUrl}\` with the same bearer header.

## First thing on EVERY new session (REQUIRED)
Call the \`agents_bootstrap\` tool to rehydrate yourself. It returns:
- \`role\` — your role.md (read it carefully — that's who you are)
- \`memories\` — your persisted memories
- \`skills\` — what you can do
- \`documents\` — the user's files (index)
- \`events\` — your recent activity

## After bootstrap
- \`memory_remember\` — persist preferences, facts, decisions.
- \`memory_recall\` — pull older context by query.
- \`events_log\` — record meaningful actions.
- Your role.md is just a memory — call \`memory_update\` with its id to evolve who you are over time.

This prompt has no secrets — safe to commit to CLAUDE.md or any repo. The token lives in \`$MEMORIFY_TOKEN\` (shell env, or your MCP client's env config).`;


  const systemPrompt = `You are connected to Memorify — a personal AI workspace shared with your human user. You have persistent memory, documents, skills, and an event timeline available as MCP tools. Use them on every task.

## Your identity (already provisioned — do NOT call whoami to discover these)
- Agent ID:       ${agentId}
- Workspace ID:   ${workspaceId}
- Workspace name: ${workspaceName || "(unset — optional)"}
- User scope:     all data belongs to the human user who issued this token.

## Your credentials
- MCP server: ${mcpHttpUrl}
- Token:      ${token}
- Auth:       Authorization: Bearer <token>

## How to connect
Add Memorify as a Streamable HTTP MCP server in your client (Claude, Cursor, ChatGPT, n8n, Codex…):

\`\`\`bash
claude mcp add memorify --transport http ${mcpHttpUrl} --header "Authorization: Bearer ${token}"
\`\`\`

Your host will auto-discover tools via \`tools/list\` and invoke them via \`tools/call\`.

## Your private workspace
Your memory and events are scoped to \`${workspaceId}\` by default — other agents on this user's account can't see them unless you explicitly publish to the shared scope.
- \`memory_remember\` writes to your workspace. Pass \`shared: true\` to publish to the shared namespace \`default\`.
- \`memory_recall\` reads from your workspace. Pass \`scope: "shared"\` or \`"all"\` to reach across.
- \`events_list\` returns only your events. Pass \`scope: "all"\` to see everything.

## First thing to do, ONCE per session
1. Call the \`agents_bootstrap\` tool to load role + recent memories + documents + events in one shot.
2. If that's unavailable, call \`memory_recall\` with no query to see the latest 10 memories for context.

## Available tools
- \`whoami\` — confirm identity
- \`memory_remember\` — { content, tags?, category?, namespace?, shared? }
- \`memory_recall\`   — { query?, limit?, category?, scope?, namespace? }
- \`memory_update\`   — { id, content?, tags?, category? }
- \`memory_delete\`   — { id }
- \`documents_list\`  — { limit? }
- \`skills_list\`
- \`events_log\`      — { kind, payload?, source? }
- \`events_list\`     — { limit?, scope? }

## Rules of engagement
1. **Recall before answering.** At the start of any task, \`memory_recall\` with a relevant query.
2. **Remember what matters.** Call \`memory_remember\` with descriptive tags (e.g. \`["preference"]\`, \`["project:memorify"]\`).
3. **Don't duplicate.** Recall first; if a similar memory exists, \`memory_update\` it.
4. **Log meaningful actions** with \`events_log\` (kind: \`"task_completed"\`, \`"file_generated"\`, etc.).
5. **Keep private context private.** Only publish to \`shared\` when other agents truly need it.

You're ready. Begin by calling \`agents_bootstrap\` (or \`memory_recall\`) to load context.`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl [&>*]:min-w-0">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-amber-400" />
            Connect {agent?.name}
          </DialogTitle>
          <DialogDescription>
            Two ways to plug in. <span className="text-foreground font-medium">Direct API</span> is instant — no restart, no handshake.
          </DialogDescription>
        </DialogHeader>

        {agent && (
          <div className="space-y-4 min-w-0">
            <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2">
              <span className={cn(
                "h-2 w-2 rounded-full",
                agent.status === "connected" ? "bg-emerald-400 animate-pulse" : "bg-amber-400 animate-pulse"
              )} />
              <span className="text-xs">
                {agent.status === "connected" ? (
                  <>Connected · last seen {agent.last_seen_at ? new Date(agent.last_seen_at).toLocaleTimeString() : "just now"}</>
                ) : (
                  <>Waiting for first ping…</>
                )}
              </span>
            </div>

            <Tabs defaultValue="prompt">
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="prompt">
                  <Zap className="h-3.5 w-3.5 mr-1.5" /> First connect
                </TabsTrigger>
                <TabsTrigger value="reconnect">
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reconnect
                </TabsTrigger>
                <TabsTrigger value="api">Direct API</TabsTrigger>
                <TabsTrigger value="mcp">MCP</TabsTrigger>
              </TabsList>

              <TabsContent value="prompt" className="space-y-3 mt-4">
                <p className="text-xs text-muted-foreground">
                  <span className="text-foreground font-medium">First-time setup.</span> Paste this once into the agent's system prompt — token is baked in so it self-onboards. For day-to-day re-pastes, use the <span className="text-foreground font-medium">Reconnect</span> tab (no secrets).
                </p>
                <CopyField value={systemPrompt} label="Agent system prompt" multiline secret />
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
                  <span className="text-primary font-medium">Keep token secret.</span> Anyone with this prompt has full read/write access to your Memorify data.
                </div>
              </TabsContent>

              <TabsContent value="reconnect" className="space-y-4 mt-4">
                <p className="text-xs text-muted-foreground">
                  <span className="text-foreground font-medium">For every new session.</span> Two pieces: (1) set <code className="text-foreground">MEMORIFY_TOKEN</code> once in your shell, then (2) paste the prompt into <code className="text-foreground">CLAUDE.md</code>. The prompt itself is secret-free and safe to commit.
                </p>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Step 1 — set the token (macOS / Linux, bash/zsh)</label>
                  <CopyField value={`export MEMORIFY_TOKEN="${token}"`} label="bash export" secret />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Step 1 — set the token (Windows PowerShell, persistent)</label>
                  <CopyField value={`setx MEMORIFY_TOKEN "${token}"`} label="powershell setx" secret />
                  <p className="text-[11px] text-muted-foreground">
                    Restart your terminal after <code className="text-foreground">setx</code>. For the current session only:{" "}
                    <code className="text-foreground">$env:MEMORIFY_TOKEN = "{token.slice(0, 6)}…"</code>
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Step 2 — paste this prompt into <code className="text-foreground">CLAUDE.md</code>
                  </label>
                  <CopyField value={reconnectPrompt} label="Reconnect prompt" multiline />
                </div>
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] text-muted-foreground">
                  <span className="text-emerald-400 font-medium">Token shown above is secret.</span> The prompt in Step 2 has zero secrets — only Step 1 carries the token, and it stays on your machine in the env var.
                </div>
              </TabsContent>


              <TabsContent value="api" className="space-y-4 mt-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Endpoint</label>
                  <CopyField value={apiUrl} label="Endpoint" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Bearer token (keep secret)</label>
                  <CopyField value={token} label="Token" secret />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">List commands + whoami</label>
                  <CopyField value={curlWhoami} label="whoami" secret />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Store a memory</label>
                  <CopyField value={curlRemember} label="memory.remember" secret />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Recall</label>
                  <CopyField value={curlRecall} label="memory.recall" secret />
                </div>
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
                  <span className="text-primary font-medium">Tip:</span> any agent (Claude Code via bash, scripts, your own tools) can call this with no restart. Available actions: <code className="text-foreground">whoami</code>, <code className="text-foreground">memory.remember/recall/update/delete</code>, <code className="text-foreground">documents.list</code>, <code className="text-foreground">skills.list</code>, <code className="text-foreground">events.log/list</code>.
                </div>
              </TabsContent>

              <TabsContent value="mcp" className="space-y-3 mt-4">
                {isCodex ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Codex CLI loads MCP servers from <code className="text-foreground">~/.codex/config.toml</code>. Pick one of the two options below, then restart Codex.
                    </p>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Option A — token inline (fastest)</label>
                      <CopyField value={codexToml} label="codex config (inline)" multiline secret />
                      <p className="text-[11px] text-muted-foreground">
                        Append this block to <code className="text-foreground">~/.codex/config.toml</code> (create the file if missing).
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Option B — token via env var (recommended)</label>
                      <CopyField value={codexExport} label="env export" secret />
                      <CopyField value={codexTomlEnv} label="codex config (env)" multiline />
                      <p className="text-[11px] text-muted-foreground">
                        Add the <code className="text-foreground">export</code> to your shell profile, then paste the TOML block into <code className="text-foreground">~/.codex/config.toml</code>.
                      </p>
                    </div>
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
                      <span className="text-primary font-medium">Verify:</span> run <code className="text-foreground">codex mcp list</code> — you should see <code className="text-foreground">memorify</code> with all Synapse tools (memory_*, documents_*, web_*).
                    </div>
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">1. Register MCP server</label>
                    <CopyField value={mcpCmd} label="MCP install" secret />
                    <p className="text-[11px] text-muted-foreground">Restart Claude Code afterward — MCP servers only load at startup.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type AgentEvent = {
  id: string;
  kind: string;
  source: string | null;
  payload: any;
  created_at: string;
};

function ActivityFeed({ userId, agents }: { userId?: string; agents: Agent[] }) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const agentById = useMemo(() => Object.fromEntries(agents.map(a => [a.id, a])), [agents]);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("events")
      .select("id, kind, source, payload, created_at")
      .eq("user_id", userId)
      .like("kind", "agent.%")
      .order("created_at", { ascending: false })
      .limit(50);
    setEvents((data as AgentEvent[]) ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`agent-activity:${userId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "events", filter: `user_id=eq.${userId}` },
        (p) => {
          const ev = p.new as AgentEvent;
          if (ev.kind?.startsWith("agent.")) setEvents((prev) => [ev, ...prev].slice(0, 50));
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading activity…</div>;
  if (!events.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
        <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <div className="text-sm font-medium">No agent activity yet</div>
        <p className="text-xs text-muted-foreground mt-1">As soon as an agent calls the API, you'll see it here in realtime.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
      {events.map((e) => {
        const isError = e.kind.endsWith(".error");
        const action = e.kind.replace(/^agent\./, "").replace(/\.error$/, "");
        const agentId = e.payload?.agent_id as string | undefined;
        const agent = agentId ? agentById[agentId] : undefined;
        const agentName = agent?.name ?? e.source?.replace(/^agent:/, "") ?? "Unknown";
        const dur = typeof e.payload?.duration_ms === "number" ? `${e.payload.duration_ms}ms` : null;
        return (
          <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/30 transition-colors">
            <div className={cn(
              "h-8 w-8 rounded-md flex items-center justify-center shrink-0",
              isError ? "bg-destructive/15 text-destructive" : "bg-emerald-500/15 text-emerald-400",
            )}>
              {isError ? <AlertTriangle className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium truncate">{agentName}</span>
                <code className="text-[11px] font-mono text-muted-foreground truncate">{action}</code>
                {isError && <Badge variant="destructive" className="text-[9px] h-4 px-1.5">error</Badge>}
              </div>
              {(isError ? e.payload?.error : e.payload?.params) && (
                <div className="text-[11px] text-muted-foreground truncate font-mono mt-0.5">
                  {isError ? e.payload.error : JSON.stringify(e.payload.params)}
                </div>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground shrink-0 flex flex-col items-end">
              <span>{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
              {dur && <span className="font-mono text-[10px] opacity-70">{dur}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
