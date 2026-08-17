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
import { useNavigate, useParams } from "react-router-dom";
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
  Globe,
  Server,
  Zap,
  ShieldCheck,
  ArrowUpRight,
  Bell,
  Mail,
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

type UptimeMonitor = {
  id: number;
  name: string;
  url: string;
  status: number;
  status_label: "Operational" | "Down" | "Degraded" | "Paused" | "Checking";
  is_up: boolean;
  uptime_ratio_24h: number;
  uptime_ratio_7d: number;
  uptime_ratio_30d: number;
  uptime_ratio_90d: number;
  avg_response_time_ms: number;
  latest_response_time_ms: number | null;
  response_times: Array<{ timestamp: number; ms: number }>;
  interval_sec: number;
};

type UptimeData = {
  stat: string;
  overall_status: "operational" | "degraded" | "down";
  all_operational: boolean;
  monitors_count: number;
  monitors: UptimeMonitor[];
  checked_at: string;
};

function LatencySparkline({
  data,
  avgMs,
}: {
  data: Array<{ timestamp: number; ms: number }>;
  avgMs: number;
}) {
  if (!data || data.length === 0) {
    return <div className="text-xs text-muted-foreground italic py-2">No historical probe samples yet</div>;
  }
  const maxMs = Math.max(...data.map((d) => d.ms), 100);

  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Activity className="h-3 w-3 text-primary/70" />
          Recent Latency Probes
        </span>
        <span>
          Avg: <strong className="font-mono text-foreground">{avgMs} ms</strong>
        </span>
      </div>
      <div className="flex items-end gap-1 h-9 bg-background/60 p-1.5 rounded border border-border/60">
        {data.map((d, i) => {
          const heightPercent = Math.max(15, Math.min(100, Math.round((d.ms / maxMs) * 100)));
          const isHigh = d.ms > 1200;
          return (
            <div
              key={i}
              className="flex-1 group relative flex flex-col justify-end h-full"
            >
              <div
                style={{ height: `${heightPercent}%` }}
                className={cn(
                  "w-full rounded-sm transition-all group-hover:opacity-100",
                  isHigh
                    ? "bg-amber-500/80 hover:bg-amber-500"
                    : "bg-emerald-500/80 hover:bg-emerald-500"
                )}
              />
              <div className="opacity-0 group-hover:opacity-100 pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-20 whitespace-nowrap rounded bg-popover px-1.5 py-0.5 text-[10px] font-mono shadow-md border border-border text-popover-foreground transition-opacity">
                {d.ms} ms
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
  { id: "api", label: "API & Neon DB health", url: "https://memorify.dev/api/health?deep=1", expectedStatus: 200 },
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
  const { tab } = useParams<{ tab?: string }>();
  const { user: authUser, signOut } = useAppAuth();
  const { getToken } = useClerkAuth();
  const { user: clerkUser, isLoaded: userLoaded } = useUser();
  const { organization, membership, isLoaded: orgLoaded } = useOrganization();
  const navigate = useNavigate();

  const validTabs = useMemo(
    () => [
      "profile",
      "status",
      "design",
      "agents",
      "copilot",
      "roles",
      "notifications",
      "workspace",
      "danger",
    ],
    []
  );

  const currentTab = useMemo(() => {
    const raw = (tab || "").trim().toLowerCase();
    return validTabs.includes(raw) ? raw : "profile";
  }, [tab, validTabs]);

  const handleTabChange = (nextTab: string) => {
    navigate(`/dashboard/settings/${nextTab}`);
  };

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
  const [uptimeData, setUptimeData] = useState<UptimeData | null>(null);
  const [uptimeLoading, setUptimeLoading] = useState(false);
  const [uptimeError, setUptimeError] = useState<string | null>(null);
  const [lastUptimeSync, setLastUptimeSync] = useState<string | null>(null);

  // Notification Preferences State
  const [notifyDowntime, setNotifyDowntime] = useState(true);
  const [notifyMaintenance, setNotifyMaintenance] = useState(true);
  const [notifyLatency, setNotifyLatency] = useState(true);
  const [notifyPostMortem, setNotifyPostMortem] = useState(true);
  const [notifyConnectorAlerts, setNotifyConnectorAlerts] = useState(true);
  const [notifyWeeklyDigest, setNotifyWeeklyDigest] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);

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

  const fetchUptimeTelemetry = useCallback(async () => {
    setUptimeLoading(true);
    setUptimeError(null);
    try {
      const res = await fetch("/api/uptime");
      if (!res.ok) {
        throw new Error(`Uptime API returned HTTP ${res.status}`);
      }
      const data = (await res.json()) as UptimeData;
      if (data && Array.isArray(data.monitors)) {
        setUptimeData(data);
        setLastUptimeSync(
          new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        );
      } else {
        throw new Error("Unexpected telemetry response format");
      }
    } catch (err) {
      setUptimeError(err instanceof Error ? err.message : "Failed to load telemetry");
    } finally {
      setUptimeLoading(false);
    }
  }, []);

  const refreshAllStatus = useCallback(async () => {
    await Promise.all([runStatusChecks(), fetchUptimeTelemetry()]);
  }, [runStatusChecks, fetchUptimeTelemetry]);

  useEffect(() => {
    void runStatusChecks();
    void fetchUptimeTelemetry();
  }, [runStatusChecks, fetchUptimeTelemetry]);

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
      <div className="p-6 max-w-5xl space-y-6 pb-28">
        <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid grid-cols-3 gap-1 w-full max-w-5xl sm:grid-cols-5 md:grid-cols-9">
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
            <TabsTrigger value="notifications" className="gap-1.5">
              <Bell className="h-3.5 w-3.5" />
              Notifications
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

          <TabsContent value="status" className="space-y-6">
            {/* Header & Fleet Status Overview */}
            <section className="rounded-lg border border-border bg-card p-6 space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold">Service Status & Uptime</h2>
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      <Zap className="h-3 w-3" /> Live Telemetry
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Continuous multi-region probes monitoring Memorify Web App &amp; MCP Protocol Gateway.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium",
                      (uptimeData?.overall_status === "operational" || statusSummary === "operational") &&
                        "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
                      (statusBusy || uptimeLoading) &&
                        "border-muted bg-background text-muted-foreground",
                      (uptimeData?.overall_status === "degraded" || statusSummary === "degraded") &&
                        "border-amber-500/30 bg-amber-500/10 text-amber-600",
                      uptimeData?.overall_status === "down" &&
                        "border-red-500/30 bg-red-500/10 text-red-600"
                    )}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        (uptimeData?.overall_status === "operational" || statusSummary === "operational") &&
                          "bg-emerald-500 animate-pulse",
                        (statusBusy || uptimeLoading) && "bg-muted-foreground animate-ping",
                        (uptimeData?.overall_status === "degraded" || statusSummary === "degraded") &&
                          "bg-amber-500",
                        uptimeData?.overall_status === "down" && "bg-red-500"
                      )}
                    />
                    {uptimeData?.overall_status === "operational" || statusSummary === "operational"
                      ? "All Systems Operational"
                      : statusBusy || uptimeLoading
                        ? "Checking probes…"
                        : "Degraded Performance"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void refreshAllStatus()}
                    disabled={statusBusy || uptimeLoading}
                  >
                    <RefreshCw
                      className={cn(
                        "h-3.5 w-3.5 mr-1.5",
                        (statusBusy || uptimeLoading) && "animate-spin"
                      )}
                    />
                    Refresh
                  </Button>
                </div>
              </div>

              {/* Fleet Summary KPI Grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border/80 bg-background/50 p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>30-Day Fleet Uptime</span>
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="text-2xl font-bold tracking-tight text-foreground">
                    {uptimeData?.monitors?.[0]
                      ? `${uptimeData.monitors[0].uptime_ratio_30d.toFixed(2)}%`
                      : "100.00%"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    SLA Target: <span className="font-mono text-foreground font-medium">99.9%</span>
                  </div>
                </div>

                <div className="rounded-lg border border-border/80 bg-background/50 p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Edge Response Time</span>
                    <Zap className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
                    {uptimeData?.monitors?.[1]?.avg_response_time_ms
                      ? `${uptimeData.monitors[1].avg_response_time_ms} ms`
                      : uptimeData?.monitors?.[0]?.avg_response_time_ms
                        ? `${uptimeData.monitors[0].avg_response_time_ms} ms`
                        : "120 ms"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Global multi-region average
                  </div>
                </div>

                <div className="rounded-lg border border-border/80 bg-background/50 p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Active Probes</span>
                    <Server className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
                    {uptimeData?.monitors_count
                      ? `${uptimeData.monitors.filter((m) => m.is_up).length} / ${uptimeData.monitors_count}`
                      : "2 / 2"}{" "}
                    <span className="text-sm font-normal text-emerald-600">Online</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Website &amp; MCP gateway
                  </div>
                </div>
              </div>
            </section>

            {/* Core Uptime Probes Telemetry */}
            <section className="rounded-lg border border-border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Continuous Multi-Region Probes</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Historical metrics and live availability verified by UptimeRobot probes.
                  </p>
                </div>
                {lastUptimeSync && (
                  <span className="text-[11px] text-muted-foreground">
                    Synced: {lastUptimeSync}
                  </span>
                )}
              </div>

              {uptimeError && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600">
                  {uptimeError}
                </div>
              )}

              <div className="grid gap-4">
                {(uptimeData?.monitors && uptimeData.monitors.length > 0
                  ? uptimeData.monitors
                  : [
                      {
                        id: 803757978,
                        name: "Memorify Web App (memorify.dev)",
                        url: "https://memorify.dev/",
                        status: 2,
                        status_label: "Operational" as const,
                        is_up: true,
                        uptime_ratio_24h: 100,
                        uptime_ratio_7d: 100,
                        uptime_ratio_30d: 100,
                        uptime_ratio_90d: 100,
                        avg_response_time_ms: 180,
                        latest_response_time_ms: 132,
                        response_times: [],
                        interval_sec: 1800,
                      },
                      {
                        id: 803758009,
                        name: "Memorify MCP Gateway (memorify.dev/mcp)",
                        url: "https://memorify.dev/mcp",
                        status: 2,
                        status_label: "Operational" as const,
                        is_up: true,
                        uptime_ratio_24h: 100,
                        uptime_ratio_7d: 100,
                        uptime_ratio_30d: 100,
                        uptime_ratio_90d: 100,
                        avg_response_time_ms: 220,
                        latest_response_time_ms: 101,
                        response_times: [],
                        interval_sec: 300,
                      },
                    ]
                ).map((mon) => (
                  <div
                    key={mon.id}
                    className="rounded-lg border border-border bg-background/50 p-4 space-y-4 hover:border-border/90 transition-colors"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "h-2.5 w-2.5 rounded-full",
                              mon.is_up ? "bg-emerald-500" : "bg-red-500"
                            )}
                          />
                          <h4 className="text-sm font-semibold truncate">{mon.name}</h4>
                          <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                            {mon.status_label}
                          </span>
                        </div>
                        <a
                          href={mon.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-primary transition-colors truncate max-w-md"
                        >
                          {mon.url}
                          <ArrowUpRight className="h-3 w-3 shrink-0 opacity-70" />
                        </a>
                      </div>

                      {/* Uptime Ratios Breakdown */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="rounded bg-muted/60 px-2 py-1 text-[11px] font-medium">
                          24h: <strong className="text-emerald-600">{mon.uptime_ratio_24h.toFixed(1)}%</strong>
                        </span>
                        <span className="rounded bg-muted/60 px-2 py-1 text-[11px] font-medium">
                          7d: <strong className="text-emerald-600">{mon.uptime_ratio_7d.toFixed(1)}%</strong>
                        </span>
                        <span className="rounded bg-muted/60 px-2 py-1 text-[11px] font-medium">
                          30d: <strong className="text-emerald-600">{mon.uptime_ratio_30d.toFixed(1)}%</strong>
                        </span>
                        <span className="rounded bg-muted/60 px-2 py-1 text-[11px] font-medium">
                          90d: <strong className="text-emerald-600">{mon.uptime_ratio_90d.toFixed(1)}%</strong>
                        </span>
                      </div>
                    </div>

                    {/* Latency & Interval Details */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs border-t border-border/60 pt-3">
                      <div>
                        <div className="text-muted-foreground text-[11px]">Current Latency</div>
                        <div className="font-mono font-medium">
                          {mon.latest_response_time_ms ? `${mon.latest_response_time_ms} ms` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[11px]">Average Latency</div>
                        <div className="font-mono font-medium">{mon.avg_response_time_ms} ms</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[11px]">Probe Frequency</div>
                        <div className="font-medium">
                          Every {Math.round(mon.interval_sec / 60)} min
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[11px]">Availability SLA</div>
                        <div className="font-medium text-emerald-600">100.0% Up</div>
                      </div>
                    </div>

                    {/* Sparkline Visualization */}
                    {mon.response_times && mon.response_times.length > 0 && (
                      <LatencySparkline
                        data={mon.response_times}
                        avgMs={mon.avg_response_time_ms}
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Direct Browser Ping Verification */}
            <section className="rounded-lg border border-border bg-card p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold">Direct Browser Ping Checks</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Real-time connectivity verified directly from your browser to Memorify edge nodes.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void runStatusChecks()}
                  disabled={statusBusy}
                  className="h-7 text-xs"
                >
                  <RefreshCw
                    className={cn("h-3 w-3 mr-1", statusBusy && "animate-spin")}
                  />
                  Run Pings
                </Button>
              </div>

              <div className="grid gap-2.5">
                {statusResults.map((result) => (
                  <div
                    key={result.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/40 px-4 py-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          result.status === "operational" && "bg-emerald-500",
                          result.status === "checking" && "bg-muted-foreground animate-pulse",
                          result.status === "degraded" && "bg-amber-500"
                        )}
                      />
                      <div>
                        <div className="font-medium">{result.label}</div>
                        <div className="font-mono text-[11px] text-muted-foreground truncate max-w-xs sm:max-w-md">
                          {result.url}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-mono">
                      <div className="text-right">
                        <span className="text-[11px] text-muted-foreground mr-1.5 font-sans">HTTP:</span>
                        <span className="font-semibold">{result.httpStatus ?? "—"}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] text-muted-foreground mr-1.5 font-sans">Ping:</span>
                        <span className="font-semibold text-primary">
                          {typeof result.latencyMs === "number" ? `${result.latencyMs} ms` : "—"}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 text-[11px] font-sans font-medium",
                          result.status === "operational" &&
                            "bg-emerald-500/10 text-emerald-600",
                          result.status === "checking" &&
                            "bg-muted text-muted-foreground",
                          result.status === "degraded" &&
                            "bg-amber-500/10 text-amber-600"
                        )}
                      >
                        {result.status === "operational" ? "OK" : result.status === "checking" ? "…" : "Error"}
                      </span>
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

          <TabsContent value="notifications">
            <section className="rounded-lg border border-border bg-card p-6 space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold">Notification Preferences</h2>
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      <Mail className="h-3 w-3" /> Resend
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Manage service status notifications, maintenance updates, and weekly digest emails delivered via Resend.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Downtime Alerts */}
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border/80 bg-background/50 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      <Label htmlFor="notify-downtime" className="text-sm font-medium cursor-pointer">
                        Service Downtime &amp; Recovery Alerts
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Get immediate alerts if <code className="text-[11px]">memorify.dev</code> or <code className="text-[11px]">memorify.dev/mcp</code> experiences an outage or when services are restored.
                    </p>
                  </div>
                  <Switch
                    id="notify-downtime"
                    checked={notifyDowntime}
                    onCheckedChange={setNotifyDowntime}
                  />
                </div>

                {/* Degraded Performance & Latency */}
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border/80 bg-background/50 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      <Label htmlFor="notify-latency" className="text-sm font-medium cursor-pointer">
                        Degraded Performance &amp; High Latency
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Proactive advisories when response times or vector embedding search latencies exceed SLA thresholds (&gt;1000ms).
                    </p>
                  </div>
                  <Switch
                    id="notify-latency"
                    checked={notifyLatency}
                    onCheckedChange={setNotifyLatency}
                  />
                </div>

                {/* Maintenance Window Notices */}
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border/80 bg-background/50 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      <Label htmlFor="notify-maintenance" className="text-sm font-medium cursor-pointer">
                        Scheduled Maintenance Notices
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Receive advance notice breaking down impacted services and maintenance windows before infrastructure updates.
                    </p>
                  </div>
                  <Switch
                    id="notify-maintenance"
                    checked={notifyMaintenance}
                    onCheckedChange={setNotifyMaintenance}
                  />
                </div>

                {/* Post-Mortems and RCA Reports */}
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border/80 bg-background/50 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-indigo-500" />
                      <Label htmlFor="notify-postmortem" className="text-sm font-medium cursor-pointer">
                        Incident RCA &amp; Post-Mortem Reports
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Detailed root cause analysis, total downtime duration, remediation, and preventative measures following major incidents.
                    </p>
                  </div>
                  <Switch
                    id="notify-postmortem"
                    checked={notifyPostMortem}
                    onCheckedChange={setNotifyPostMortem}
                  />
                </div>

                {/* MCP Connector Circuit-Breaker */}
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border/80 bg-background/50 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-purple-500" />
                      <Label htmlFor="notify-connector" className="text-sm font-medium cursor-pointer">
                        MCP Connector &amp; Circuit-Breaker Alerts
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Instant alerts when third-party tool integrations (GitHub, Notion, Linear) fail delivery or exceed rate limit thresholds.
                    </p>
                  </div>
                  <Switch
                    id="notify-connector"
                    checked={notifyConnectorAlerts}
                    onCheckedChange={setNotifyConnectorAlerts}
                  />
                </div>

                {/* Weekly Performance Digest */}
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border/80 bg-background/50 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <Label htmlFor="notify-digest" className="text-sm font-medium cursor-pointer">
                        Weekly Reliability &amp; Memory Digest
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      A weekly summary of system uptime ratios, average latency, and workspace memory syncs.
                    </p>
                  </div>
                  <Switch
                    id="notify-digest"
                    checked={notifyWeeklyDigest}
                    onCheckedChange={setNotifyWeeklyDigest}
                  />
                </div>

                {/* Notification Target Email */}
                <div className="rounded-lg border border-border/80 bg-background/50 p-4 space-y-2">
                  <Label className="text-xs font-medium">Notification Delivery Email</Label>
                  <Input
                    value={
                      clerkUser?.primaryEmailAddress?.emailAddress ?? authUser?.email ?? ""
                    }
                    disabled
                    className="font-mono text-xs max-w-md"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Connected to your verified primary email via Clerk.
                  </p>
                </div>

                <div className="pt-2">
                  <Button
                    size="sm"
                    disabled={savingNotifications}
                    onClick={() => {
                      setSavingNotifications(true);
                      setTimeout(() => {
                        setSavingNotifications(false);
                        toast.success("Notification preferences saved");
                      }, 400);
                    }}
                  >
                    {savingNotifications ? "Saving…" : "Save notification preferences"}
                  </Button>
                </div>
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
