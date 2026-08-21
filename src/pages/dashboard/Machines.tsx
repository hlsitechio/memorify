import { useCallback, useEffect, useState } from "react";
import { useAuth as useClerkAuth, useOrganization } from "@clerk/react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { RemoteControl } from "@/components/dashboard/RemoteControl";

type Machine = {
  id: string;
  name: string;
  platform: string | null;
  online: boolean;
  last_seen_at: string | null;
  created_at: string;
  active_session_id: string | null;
  active_agent: string | null;
  session_started_at: string | null;
  commands_total: number;
};

const PAIR_COMMAND = "npx https://memorify.dev/cli/memorify-agentd.tgz";

export default function Machines() {
  const { getToken } = useClerkAuth();
  const { organization } = useOrganization();
  const workspaceId = organization?.id ?? "";

  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [killing, setKilling] = useState<string | null>(null);
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

  const kill = async (id: string) => {
    setKilling(id);
    try {
      const { ok, data } = await api("/api/machine/kill", { machine_id: id });
      if (!ok) {
        toast.error(data.error ?? "Kill failed");
        return;
      }
      toast.success("Machine killed — token revoked, daemon will exit");
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
        title="Machines"
        description="Take control of your machines remotely — TeamViewer-style"
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
              Run the daemon on your machine, then enter the 6-character code it shows.
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
                  Pair
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Terminal className="h-3.5 w-3.5" />
              <span>
                Install the daemon:{" "}
                <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono">{PAIR_COMMAND}</code>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Machine list */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Your machines ({machines.length})
            </h3>
          </div>

          {machines.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center bg-card/40">
              <Monitor className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
              <h3 className="text-base font-semibold">No machines paired yet</h3>
              <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
                Pair your first machine to control it remotely from anywhere — with or without an agent.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card divide-y divide-border">
              {machines.map((m) => (
                <div key={m.id} className="flex items-center gap-4 px-4 py-3 hover:bg-secondary/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{m.name}</span>
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
                        <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                          <ShieldAlert className="h-3 w-3 mr-1" /> agent in control
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {m.platform ?? "unknown platform"}
                      {" · "}
                      {m.commands_total} commands
                      {" · "}
                      {m.last_seen_at
                        ? `last seen ${formatDistanceToNow(new Date(m.last_seen_at))} ago`
                        : "never seen"}
                    </div>
                    {m.active_agent && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        controlled by <span className="font-medium">{m.active_agent}</span>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setControlling(m)}
                    disabled={!m.online}
                    title={m.online ? "Take control" : "Machine offline"}
                  >
                    <Monitor className="h-3.5 w-3.5 mr-1.5" />
                    Control
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => kill(m.id)}
                    disabled={killing === m.id}
                    className="text-destructive hover:text-destructive"
                  >
                    {killing === m.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Kill
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />
        <p className="text-xs text-muted-foreground">
          Every agent control session emails you a one-click kill switch. Commands are allowlisted on the
          machine and audit-logged in the dashboard.
        </p>
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
