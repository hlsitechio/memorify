import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth as useClerkAuth, useOrganization, useUser } from "@clerk/react";
import { useAuth as useAppAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  ACCENT_PRESETS,
  type HSL,
  applyAccent,
  getStoredAccent,
  hexToHsl,
  hslToHex,
  resetAccent,
  setStoredAccent,
} from "@/lib/theme";
import {
  Check,
  RotateCcw,
  Palette,
  User,
  Briefcase,
  ShieldAlert,
  Bot,
  Copy,
  ExternalLink,
  Search,
  Shield,
  SlidersHorizontal,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
} from "lucide-react";
import { AgentsManager } from "./Agents";
import { cn } from "@/lib/utils";

type AccessLevel = "read" | "write" | "both" | "full";

type AgentRow = {
  id: string;
  name: string;
  kind: string;
  status: string;
  access_level: string;
  last_seen_at: string | null;
  created_at: string;
  user_id: string;
};

type CopilotSettings = {
  model: string;
  temperature: number;
  max_tokens: number;
  zdr: boolean;
  data_collection: "deny" | "allow";
  api_endpoint: string;
};

type OpenRouterModel = {
  id: string;
  name: string;
  description: string;
  context_length: number | null;
  pricing: { prompt?: string; completion?: string } | null;
};

type ServiceStatus = "checking" | "operational" | "degraded";

type StatusCheck = {
  id: "site" | "api" | "mcp";
  label: string;
  url: string;
  expectedStatus: number;
};

type StatusResult = StatusCheck & {
  status: ServiceStatus;
  httpStatus: number | null;
  server: string | null;
  latencyMs: number | null;
  checkedAt: string | null;
  error: string | null;
};

const DEFAULT_COPILOT_SETTINGS: CopilotSettings = {
  model: "openrouter/auto",
  temperature: 0.2,
  max_tokens: 2048,
  zdr: false,
  data_collection: "allow",
  api_endpoint: "",
};

const MODEL_OPTIONS = [
  { value: "openrouter/auto", label: "Auto router" },
  { value: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super 120B free" },
  { value: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
  { value: "openai/gpt-5", label: "GPT-5" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
];

const FREE_MODEL_MAX_TOKENS = 2048;
const STATUS_CHECKS: StatusCheck[] = [
  { id: "site", label: "Website", url: "https://memorify.dev/", expectedStatus: 200 },
  { id: "api", label: "API health", url: "https://memorify.dev/api/health", expectedStatus: 200 },
  { id: "mcp", label: "MCP gateway", url: "https://memorify.dev/mcp", expectedStatus: 200 },
];

function isFreeOpenRouterModel(model: string): boolean {
  return model.trim().toLowerCase().endsWith(":free");
}

function capTokensForModel(settings: CopilotSettings, model: string): CopilotSettings {
  return {
    ...settings,
    model,
    max_tokens: isFreeOpenRouterModel(model)
      ? Math.min(settings.max_tokens, FREE_MODEL_MAX_TOKENS)
      : settings.max_tokens,
  };
}

function initialStatusResults(): StatusResult[] {
  return STATUS_CHECKS.map((check) => ({
    ...check,
    status: "checking",
    httpStatus: null,
    server: null,
    latencyMs: null,
    checkedAt: null,
    error: null,
  }));
}

const ACCESS_OPTIONS: { value: AccessLevel; label: string; help: string }[] = [
  { value: "read", label: "Read", help: "List / recall / view only" },
  { value: "write", label: "Write", help: "Create & update only (no reads, no deletes)" },
  { value: "both", label: "Both", help: "Read + write (no deletes / admin)" },
  { value: "full", label: "Full", help: "All actions including delete & agent admin" },
];

function CopyId({ value, label }: { value: string; label: string }) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <button
      type="button"
      className="font-mono text-xs text-right max-w-[min(100%,20rem)] truncate hover:text-primary transition-colors"
      title={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success(`${label} copied`);
        } catch {
          toast.error("Could not copy");
        }
      }}
    >
      <span className="inline-flex items-center gap-1.5">
        {value}
        <Copy className="h-3 w-3 shrink-0 opacity-60" />
      </span>
    </button>
  );
}

export default function Settings() {
  const { user: authUser, signOut } = useAppAuth();
  const { getToken } = useClerkAuth();
  const { user: clerkUser, isLoaded: userLoaded } = useUser();
  const { organization, membership, isLoaded: orgLoaded } = useOrganization();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [busyProfile, setBusyProfile] = useState(false);
  const [busyWs, setBusyWs] = useState(false);
  const [neonSync, setNeonSync] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [agentsHelp, setAgentsHelp] = useState<Record<string, string>>({});
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [savingAgentId, setSavingAgentId] = useState<string | null>(null);
  const [copilotSettings, setCopilotSettings] = useState<CopilotSettings>(DEFAULT_COPILOT_SETTINGS);
  const [customModel, setCustomModel] = useState("");
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [openRouterKeySource, setOpenRouterKeySource] = useState<"workspace" | "environment" | null>(null);
  const [openRouterKeyHint, setOpenRouterKeyHint] = useState<string | null>(null);
  const [copilotConfigured, setCopilotConfigured] = useState(false);
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copilotError, setCopilotError] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState("nemotron");
  const [modelResults, setModelResults] = useState<OpenRouterModel[]>([]);
  const [modelSearchBusy, setModelSearchBusy] = useState(false);
  const [statusResults, setStatusResults] = useState<StatusResult[]>(() => initialStatusResults());
  const [statusBusy, setStatusBusy] = useState(false);

  const [accent, setAccent] = useState<HSL>(
    () => getStoredAccent() ?? { h: 174, s: 85, l: 55 }
  );
  const accentHex = useMemo(() => hslToHex(accent), [accent]);

  const userId = clerkUser?.id ?? authUser?.id ?? "";
  const workspaceId = organization?.id ?? "";
  const role = membership?.role ?? null;
  const canManageOrg =
    role === "org:admin" ||
    role === "admin" ||
    membership?.permissions?.includes("org:sys_profile:manage");
  const statusSummary = statusResults.every((r) => r.status === "operational")
    ? "operational"
    : statusResults.some((r) => r.status === "checking")
      ? "checking"
      : "degraded";

  useEffect(() => {
    if (!userLoaded || !clerkUser) return;
    setDisplayName(
      clerkUser.fullName ||
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        clerkUser.username ||
        ""
    );
  }, [userLoaded, clerkUser]);

  useEffect(() => {
    if (!userId || !workspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const res = await fetch("/api/copilot/settings", {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Workspace-Id": workspaceId,
          },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = data as { error?: string; detail?: string };
          if (!cancelled) setCopilotError(err.detail || err.error || `HTTP ${res.status}`);
          return;
        }
        if (cancelled) return;
        const settings = (data as { settings?: CopilotSettings }).settings ?? DEFAULT_COPILOT_SETTINGS;
        setCopilotSettings(settings);
        setCustomModel(MODEL_OPTIONS.some((m) => m.value === settings.model) ? "" : settings.model);
        setCopilotConfigured(Boolean((data as { openrouter_configured?: boolean }).openrouter_configured));
        setOpenRouterKeySource(
          ((data as { openrouter_key_source?: "workspace" | "environment" | null }).openrouter_key_source) ?? null
        );
        setOpenRouterKeyHint(((data as { openrouter_key_hint?: string | null }).openrouter_key_hint) ?? null);
        setCopilotError(null);
      } catch (e) {
        if (!cancelled) setCopilotError(e instanceof Error ? e.message : "Could not load Copilot settings");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, workspaceId, getToken]);

  useEffect(() => {
    if (!orgLoaded) return;
    setWorkspaceName(organization?.name ?? "");
  }, [orgLoaded, organization?.name]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const res = await fetch("/api/bootstrap", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) {
          if (!cancelled) setNeonSync(res.ok ? null : `Neon: HTTP ${res.status}`);
          return;
        }
        const data = await res.json();
        const neonWs = data?.neon?.memberships?.find(
          (m: { workspace_id: string }) => m.workspace_id === workspaceId
        );
        if (cancelled) return;
        if (workspaceId && neonWs) setNeonSync("Mirrored in Neon");
        else if (workspaceId) setNeonSync("Clerk ok · Neon pending (re-open dashboard)");
        else setNeonSync("No active organization");
      } catch {
        if (!cancelled) setNeonSync(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, workspaceId, getToken]);

  const runStatusChecks = useCallback(async () => {
    setStatusBusy(true);
    setStatusResults((current) =>
      current.map((result) => ({ ...result, status: "checking", error: null }))
    );

    const checked = await Promise.all(
      STATUS_CHECKS.map(async (check): Promise<StatusResult> => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 8000);
        const started = performance.now();
        const checkedAt = () =>
          new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });

        try {
          const res = await fetch(check.url, {
            cache: "no-store",
            redirect: "follow",
            signal: controller.signal,
          });
          const latencyMs = Math.round(performance.now() - started);
          return {
            ...check,
            status: res.status === check.expectedStatus ? "operational" : "degraded",
            httpStatus: res.status,
            server: res.headers.get("server"),
            latencyMs,
            checkedAt: checkedAt(),
            error: res.ok ? null : res.statusText || `HTTP ${res.status}`,
          };
        } catch (e) {
          return {
            ...check,
            status: "degraded",
            httpStatus: null,
            server: null,
            latencyMs: Math.round(performance.now() - started),
            checkedAt: checkedAt(),
            error:
              e instanceof Error && e.name === "AbortError"
                ? "Timed out"
                : e instanceof Error
                  ? e.message
                  : "Request failed",
          };
        } finally {
          window.clearTimeout(timeout);
        }
      })
    );

    setStatusResults(checked);
    setStatusBusy(false);
  }, []);

  useEffect(() => {
    void runStatusChecks();
  }, [runStatusChecks]);

  const reloadAgents = async () => {
    if (!workspaceId) {
      setAgents([]);
      return;
    }
    setAgentsLoading(true);
    setAgentsError(null);
    try {
      const token = await getToken();
      if (!token) {
        setAgentsError("No session token");
        return;
      }
      const res = await fetch(
        `/api/agents?workspace_id=${encodeURIComponent(workspaceId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const apiError = err as { error?: string; detail?: string };
        setAgentsError(apiError.detail || apiError.error || `HTTP ${res.status}`);
        setAgents([]);
        return;
      }
      const data = await res.json();
      setAgents((data.agents as AgentRow[]) || []);
      setAgentsHelp((data.help as Record<string, string>) || {});
    } catch (e) {
      setAgentsError(e instanceof Error ? e.message : "Failed to load agents");
    } finally {
      setAgentsLoading(false);
    }
  };

  useEffect(() => {
    void reloadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, getToken]);

  const saveAgentAccess = async (agentId: string, access_level: AccessLevel) => {
    if (!workspaceId) return;
    setSavingAgentId(agentId);
    try {
      const token = await getToken();
      if (!token) {
        toast.error("No session token");
        return;
      }
      const res = await fetch("/api/agents", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent_id: agentId,
          workspace_id: workspaceId,
          access_level,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = data as { error?: string; detail?: string };
        toast.error(err.detail || err.error || `HTTP ${res.status}`);
        return;
      }
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, access_level } : a))
      );
      toast.success(`Access → ${access_level} (live on next agent call)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingAgentId(null);
    }
  };

  const saveProfile = async () => {
    if (!clerkUser) return;
    setBusyProfile(true);
    try {
      const trimmed = displayName.trim();
      const parts = trimmed.split(/\s+/).filter(Boolean);
      const firstName = parts[0] ?? "";
      const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
      await clerkUser.update({ firstName, lastName });
      toast.success("Profile saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save profile");
    } finally {
      setBusyProfile(false);
    }
  };

  const saveWorkspace = async () => {
    if (!organization) {
      toast.error("No active workspace (organization)");
      return;
    }
    if (!canManageOrg) {
      toast.error("Only workspace admins can rename");
      return;
    }
    const name = workspaceName.trim();
    if (!name) {
      toast.error("Name required");
      return;
    }
    setBusyWs(true);
    try {
      await organization.update({ name });
      toast.success("Workspace renamed");
      try {
        const token = await getToken();
        if (token) {
          await fetch("/api/bootstrap", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              user: {
                id: clerkUser?.id,
                email: clerkUser?.primaryEmailAddress?.emailAddress,
                first_name: clerkUser?.firstName,
                last_name: clerkUser?.lastName,
                full_name: clerkUser?.fullName,
                image_url: clerkUser?.imageUrl,
              },
              workspace: {
                id: organization.id,
                name,
                slug: organization.slug,
                image_url: organization.imageUrl,
              },
            }),
          });
          setNeonSync("Mirrored in Neon");
        }
      } catch {
        /* soft */
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rename workspace");
    } finally {
      setBusyWs(false);
    }
  };

  const pick = (hsl: HSL) => {
    setAccent(hsl);
    applyAccent(hsl);
  };
  const persist = () => {
    setStoredAccent(accent);
    toast.success("Accent saved");
  };
  const reset = () => {
    resetAccent();
    setAccent({ h: 174, s: 85, l: 55 });
    toast.success("Accent reset");
  };

  const saveCopilotSettings = async () => {
    if (!workspaceId) {
      toast.error("Select or create a workspace first");
      return;
    }
    const model = customModel.trim() || copilotSettings.model;
    if (!model) {
      toast.error("Model required");
      return;
    }
    setCopilotBusy(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error("No session token");
        return;
      }
      const res = await fetch("/api/copilot/settings", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Workspace-Id": workspaceId,
        },
        body: JSON.stringify({ ...copilotSettings, model }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = data as { error?: string; detail?: string };
        toast.error(err.detail || err.error || `HTTP ${res.status}`);
        return;
      }
      const saved = (data as { settings?: CopilotSettings }).settings ?? { ...copilotSettings, model };
      setCopilotSettings(saved);
      setCustomModel(MODEL_OPTIONS.some((m) => m.value === saved.model) ? "" : saved.model);
      setCopilotConfigured(Boolean((data as { openrouter_configured?: boolean }).openrouter_configured));
      setOpenRouterKeySource(
        ((data as { openrouter_key_source?: "workspace" | "environment" | null }).openrouter_key_source) ?? null
      );
      setOpenRouterKeyHint(((data as { openrouter_key_hint?: string | null }).openrouter_key_hint) ?? null);
      setCopilotError(null);
      toast.success("Copilot settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save Copilot settings");
    } finally {
      setCopilotBusy(false);
    }
  };

  const saveOpenRouterKey = async (clear = false) => {
    if (!workspaceId) {
      toast.error("Select or create a workspace first");
      return;
    }
    if (!clear && !openRouterKey.trim()) {
      toast.error("Paste an OpenRouter API key first");
      return;
    }
    setCopilotBusy(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error("No session token");
        return;
      }
      const res = await fetch("/api/copilot/settings", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Workspace-Id": workspaceId,
        },
        body: JSON.stringify({
          ...copilotSettings,
          ...(clear
            ? { clear_openrouter_api_key: true }
            : { openrouter_api_key: openRouterKey.trim() }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = data as { error?: string; detail?: string };
        toast.error(err.detail || err.error || `HTTP ${res.status}`);
        return;
      }
      setOpenRouterKey("");
      const saved = (data as { settings?: CopilotSettings }).settings;
      if (saved) {
        setCopilotSettings(saved);
        setCustomModel(MODEL_OPTIONS.some((m) => m.value === saved.model) ? "" : saved.model);
      }
      setCopilotConfigured(Boolean((data as { openrouter_configured?: boolean }).openrouter_configured));
      setOpenRouterKeySource(
        ((data as { openrouter_key_source?: "workspace" | "environment" | null }).openrouter_key_source) ?? null
      );
      setOpenRouterKeyHint(((data as { openrouter_key_hint?: string | null }).openrouter_key_hint) ?? null);
      toast.success(clear ? "Workspace OpenRouter key cleared" : "OpenRouter key saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update OpenRouter key");
    } finally {
      setCopilotBusy(false);
    }
  };

  const searchOpenRouterModels = async () => {
    if (!workspaceId) {
      toast.error("Select or create a workspace first");
      return;
    }
    setModelSearchBusy(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error("No session token");
        return;
      }
      const params = new URLSearchParams({
        q: modelSearch.trim(),
        limit: "12",
      });
      const res = await fetch(`/api/copilot/models?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Workspace-Id": workspaceId,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = data as { error?: string; detail?: string };
        toast.error(err.detail || err.error || `HTTP ${res.status}`);
        return;
      }
      setModelResults(((data as { models?: OpenRouterModel[] }).models ?? []).slice(0, 12));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not search models");
    } finally {
      setModelSearchBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Manage your profile, workspace, and appearance" />
      <div className="p-6 max-w-5xl">
        <Tabs defaultValue="roles" className="space-y-6">
          <TabsList className="grid grid-cols-4 gap-1 w-full max-w-5xl md:grid-cols-8">
            <TabsTrigger value="profile" className="gap-1.5">
              <User className="h-3.5 w-3.5" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="status" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              Status
            </TabsTrigger>
            <TabsTrigger value="design" className="gap-1.5">
              <Palette className="h-3.5 w-3.5" />
              Design
            </TabsTrigger>
            <TabsTrigger value="agents" className="gap-1.5">
              <Bot className="h-3.5 w-3.5" />
              Agents
            </TabsTrigger>
            <TabsTrigger value="copilot" className="gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Copilot
            </TabsTrigger>
            <TabsTrigger value="roles" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Roles
            </TabsTrigger>
            <TabsTrigger value="workspace" className="gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              Workspace
            </TabsTrigger>
            <TabsTrigger value="danger" className="gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" />
              Danger
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <section className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-sm font-semibold mb-4">Profile</h2>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    value={
                      clerkUser?.primaryEmailAddress?.emailAddress ?? authUser?.email ?? ""
                    }
                    disabled
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Display name</Label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div className="flex justify-between items-center gap-4 pt-2 border-t border-border">
                  <dt className="text-sm text-muted-foreground">User ID</dt>
                  <CopyId value={userId} label="User ID" />
                </div>
                <Button onClick={saveProfile} disabled={busyProfile || !clerkUser} size="sm">
                  {busyProfile ? "Saving…" : "Save profile"}
                </Button>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="status">
            <section className="rounded-lg border border-border bg-card p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold">Service status</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Live checks for the public website, API health route, and MCP gateway.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs",
                      statusSummary === "operational" &&
                        "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
                      statusSummary === "checking" &&
                        "border-muted bg-background text-muted-foreground",
                      statusSummary === "degraded" &&
                        "border-amber-500/30 bg-amber-500/10 text-amber-600"
                    )}
                  >
                    {statusSummary === "operational" ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : statusSummary === "checking" ? (
                      <Clock3 className="h-3.5 w-3.5" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    )}
                    {statusSummary === "operational"
                      ? "All systems operational"
                      : statusSummary === "checking"
                        ? "Checking"
                        : "Issues detected"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void runStatusChecks()}
                    disabled={statusBusy}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", statusBusy && "animate-spin")} />
                    Refresh
                  </Button>
                </div>
              </div>

              <div className="grid gap-3">
                {statusResults.map((result) => (
                  <div
                    key={result.id}
                    className="rounded-lg border border-border bg-background/50 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "h-2.5 w-2.5 rounded-full",
                              result.status === "operational" && "bg-emerald-500",
                              result.status === "checking" && "bg-muted-foreground animate-pulse",
                              result.status === "degraded" && "bg-amber-500"
                            )}
                          />
                          <h3 className="text-sm font-medium">{result.label}</h3>
                        </div>
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block truncate font-mono text-xs text-muted-foreground hover:text-primary"
                        >
                          {result.url}
                        </a>
                      </div>
                      <span
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-xs",
                          result.status === "operational" &&
                            "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
                          result.status === "checking" &&
                            "border-muted bg-background text-muted-foreground",
                          result.status === "degraded" &&
                            "border-amber-500/30 bg-amber-500/10 text-amber-600"
                        )}
                      >
                        {result.status === "operational"
                          ? "Operational"
                          : result.status === "checking"
                            ? "Checking"
                            : "Needs attention"}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-2 text-xs sm:grid-cols-4">
                      <div>
                        <div className="text-muted-foreground">HTTP</div>
                        <div className="font-mono">{result.httpStatus ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Expected</div>
                        <div className="font-mono">{result.expectedStatus}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Server</div>
                        <div className="font-mono">{result.server ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Latency</div>
                        <div className="font-mono">
                          {typeof result.latencyMs === "number" ? `${result.latencyMs} ms` : "—"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
                      <span>Last checked: {result.checkedAt ?? "—"}</span>
                      {result.error && <span className="text-amber-600">{result.error}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="design" className="space-y-6">
            <section className="rounded-lg border border-border bg-card p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold">Accent color</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Primary color for buttons, links, gradients.
                  </p>
                </div>
                <div
                  className="h-10 w-10 rounded-lg border border-border shadow-inner"
                  style={{ background: `hsl(${accent.h} ${accent.s}% ${accent.l}%)` }}
                />
              </div>
              <div className="flex flex-wrap gap-2 mb-6">
                {ACCENT_PRESETS.map((pr) => {
                  const active =
                    pr.hsl.h === accent.h && pr.hsl.s === accent.s && pr.hsl.l === accent.l;
                  return (
                    <button
                      key={pr.name}
                      onClick={() => pick(pr.hsl)}
                      className={cn(
                        "h-9 w-9 rounded-full border-2 flex items-center justify-center",
                        active ? "border-foreground" : "border-border"
                      )}
                      style={{ background: `hsl(${pr.hsl.h} ${pr.hsl.s}% ${pr.hsl.l}%)` }}
                      title={pr.name}
                    >
                      {active && <Check className="h-4 w-4 text-background" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 mb-4">
                <input
                  type="color"
                  value={accentHex}
                  onChange={(e) => pick(hexToHsl(e.target.value))}
                  className="h-10 w-14 rounded-md border border-border cursor-pointer"
                />
                <Input
                  value={accentHex.toUpperCase()}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{6}$/.test(v)) pick(hexToHsl(v));
                  }}
                  className="w-32 font-mono text-xs"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={persist}>
                  Save accent
                </Button>
                <Button size="sm" variant="ghost" onClick={reset}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Reset
                </Button>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="agents">
            <section className="rounded-lg border border-border bg-card p-6">
              <div className="mb-4">
                <h2 className="text-sm font-semibold">AI Agents</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Connect and manage agents. Access levels live under Roles.
                </p>
              </div>
              <AgentsManager embedded />
            </section>
          </TabsContent>

          <TabsContent value="copilot">
            <section className="rounded-lg border border-border bg-card p-6 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold">Copilot runtime</h2>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                    Server-side OpenRouter settings for the in-app Copilot. API keys are encrypted and never shown again.
                  </p>
                </div>
                <div className={cn(
                  "rounded-md border px-2.5 py-1 text-xs",
                  copilotConfigured
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-600"
                )}>
                  {copilotConfigured
                    ? `OpenRouter ${openRouterKeySource ?? "configured"} ${openRouterKeyHint ?? ""}`
                    : "OpenRouter key missing"}
                </div>
              </div>

              {copilotError && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {copilotError}
                </p>
              )}

              <div className="rounded-md border border-border bg-background/50 p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Label>OpenRouter API key</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Stored encrypted per workspace. The plaintext key is never returned to the browser.
                    </p>
                  </div>
                  {openRouterKeySource === "environment" && (
                    <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                      Netlify env fallback
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="password"
                    value={openRouterKey}
                    onChange={(e) => setOpenRouterKey(e.target.value)}
                    placeholder={openRouterKeyHint ? `Saved ${openRouterKeyHint}` : "sk-or-v1-... or the part after it"}
                    autoComplete="off"
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void saveOpenRouterKey(false)}
                    disabled={copilotBusy || !workspaceId}
                  >
                    Save key
                  </Button>
                  {openRouterKeySource === "workspace" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void saveOpenRouterKey(true)}
                      disabled={copilotBusy || !workspaceId}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-border bg-background/50 p-4 space-y-3">
                <div>
                  <Label>API endpoint</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Custom OpenAI-compatible endpoint URL. Leave empty to use OpenRouter (default).
                  </p>
                </div>
                <Input
                  value={copilotSettings.api_endpoint ?? ""}
                  onChange={(e) =>
                    setCopilotSettings((s) => ({ ...s, api_endpoint: e.target.value.trim() }))
                  }
                  placeholder="https://openrouter.ai/api/v1 (default)"
                  className="font-mono text-xs"
                />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select
                    value={customModel ? "custom" : copilotSettings.model}
                    onValueChange={(value) => {
                      if (value === "custom") {
                        setCustomModel(copilotSettings.model);
                        return;
                      }
                      setCustomModel("");
                      setCopilotSettings((s) => capTokensForModel(s, value));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_OPTIONS.map((model) => (
                        <SelectItem key={model.value} value={model.value}>
                          {model.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">Custom model slug</SelectItem>
                    </SelectContent>
                  </Select>
                  {customModel && (
                    <Input
                      value={customModel}
                      onChange={(e) => {
                        const model = e.target.value;
                        setCustomModel(model);
                        if (isFreeOpenRouterModel(model)) {
                          setCopilotSettings((s) => ({
                            ...s,
                            max_tokens: Math.min(s.max_tokens, FREE_MODEL_MAX_TOKENS),
                          }));
                        }
                      }}
                      placeholder="nvidia/nemotron-3-super-120b-a12b:free"
                      className="font-mono text-xs"
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    Example: <code className="text-[11px]">nvidia/nemotron-3-super-120b-a12b:free</code>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Max output tokens</Label>
                  <Input
                    type="number"
                    min={128}
                    max={8192}
                    value={copilotSettings.max_tokens}
                    onChange={(e) =>
                      setCopilotSettings((s) => ({
                        ...s,
                        max_tokens: Math.min(
                          Number(e.target.value),
                          isFreeOpenRouterModel(customModel.trim() || s.model) ? FREE_MODEL_MAX_TOKENS : 8192,
                        ),
                      }))
                    }
                  />
                  {isFreeOpenRouterModel(customModel.trim() || copilotSettings.model) && (
                    <p className="text-xs text-muted-foreground">
                      Free OpenRouter models are capped at {FREE_MODEL_MAX_TOKENS} output tokens in Memorify.
                    </p>
                  )}
                </div>

                <div className="space-y-3 md:col-span-2">
                  <div className="flex items-center justify-between gap-4">
                    <Label>Temperature</Label>
                    <span className="font-mono text-xs text-muted-foreground">
                      {copilotSettings.temperature.toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={2}
                    step={0.05}
                    value={[copilotSettings.temperature]}
                    onValueChange={([value]) =>
                      setCopilotSettings((s) => ({ ...s, temperature: value ?? s.temperature }))
                    }
                  />
                </div>
              </div>

              <div className="rounded-md border border-border bg-background/50 p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Label>Search OpenRouter models</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Uses your saved key and follows the ZDR filter when enabled.
                    </p>
                  </div>
                  <a
                    href="https://openrouter.ai/models"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                  >
                    Open catalog
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    placeholder="Search model name or slug"
                    className="font-mono text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void searchOpenRouterModels();
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void searchOpenRouterModels()}
                    disabled={modelSearchBusy || !workspaceId}
                  >
                    <Search className="h-3.5 w-3.5 mr-1.5" />
                    {modelSearchBusy ? "Searching..." : "Search"}
                  </Button>
                </div>
                {modelResults.length > 0 && (
                  <div className="space-y-2">
                    {modelResults.map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        className={cn(
                          "w-full rounded-md border border-border bg-card/60 p-3 text-left transition-colors hover:border-primary/50",
                          copilotSettings.model === model.id && !customModel && "border-primary bg-primary/5"
                        )}
                        onClick={() => {
                          setCustomModel("");
                          setCopilotSettings((s) => capTokensForModel(s, model.id));
                        }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium">{model.name}</span>
                          <code className="text-[11px] text-muted-foreground">{model.id}</code>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                          {model.context_length && <span>{model.context_length.toLocaleString()} ctx</span>}
                          {model.pricing?.prompt === "0" && model.pricing?.completion === "0" && <span>free</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background/50 p-3">
                  <div>
                    <Label>Zero Data Retention</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Route only to ZDR-capable provider endpoints.
                    </p>
                  </div>
                  <Switch
                    checked={copilotSettings.zdr}
                    onCheckedChange={(checked) =>
                      setCopilotSettings((s) => ({ ...s, zdr: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background/50 p-3">
                  <div>
                    <Label>Data Collection</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Deny provider-side collection for prompts and responses.
                    </p>
                  </div>
                  <Switch
                    checked={copilotSettings.data_collection === "deny"}
                    onCheckedChange={(checked) =>
                      setCopilotSettings((s) => ({ ...s, data_collection: checked ? "deny" : "allow" }))
                    }
                  />
                </div>
              </div>

              <div className="rounded-md border border-border bg-background/50 p-3 text-xs text-muted-foreground">
                ZDR protects the OpenRouter inference route. Connected MCP tools can still call third-party services with their own retention rules.
              </div>

              <Button size="sm" onClick={saveCopilotSettings} disabled={copilotBusy || !workspaceId}>
                {copilotBusy ? "Saving..." : "Save Copilot settings"}
              </Button>
            </section>
          </TabsContent>

          <TabsContent value="roles">
            <section className="rounded-lg border border-border bg-card p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold">Agent access roles</h2>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                    Per-agent gateway permissions. Stored in Neon (
                    <code className="text-[10px]">agents.access_level</code>
                    ), enforced on every{" "}
                    <code className="text-[10px]">/api/v1</code> call. IDs shown for debugging.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void reloadAgents()}
                  disabled={agentsLoading}
                >
                  Refresh
                </Button>
              </div>

              <div className="rounded-md border border-border bg-background/50 p-3 text-xs space-y-1 font-mono">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">workspace_id</span>
                  <CopyId value={workspaceId} label="Workspace ID" />
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">user_id</span>
                  <CopyId value={userId} label="User ID" />
                </div>
              </div>

              {!workspaceId && (
                <p className="text-xs text-amber-500">Select or create a workspace first.</p>
              )}
              {agentsError && <p className="text-xs text-destructive">{agentsError}</p>}
              {agentsLoading && (
                <p className="text-xs text-muted-foreground">Loading agents…</p>
              )}
              {!agentsLoading && workspaceId && agents.length === 0 && !agentsError && (
                <p className="text-xs text-muted-foreground">
                  No agents yet — create one under the Agents tab.
                </p>
              )}

              <ul className="space-y-3">
                {agents.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-lg border border-border p-4 space-y-3 bg-background/40"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{a.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.kind} · {a.status}
                        </div>
                      </div>
                      <CopyId value={a.id} label="Agent ID" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Access level</Label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={a.access_level || "full"}
                        disabled={savingAgentId === a.id}
                        onChange={(e) =>
                          void saveAgentAccess(a.id, e.target.value as AccessLevel)
                        }
                      >
                        {ACCESS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label} — {o.help}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-muted-foreground">
                        {agentsHelp[a.access_level] ||
                          ACCESS_OPTIONS.find((o) => o.value === a.access_level)?.help ||
                          ""}
                        {savingAgentId === a.id ? " · saving…" : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="text-[11px] text-muted-foreground border-t border-border pt-3 space-y-1">
                <p>
                  <strong className="text-foreground">Debug:</strong> denied calls → HTTP 403 with{" "}
                  <code>agent_id</code>, <code>workspace_id</code>, <code>access_level</code>,{" "}
                  <code>action</code>.
                </p>
                <p>
                  SQL:{" "}
                  <code className="text-[10px]">
                    SELECT id, name, access_level FROM agents WHERE workspace_id = &apos;org_…&apos;;
                  </code>
                </p>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="workspace">
            <section className="rounded-lg border border-border bg-card p-6 space-y-5">
              <div>
                <h2 className="text-sm font-semibold">Workspace</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Clerk organization. Neon mirrors as{" "}
                  <code className="text-[10px]">workspace_id</code>.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Workspace name</Label>
                <Input
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  disabled={!organization || !canManageOrg}
                  placeholder={organization ? "Workspace name" : "No organization selected"}
                />
              </div>
              <Button
                size="sm"
                onClick={saveWorkspace}
                disabled={busyWs || !organization || !canManageOrg}
              >
                {busyWs ? "Saving…" : "Save workspace name"}
              </Button>
              <dl className="text-sm space-y-3 pt-2 border-t border-border">
                <div className="flex justify-between gap-4 items-center">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd>Free</dd>
                </div>
                <div className="flex justify-between gap-4 items-center">
                  <dt className="text-muted-foreground">Role</dt>
                  <dd className="font-mono text-xs">{role ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4 items-start">
                  <dt className="text-muted-foreground">Workspace ID</dt>
                  <dd>
                    <CopyId value={workspaceId} label="Workspace ID" />
                  </dd>
                </div>
                <div className="flex justify-between gap-4 items-start">
                  <dt className="text-muted-foreground">User ID</dt>
                  <dd>
                    <CopyId value={userId} label="User ID" />
                  </dd>
                </div>
                {neonSync && (
                  <div className="flex justify-between gap-4 items-center">
                    <dt className="text-muted-foreground">Neon</dt>
                    <dd className="text-xs text-muted-foreground">{neonSync}</dd>
                  </div>
                )}
              </dl>
            </section>
          </TabsContent>

          <TabsContent value="danger">
            <section className="rounded-lg border border-destructive/40 bg-card p-6">
              <h2 className="text-sm font-semibold mb-2">Danger zone</h2>
              <p className="text-xs text-muted-foreground mb-4">Sign out of Memorify.</p>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
              >
                Sign out
              </Button>
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
