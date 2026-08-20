import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, useOrganizationList } from "@clerk/react";
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  Bot,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type PairingInfo = {
  agent_name: string | null;
  agent_kind: string | null;
  requested_scopes: string[];
  fingerprint: string | null;
  created_at: string;
  expires_at: string;
};

type Phase = "enter" | "review" | "done";

export default function Pair() {
  const { isSignedIn, getToken } = useAuth();
  const { isLoaded: orgsLoaded, userMemberships } = useOrganizationList({ userMemberships: true });

  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("enter");
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [orgId, setOrgId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<"approved" | "denied" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orgs = useMemo(
    () =>
      (userMemberships.data ?? []).map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        role: m.role,
      })),
    [userMemberships.data],
  );

  const formatted = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const orgName = orgs.find((o) => o.id === orgId)?.name;

  const api = useCallback(
    async (body: Record<string, unknown>) => {
      const token = await getToken();
      if (!token) throw new Error("Sign in to approve pairing requests");
      const res = await fetch("/api/pair/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    },
    [getToken],
  );

  const onLookup = useCallback(async () => {
    if (formatted.length !== 6) {
      toast.error("Enter the full 6-character code");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { ok, status, data } = await api({ code: formatted, action: "lookup" });
      if (status === 429) {
        const secs = Number(data.retry_after ?? 0);
        const msg = `Too many attempts — locked for ${Math.ceil(secs / 60)} minute(s).`;
        setError(msg);
        toast.error(msg);
        return;
      }
      if (!ok) {
        const msg =
          data.error === "unauthorized"
            ? "Sign in to approve pairing requests"
            : "Code not found. Check the code shown by your agent.";
        setError(msg);
        toast.error(msg);
        return;
      }
      setPairing(data.pairing as PairingInfo);
      setOrgId(orgs[0]?.id ?? "");
      setPhase("review");
    } finally {
      setBusy(false);
    }
  }, [api, formatted, orgs]);

  const onDecide = useCallback(
    async (decision: "approve" | "deny") => {
      if (decision === "approve" && !orgId) {
        toast.error("Pick which workspace this agent joins");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const { ok, data } = await api({ code: formatted, action: "decide", decision, org_id: orgId });
        if (!ok) {
          const msg =
            data.error === "not_an_org_member"
              ? "You're not a member of that workspace"
              : data.error === "code_not_found"
                ? "This pairing code is no longer valid (it may have expired or been used)."
                : data.error === "internal_error"
                  ? "Something went wrong on our side — the pairing was not approved. Please try again."
                  : (data.error ?? "Failed");
          setError(msg);
          toast.error(msg);
          return;
        }
        setOutcome(decision);
        setPhase("done");
      } finally {
        setBusy(false);
      }
    },
    [api, formatted, orgId],
  );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Connect to Memorify</h1>
          <p className="text-sm text-muted-foreground">
            Approve an agent's request to join your workspace.
          </p>
        </div>

        {phase === "enter" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enter pairing code</CardTitle>
              <CardDescription>The 6-character code shown by your agent.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pair-code">Code</Label>
                <Input
                  id="pair-code"
                  value={formatted}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onLookup()}
                  placeholder="ABC123"
                  className={cn(
                    "text-center text-2xl font-mono tracking-[0.5em] h-14",
                    formatted.length === 6 && "border-primary",
                  )}
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoFocus
                />
              </div>
              {!isSignedIn && (
                <p className="text-xs text-muted-foreground">
                  You'll need to{" "}
                  <Link to="/auth" className="underline text-foreground">sign in</Link>{" "}
                  to approve.
                </p>
              )}
              <Button className="w-full" onClick={onLookup} disabled={busy || formatted.length !== 6}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
              </Button>
              {error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {phase === "review" && pairing && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-4 w-4" /> {pairing.agent_name ?? "Unnamed agent"}
              </CardTitle>
              <CardDescription>
                {pairing.agent_kind ?? "custom"} · requested {new Date(pairing.created_at).toLocaleTimeString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Requested access</p>
                <div className="flex flex-wrap gap-1">
                  {pairing.requested_scopes.map((s) => (
                    <Badge key={s} variant="secondary" className="font-mono text-[10px]">{s}</Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Join which workspace?</Label>
                <Select value={orgId} onValueChange={setOrgId}>
                  <SelectTrigger><SelectValue placeholder="Pick a workspace" /></SelectTrigger>
                  <SelectContent>
                    {orgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {orgsLoaded && orgs.length === 0 && (
                  <p className="text-xs text-destructive">You don't belong to any workspaces yet.</p>
                )}
              </div>
              {error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => onDecide("approve")} disabled={busy || !orgId}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShieldCheck className="h-4 w-4" /> Approve</>}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => onDecide("deny")} disabled={busy}>
                  <Ban className="h-4 w-4" /> Deny
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {phase === "done" && (
          <Card>
            <CardContent className="pt-6 text-center space-y-3">
              {outcome === "approved" ? (
                <>
                  <BadgeCheck className="mx-auto h-10 w-10 text-green-600" />
                  <p className="font-medium">
                    Approved — {pairing?.agent_name ?? "agent"} is connected
                    {orgName ? ` to ${orgName}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Return to your terminal. The agent picks up its token automatically on its next poll —
                    usually within a few seconds — and then writes its own config.
                  </p>
                  <Button asChild variant="link" className="text-xs text-muted-foreground">
                    <Link to="/dashboard/agents">Manage agents in the dashboard</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Ban className="mx-auto h-10 w-10 text-muted-foreground" />
                  <p className="font-medium">Denied</p>
                  <p className="text-sm text-muted-foreground">The agent received no token.</p>
                </>
              )}
              <Button
                variant="outline"
                onClick={() => { setPhase("enter"); setCode(""); setPairing(null); setOutcome(null); setError(null); }}
              >
                Pair another agent
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

}
