import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Terminal, Copy, Check, Plus, Trash2, Zap, Wifi, RefreshCw, ExternalLink, Sparkles, ShieldCheck } from "lucide-react";
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
};

const CATALOG = [
  {
    kind: "claude_code",
    name: "Claude Code",
    tagline: "Anthropic's terminal coding agent",
    description: "Connect Claude Code to this workspace as an MCP server — no ngrok, no local tunnel. Paste one command.",
    icon: Terminal,
    tone: "text-amber-400",
    featured: true,
  },
  { kind: "openai_codex", name: "OpenAI Codex CLI",  tagline: "Coming soon", description: "OpenAI's terminal coding agent.",          icon: Sparkles, tone: "text-emerald-400", featured: false },
  { kind: "cursor",       name: "Cursor",            tagline: "Coming soon", description: "Cursor MCP integration.",                  icon: Bot,      tone: "text-sky-400",     featured: false },
  { kind: "custom",       name: "Custom agent",      tagline: "Bring your own", description: "Any MCP-capable agent via the hosted URL + token.", icon: Zap, tone: "text-primary",     featured: false },
];

function endpointUrl() {
  // Public hosted ping endpoint — replaces the need for ngrok / local tunnels.
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-ping`;
}

function CopyField({ value, label, mono = true }: { value: string; label?: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(`${label ?? "Copied"} to clipboard`);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div className="flex items-stretch rounded-md border border-border bg-secondary/40 overflow-hidden group min-w-0 w-full">
      <code className={cn("flex-1 min-w-0 px-3 py-2 text-xs truncate", mono && "font-mono")} title={value}>{value}</code>
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
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardId, setWizardId] = useState<string | null>(null);

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
    if (kind !== "claude_code" && kind !== "custom") {
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

  const wizardAgent = useMemo(
    () => agents.find((a) => a.id === wizardId) ?? null,
    [agents, wizardId],
  );

  return (
    <>
      <PageHeader
        title="Agents"
        description="Connect AI agents to this workspace. No ngrok, no local tunnel — just a hosted URL and a token."
        actions={
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
        }
      />
      <div className="p-6 overflow-y-auto scrollbar-thin h-[calc(100vh-3.5rem)]">
        <Tabs defaultValue={agents.length ? "connected" : "library"} className="space-y-6">
          <TabsList>
            <TabsTrigger value="connected">
              Connected <Badge variant="secondary" className="ml-2">{agents.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="library">Library</TabsTrigger>
          </TabsList>

          <TabsContent value="connected" className="mt-0 space-y-3">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : agents.length === 0 ? (
              <EmptyHero onConnect={() => connect("claude_code", "Claude Code")} />
            ) : (
              agents.map((a) => <AgentRow key={a.id} agent={a} onOpen={() => setWizardId(a.id)} onDelete={() => remove(a.id)} />)
            )}
          </TabsContent>

          <TabsContent value="library" className="mt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {CATALOG.map((c) => {
                const Icon = c.icon;
                const available = c.kind === "claude_code" || c.kind === "custom";
                return (
                  <div key={c.kind} className={cn(
                    "relative rounded-lg border bg-card p-4 transition-all hover:border-primary/40",
                    c.featured ? "border-primary/40 shadow-sm" : "border-border"
                  )}>
                    {c.featured && (
                      <Badge className="absolute top-3 right-3 text-[10px]" variant="default">Featured</Badge>
                    )}
                    <div className={cn("h-10 w-10 rounded-md bg-secondary/60 flex items-center justify-center mb-3", c.tone)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="text-sm font-semibold">{c.name}</div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">{c.tagline}</div>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{c.description}</p>
                    <Button
                      size="sm"
                      className="w-full h-8 mt-4"
                      variant={available ? "default" : "outline"}
                      disabled={!available}
                      onClick={() => connect(c.kind, c.name)}
                    >
                      {available ? <><Plus className="h-3.5 w-3.5 mr-1.5" /> Connect</> : "Coming soon"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ConnectWizard
        agent={wizardAgent}
        onClose={() => setWizardId(null)}
      />
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

function AgentRow({ agent, onOpen, onDelete }: { agent: Agent; onOpen: () => void; onDelete: () => void }) {
  const connected = agent.status === "connected";
  const last = agent.last_seen_at ? new Date(agent.last_seen_at).toLocaleString() : "Never";
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-4 group hover:border-primary/30 transition-colors">
      <div className={cn(
        "h-10 w-10 rounded-md flex items-center justify-center shrink-0",
        connected ? "bg-emerald-500/15 text-emerald-400" : "bg-secondary text-muted-foreground"
      )}>
        <Terminal className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold truncate">{agent.name}</div>
          <Badge variant={connected ? "default" : "secondary"} className={cn("text-[10px] gap-1", connected && "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground")} />
            {connected ? "Connected" : "Pending"}
          </Badge>
        </div>
        <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
          {agent.kind} · last seen {last}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onOpen}>
        <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Setup
      </Button>
      <Button size="sm" variant="ghost" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ConnectWizard({ agent, onClose }: { agent: Agent | null; onClose: () => void }) {
  const open = !!agent;
  const url = endpointUrl();
  const fullUrl = agent ? `${url}?token=${agent.token}` : "";
  const claudeCmd = agent ? `claude mcp add synapse --transport http ${fullUrl}` : "";
  const curlCmd = agent ? `curl -X POST "${fullUrl}" -H "Content-Type: application/json" -d '{"client":"manual"}'` : "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-amber-400" />
            Connect {agent?.name}
          </DialogTitle>
          <DialogDescription>
            Run the command below in your terminal. The status flips to <span className="text-emerald-400 font-medium">Connected</span> as soon as your agent pings the endpoint.
          </DialogDescription>
        </DialogHeader>

        {agent && (
          <div className="space-y-4">
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

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">1. Install in Claude Code</label>
              <CopyField value={claudeCmd} label="Install command" />
              <p className="text-[11px] text-muted-foreground">
                Registers this workspace as an MCP server in your Claude Code config. Restart Claude Code afterward.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">2. Or test the endpoint manually</label>
              <CopyField value={curlCmd} label="Test command" />
            </div>

            <details className="rounded-md border border-border bg-secondary/20 px-3 py-2 group">
              <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">Advanced: raw URL & token</summary>
              <div className="space-y-2 mt-2.5">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Endpoint</div>
                  <CopyField value={url} label="Endpoint" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Token (keep secret)</div>
                  <CopyField value={agent.token} label="Token" />
                </div>
              </div>
            </details>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
