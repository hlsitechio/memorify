import { useCallback, useEffect, useState } from "react";
import { useAuth as useClerkAuth, useOrganization } from "@clerk/react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Monitor,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Wifi,
  WifiOff,
  Loader2,
  Check,
  Download,
  Bot,
  UserCheck,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { RemoteControl } from "@/components/dashboard/RemoteControl";

type Machine = {
  id: string;
  name: string;
  platform: string | null;
  online: boolean;
  allow_agent_access: boolean;
  last_seen_at: string | null;
  created_at: string;
  active_session_id: string | null;
  active_agent: string | null;
  session_started_at: string | null;
  commands_total: number;
};

const DOWNLOAD_URL = "https://github.com/hlsitechio/memorify/releases/latest";

export default function Machines() {
  const { getToken } = useClerkAuth();
  const { organization } = useOrganization();
  const workspaceId = organization?.id ?? "";

  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [killing, setKilling] = useState<string | null>(null);
  const [togglingMode, setTogglingMode] = useState<string | null>(null);
  const [controlling, setControlling] = useState<Machine | null>(null);

  const api = useCallback(
    async (path: string, body?: Record<string, unknown>) => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(path, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    },
    [getToken],
  );

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const { ok, data } = await api("/api/machine/list");
      if (ok) setMachines((data.machines as Machine[]) ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api, workspaceId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000); // refresh online status
    return () => clearInterval(t);
  }, [load]);

  const confirmPair = async () => {
    const cleaned = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (cleaned.length !== 6) {
      toast.error("Enter the full 6-character code");
      return;
    }
    setPairing(true);
    try {
      const { ok, data } = await api("/api/machine/pair/confirm", { code: cleaned });
      if (!ok) {
        toast.error(
          data.error === "code_not_found_or_expired"
            ? "Code not found or expired. Check the code shown by the daemon."
            : (data.error ?? "Pairing failed"),
        );
        return;
      }
      toast.success(`Paired "${data.machine?.name ?? "machine"}"`);
      setCode("");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPairing(false);
    }
  };

  const toggleAgentMode = async (machineId: string, current: boolean) => {
    const next = !current;
    setTogglingMode(machineId);
    // Optimistic update
    setMachines((prev) =>
      prev.map((m) => (m.id === machineId ? { ...m, allow_agent_access: next } : m)),
    );
    try {
      const { ok, data } = await api("/api/machine/mode", {
        machine_id: machineId,
        allow_agent_access: next,
      });
      if (!ok) {
        // Revert on error
        setMachines((prev) =>
          prev.map((m) => (m.id === machineId ? { ...m, allow_agent_access: current } : m)),
        );
        toast.error(data.error ?? "Failed to update access mode");
        return;
      }
      toast.success(
        next
          ? "🤖 Agent Access Enabled — agents can run safe allowlisted commands"
          : "🔒 Human-Only Mode — AI agents are completely blocked from this machine",
      );
    } catch (e) {
      setMachines((prev) =>
        prev.map((m) => (m.id === machineId ? { ...m, allow_agent_access: current } : m)),
      );
      toast.error((e as Error).message);
    } finally {
      setTogglingMode(null);
    }
  };

  const kill = async (id: string) => {
    setKilling(id);
    try {
      const { ok, data } = await api("/api/machine/kill", { machine_id: id });
      if (!ok) {
        toast.error(data.error ?? "Kill failed");
        return;
      }
      toast.success("Machine revoked — token invalidated and daemon disconnected");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setKilling(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Machines & Remote Desktop"
        description="TeamViewer-style remote desktop & agent execution with one-click kill switches"
        actions={
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Pair a new machine */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Pair a machine
            </CardTitle>
            <CardDescription>
              Run the daemon on your machine, then enter the 6-character code it displays.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 space-y-1.5">
                <Label>Pairing code</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="ABC123"
                  maxLength={6}
                  className="font-mono uppercase tracking-widest text-center text-lg"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={confirmPair} disabled={pairing}>
                  {pairing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : (
                    <Check className="h-4 w-4 mr-1.5" />
                  )}
                  Pair Machine
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Download className="h-3.5 w-3.5" />
              <span>
                Install the desktop daemon:{" "}
                <a
                  href={DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  Download Memorify Remote
                </a>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Machine list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Your machines ({machines.length})
              </h3>
            </div>
          </div>

          {machines.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center bg-card/40">
              <Monitor className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
              <h3 className="text-base font-semibold">No machines paired yet</h3>
              <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
                Pair your desktop or server to control it like TeamViewer and optionally allow AI agents to run commands.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card divide-y divide-border">
              {machines.map((m) => (
                <div key={m.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:bg-secondary/20 transition-colors">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground truncate">{m.name}</span>
                      {m.online ? (
                        <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
                          <Wifi className="h-3 w-3 mr-1" /> online
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          <WifiOff className="h-3 w-3 mr-1" /> offline
                        </Badge>
                      )}
                      {m.active_session_id && (
                        <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 animate-pulse">
                          <ShieldAlert className="h-3 w-3 mr-1" /> active session
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span>{m.platform ?? "unknown platform"}</span>
                      <span>·</span>
                      <span>{m.commands_total} commands run</span>
                      <span>·</span>
                      <span>
                        {m.last_seen_at
                          ? `last seen ${formatDistanceToNow(new Date(m.last_seen_at))} ago`
                          : "never seen"}
                      </span>
                    </div>
                    {m.active_agent && (
                      <div className="text-xs text-amber-500/90 font-medium">
                        controlled by agent <span className="underline">{m.active_agent}</span>
                      </div>
                    )}
                  </div>

                  {/* Mode Selector & Action Buttons */}
                  <div className="flex items-center gap-4 flex-wrap">
                    {/* Human-only vs Agent Toggle */}
                    <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-lg border border-border/50">
                      <Switch
                        checked={m.allow_agent_access}
                        disabled={togglingMode === m.id}
                        onCheckedChange={() => toggleAgentMode(m.id, m.allow_agent_access)}
                        id={`mode-toggle-${m.id}`}
                      />
                      <Label
                        htmlFor={`mode-toggle-${m.id}`}
                        className="text-xs cursor-pointer select-none font-medium flex items-center gap-1.5"
                      >
                        {m.allow_agent_access ? (
                          <span className="text-amber-500 flex items-center gap-1">
                            <Bot className="h-3.5 w-3.5" /> Agent Allowed
                          </span>
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Lock className="h-3.5 w-3.5" /> Human Only
                          </span>
                        )}
                      </Label>
                    </div>

                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setControlling(m)}
                      disabled={!m.online}
                      title={m.online ? "Open remote screen" : "Machine offline"}
                    >
                      <Monitor className="h-3.5 w-3.5 mr-1.5" />
                      TeamViewer
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => kill(m.id)}
                      disabled={killing === m.id}
                      className="text-destructive hover:bg-destructive/10"
                      title="Revoke machine token"
                    >
                      {killing === m.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-muted-foreground">
          <div className="p-3 bg-secondary/20 rounded-lg border border-border/40">
            <p className="font-medium text-foreground flex items-center gap-1.5 mb-1">
              <Lock className="h-3.5 w-3.5 text-blue-400" /> 🔒 Human-Only (TeamViewer Mode)
            </p>
            You have exclusive remote desktop access from any browser. External AI agents are strictly blocked from touching the machine.
          </div>
          <div className="p-3 bg-secondary/20 rounded-lg border border-border/40">
            <p className="font-medium text-foreground flex items-center gap-1.5 mb-1">
              <Bot className="h-3.5 w-3.5 text-amber-400" /> 🤖 Agent-Allowed Mode
            </p>
            Permitted AI agents can run allowlisted commands on this machine. Every session immediately sends you a one-click kill email.
          </div>
        </div>
      </div>

      {controlling && (
        <RemoteControl
          machineId={controlling.id}
          machineName={controlling.name}
          getToken={getToken}
          onClose={() => setControlling(null)}
        />
      )}
    </>
  );
}
