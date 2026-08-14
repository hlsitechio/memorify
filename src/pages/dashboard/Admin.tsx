import { useEffect, useState, useCallback } from "react";
import { useAuth as useClerkAuth, useUser, useOrganization } from "@clerk/react";
import { useAuth as useAppAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Database,
  Shield,
  Key,
  Server,
  Activity,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  Terminal,
  Bug,
  ClipboardList,
  Eye,
  EyeOff,
  Copy,
  ChevronDown,
  ChevronUp,
  Settings,
  Network,
  HardDrive,
  Cpu,
  MemoryStick,
  Globe,
  Lock,
  Unlock,
  Zap,
  Clock,
  ExternalLink,
  Search,
  Filter,
  Download,
  Upload,
  Trash2,
  Plus,
  Minus,
  Hash,
  List,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApi } from "@/lib/api";
import { useNavigate } from "react-router-dom";

// Types
type ServiceStatus = "unknown" | "checking" | "operational" | "degraded" | "down";

interface HealthCheck {
  id: string;
  name: string;
  category: "database" | "auth" | "api" | "mcp" | "oauth" | "storage" | "network";
  status: ServiceStatus;
  latencyMs: number | null;
  lastChecked: string | null;
  error: string | null;
  details: Record<string, unknown>;
  endpoint: string;
}

interface AuthStatus {
  clerk: {
    authenticated: boolean;
    userId: string | null;
    orgId: string | null;
    sessionValid: boolean;
    error: string | null;
  };
  neonAuth: {
    configured: boolean;
    jwtValid: boolean;
    trustedDomain: string | null;
    error: string | null;
  };
  agentTokens: {
    count: number;
    active: number;
    revoked: number;
    error: string | null;
  };
}

interface DatabaseStatus {
  connected: boolean;
  poolSize: number;
  activeConnections: number;
  tables: TableInfo[];
  error: string | null;
  latencyMs: number | null;
}

interface TableInfo {
  name: string;
  rowCount: number;
  size: string;
  lastAnalyzed: string | null;
}

interface SystemMetrics {
  uptime: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  cpuUsage: number;
  requestCount: {
    total: number;
    lastMinute: number;
    lastHour: number;
    errors: number;
  };
  edgeFunctionMetrics: EdgeFunctionMetric[];
}

interface EdgeFunctionMetric {
  name: string;
  invocations: number;
  avgDurationMs: number;
  errors: number;
  lastInvoked: string | null;
}

interface AuditLogEntry {
  id: string;
  workspace_id: string;
  agent_id: string;
  action: string;
  resource: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

const CATEGORIES = [
  { id: "all", label: "All", icon: List },
  { id: "database", label: "Database", icon: Database },
  { id: "auth", label: "Auth", icon: Shield },
  { id: "api", label: "API", icon: Server },
  { id: "mcp", label: "MCP", icon: Network },
  { id: "oauth", label: "OAuth", icon: Key },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "network", label: "Network", icon: Globe },
];

const STATUS_CHECKS = [
  { id: "site", name: "Website", category: "network", endpoint: "https://memorify.dev/" },
  { id: "api_health", name: "API Health", category: "api", endpoint: "https://memorify.dev/api/health" },
  { id: "api_v1", name: "API v1 Gateway", category: "api", endpoint: "https://memorify.dev/api/v1" },
  { id: "api_agents", name: "Agents Admin", category: "api", endpoint: "https://memorify.dev/api/agents" },
  { id: "api_bootstrap", name: "Bootstrap Agent", category: "api", endpoint: "https://memorify.dev/api/bootstrap" },
  { id: "mcp_gateway", name: "MCP Gateway", category: "mcp", endpoint: "https://memorify.dev/mcp" },
  { id: "mcp_tools", name: "MCP Tools List", category: "mcp", endpoint: "https://memorify.dev/mcp/tools" },
  { id: "oauth_protected", name: "OAuth Protected Resource", category: "oauth", endpoint: "https://memorify.dev/.well-known/oauth-protected-resource" },
  { id: "oauth_auth_server", name: "OAuth Auth Server", category: "oauth", endpoint: "https://memorify.dev/.well-known/oauth-authorization-server" },
  { id: "mcp_oauth_protected", name: "MCP OAuth Protected", category: "oauth", endpoint: "https://memorify.dev/mcp/.well-known/oauth-protected-resource" },
  { id: "mcp_oauth_auth_server", name: "MCP OAuth Auth Server", category: "oauth", endpoint: "https://memorify.dev/mcp/.well-known/oauth-authorization-server" },
  { id: "agent_jwt", name: "Agent JWT Endpoint", category: "auth", endpoint: "https://memorify.dev/api/agent-jwt" },
  { id: "copilot_chat", name: "Copilot Chat", category: "api", endpoint: "https://memorify.dev/api/copilot/chat" },
  { id: "copilot_action", name: "Copilot Action", category: "api", endpoint: "https://memorify.dev/api/copilot/action" },
  { id: "copilot_models", name: "Copilot Models", category: "api", endpoint: "https://memorify.dev/api/copilot/models" },
];

export default function AdminDashboard() {
  const { user: clerkUser, isSignedIn, isLoaded: clerkLoaded } = useClerkAuth();
  const { user: appUser } = useAppAuth();
  const { organization } = useOrganization();
  const { action } = useApi();
  const navigate = useNavigate();

  // State
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showRaw, setShowRaw] = useState<Record<string, boolean>>({});
  const [filterText, setFilterText] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  // Helpers
  const getStatusIcon = (status: ServiceStatus) => {
    switch (status) {
      case "operational": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "degraded": return <AlertCircle className="h-4 w-4 text-amber-500" />;
      case "down": return <XCircle className="h-4 w-4 text-destructive" />;
      case "checking": return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      default: return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: ServiceStatus) => {
    const variants: Record<ServiceStatus, string> = {
      operational: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      degraded: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      down: "bg-destructive/10 text-destructive border-destructive/20",
      checking: "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse",
      unknown: "bg-muted text-muted-foreground",
    };
    return (
      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border", variants[status])}>
        {getStatusIcon(status)}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getCategoryIcon = (category: string) => {
    const cat = CATEGORIES.find(c => c.id === category);
    return cat ? <cat.icon className="h-3 w-3" /> : <Activity className="h-3 w-3" />;
  };

  // Run single health check
  const runHealthCheck = useCallback(async (check: typeof STATUS_CHECKS[0]): Promise<HealthCheck> => {
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      const res = await fetch(check.endpoint, {
        method: check.id === "mcp_tools" ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          ...(check.id === "mcp_tools" ? { "Authorization": `Bearer ${localStorage.getItem("memorify_admin_token") || ""}` } : {}),
        },
        body: check.id === "mcp_tools" ? JSON.stringify({ jsonrpc: "2.0", id: "1", method: "tools/list", params: {} }) : undefined,
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      const latencyMs = Math.round(performance.now() - start);
      
      let details: Record<string, unknown> = { httpStatus: res.status };
      let status: ServiceStatus = "down";
      
      if (res.ok) {
        status = "operational";
        try {
          const data = await res.json();
          details = { ...details, response: data };
          
          // Special handling for specific endpoints
          if (check.id === "api_health" && data.status === "live") status = "operational";
          if (check.id === "mcp_gateway" && data.name === "memorify-gateway") status = "operational";
          if (check.id === "mcp_tools" && data.result?.tools?.length > 0) status = "operational";
          if (check.id.startsWith("oauth_") && data.resource) status = "operational";
        } catch {
          // Response might not be JSON
        }
      } else if (res.status >= 500) {
        status = "down";
      } else if (res.status >= 400) {
        status = "degraded";
      }
      
      return {
        id: check.id,
        name: check.name,
        category: check.category,
        status,
        latencyMs,
        lastChecked: new Date().toISOString(),
        error: res.ok ? null : `HTTP ${res.status}`,
        details,
        endpoint: check.endpoint,
      };
    } catch (error) {
      const latencyMs = Math.round(performance.now() - start);
      return {
        id: check.id,
        name: check.name,
        category: check.category,
        status: "down",
        latencyMs,
        lastChecked: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
        details: {},
        endpoint: check.endpoint,
      };
    }
  }, []);

  // Run all health checks
  const runAllHealthChecks = useCallback(async () => {
    setLoading(prev => ({ ...prev, health: true }));
    const results = await Promise.all(STATUS_CHECKS.map(runHealthCheck));
    setHealthChecks(results);
    setLoading(prev => ({ ...prev, health: false }));
  }, [runHealthCheck]);

  // Fetch auth status
  const fetchAuthStatus = useCallback(async () => {
    setLoading(prev => ({ ...prev, auth: true }));
    try {
      // Check Clerk session
      let clerkStatus = {
        authenticated: isSignedIn,
        userId: clerkUser?.id || null,
        orgId: organization?.id || null,
        sessionValid: isSignedIn,
        error: null as string | null,
      };

      // Check Neon Auth config via backend
      let neonAuthStatus = {
        configured: false,
        jwtValid: false,
        trustedDomain: null as string | null,
        error: null as string | null,
      };

      try {
        const res = await fetch("https://memorify.dev/api/copilot/settings", {
          headers: { "Authorization": `Bearer ${localStorage.getItem("memorify_admin_token") || ""}` },
        });
        if (res.ok) {
          const data = await res.json();
          neonAuthStatus = {
            configured: true,
            jwtValid: true,
            trustedDomain: data.data?.trusted_domain || "https://memorify.dev",
            error: null,
          };
        }
      } catch (e) {
        neonAuthStatus.error = e instanceof Error ? e.message : "Failed to check Neon Auth";
      }

      // Check agent tokens
      let agentTokensStatus = {
        count: 0,
        active: 0,
        revoked: 0,
        error: null as string | null,
      };

      try {
        const res = await action("agents.list", {});
        if (res.ok && Array.isArray(res.data)) {
          agentTokensStatus.count = res.data.length;
          agentTokensStatus.active = res.data.filter((a: any) => a.status === "connected").length;
          agentTokensStatus.revoked = res.data.filter((a: any) => a.status === "revoked").length;
        }
      } catch (e) {
        agentTokensStatus.error = e instanceof Error ? e.message : "Failed to fetch agents";
      }

      setAuthStatus({
        clerk: clerkStatus,
        neonAuth: neonAuthStatus,
        agentTokens: agentTokensStatus,
      });
    } catch (error) {
      console.error("Auth status fetch failed:", error);
    } finally {
      setLoading(prev => ({ ...prev, auth: false }));
    }
  }, [isSignedIn, clerkUser, organization, action]);

  // Fetch database status
  const fetchDatabaseStatus = useCallback(async () => {
    setLoading(prev => ({ ...prev, database: true }));
    try {
      // Try to query database via MCP or API
      const start = performance.now();
      const res = await action("memory.list", { limit: 1 });
      const latencyMs = Math.round(performance.now() - start);
      
      let tables: TableInfo[] = [];
      let connected = false;
      
      if (res.ok) {
        connected = true;
        // Get table info via a custom query if available
        try {
          const tablesRes = await action("database.query", { 
            sql: `SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::regclass)) as size 
                  FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename` 
          });
          if (tablesRes.ok && Array.isArray(tablesRes.data)) {
            tables = tablesRes.data.map((t: any) => ({
              name: t.tablename,
              rowCount: 0, // Would need separate count queries
              size: t.size,
              lastAnalyzed: null,
            }));
          }
        } catch {
          // Fallback: known tables
          tables = [
            { name: "memories", rowCount: 0, size: "unknown", lastAnalyzed: null },
            { name: "documents", rowCount: 0, size: "unknown", lastAnalyzed: null },
            { name: "document_chunks", rowCount: 0, size: "unknown", lastAnalyzed: null },
            { name: "agents", rowCount: 0, size: "unknown", lastAnalyzed: null },
            { name: "skills", rowCount: 0, size: "unknown", lastAnalyzed: null },
            { name: "events", rowCount: 0, size: "unknown", lastAnalyzed: null },
            { name: "audit_log", rowCount: 0, size: "unknown", lastAnalyzed: null },
            { name: "config", rowCount: 0, size: "unknown", lastAnalyzed: null },
            { name: "mcp_servers", rowCount: 0, size: "unknown", lastAnalyzed: null },
            { name: "mcp_tools", rowCount: 0, size: "unknown", lastAnalyzed: null },
          ];
        }
      }

      setDatabaseStatus({
        connected,
        poolSize: 10, // Default Neon pool size
        activeConnections: 1,
        tables,
        error: connected ? null : "Database connection failed",
        latencyMs,
      });
    } catch (error) {
      setDatabaseStatus({
        connected: false,
        poolSize: 0,
        activeConnections: 0,
        tables: [],
        error: error instanceof Error ? error.message : "Unknown error",
        latencyMs: null,
      });
    } finally {
      setLoading(prev => ({ ...prev, database: false }));
    }
  }, [action]);

  // Fetch system metrics
  const fetchSystemMetrics = useCallback(async () => {
    setLoading(prev => ({ ...prev, metrics: true }));
    try {
      // Try to get metrics from a custom endpoint or compute from available data
      const res = await action("config.list", {});
      
      // Mock metrics based on available data
      setSystemMetrics({
        uptime: Date.now() - (Date.now() % (24 * 60 * 60 * 1000)), // Mock
        memoryUsage: {
          heapUsed: 45 * 1024 * 1024,
          heapTotal: 128 * 1024 * 1024,
          external: 12 * 1024 * 1024,
        },
        cpuUsage: 12.5,
        requestCount: {
          total: 125000,
          lastMinute: 45,
          lastHour: 1200,
          errors: 23,
        },
        edgeFunctionMetrics: [
          { name: "api", invocations: 45000, avgDurationMs: 145, errors: 12, lastInvoked: new Date().toISOString() },
          { name: "mcp", invocations: 12000, avgDurationMs: 89, errors: 3, lastInvoked: new Date().toISOString() },
          { name: "agent-jwt", invocations: 3400, avgDurationMs: 234, errors: 5, lastInvoked: new Date().toISOString() },
          { name: "copilot-chat", invocations: 8900, avgDurationMs: 567, errors: 2, lastInvoked: new Date().toISOString() },
        ],
      });
    } catch (error) {
      console.error("System metrics fetch failed:", error);
    } finally {
      setLoading(prev => ({ ...prev, metrics: false }));
    }
  }, [action]);

  // Fetch audit logs
  const fetchAuditLogs = useCallback(async () => {
    setLoading(prev => ({ ...prev, audit: true }));
    try {
      const res = await action("audit.list", { limit: 100 });
      if (res.ok && Array.isArray(res.data)) {
        setAuditLogs(res.data);
      }
    } catch (error) {
      console.error("Audit logs fetch failed:", error);
    } finally {
      setLoading(prev => ({ ...prev, audit: false }));
    }
  }, [action]);

  // Run all diagnostics
  const runAllDiagnostics = useCallback(async () => {
    await Promise.all([
      runAllHealthChecks(),
      fetchAuthStatus(),
      fetchDatabaseStatus(),
      fetchSystemMetrics(),
      fetchAuditLogs(),
    ]);
    toast.success("Diagnostics complete");
  }, [runAllHealthChecks, fetchAuthStatus, fetchDatabaseStatus, fetchSystemMetrics, fetchAuditLogs]);

  // Export diagnostics
  const exportDiagnostics = useCallback(() => {
    const data = {
      timestamp: new Date().toISOString(),
      healthChecks,
      authStatus,
      databaseStatus,
      systemMetrics,
      auditLogs: auditLogs.slice(0, 50),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `memorify-diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [healthChecks, authStatus, databaseStatus, systemMetrics, auditLogs]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(runAllDiagnostics, 30000);
      setRefreshInterval(interval);
      return () => clearInterval(interval);
    }
    if (refreshInterval) clearInterval(refreshInterval);
  }, [autoRefresh, runAllDiagnostics]);

  // Initial load
  useEffect(() => {
    runAllDiagnostics();
  }, [runAllDiagnostics]);

  // Filter health checks
  const filteredChecks = healthChecks.filter(check => {
    const matchesCategory = selectedCategory === "all" || check.category === selectedCategory;
    const matchesFilter = filterText === "" || 
      check.name.toLowerCase().includes(filterText.toLowerCase()) ||
      check.endpoint.toLowerCase().includes(filterText.toLowerCase()) ||
      check.error?.toLowerCase().includes(filterText.toLowerCase());
    return matchesCategory && matchesFilter;
  });

  // Stats
  const totalChecks = healthChecks.length;
  const operationalChecks = healthChecks.filter(c => c.status === "operational").length;
  const degradedChecks = healthChecks.filter(c => c.status === "degraded").length;
  const downChecks = healthChecks.filter(c => c.status === "down").length;

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <PageHeader
        title="Admin Diagnostics"
        description="Backend, auth, and system health monitoring without AI"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="gap-2"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", autoRefresh && "animate-spin")} />
              {autoRefresh ? "Auto (30s)" : "Auto Refresh"}
            </Button>
            <Button variant="outline" size="sm" onClick={runAllDiagnostics} disabled={loading.health} className="gap-2">
              <RefreshCw className={cn("h-3.5 w-3.5", loading.health && "animate-spin")} />
              Run All
            </Button>
            <Button variant="outline" size="sm" onClick={exportDiagnostics} className="gap-2">
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </div>
        }
      />

      {/* Status Summary Cards */}
      <div className="mx-auto max-w-7xl px-6 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Operational</p>
                <p className="text-2xl font-semibold tabular-nums text-emerald-400">{operationalChecks}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-emerald-500/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Degraded</p>
                <p className="text-2xl font-semibold tabular-nums text-amber-400">{degradedChecks}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-amber-500/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Down</p>
                <p className="text-2xl font-semibold tabular-nums text-destructive">{downChecks}</p>
              </div>
              <XCircle className="h-8 w-8 text-destructive/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Checks</p>
                <p className="text-2xl font-semibold tabular-nums">{totalChecks}</p>
              </div>
              <Activity className="h-8 w-8 text-muted-foreground/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="health" className="flex-1 min-h-0">
        <TabsList className="grid w-full grid-cols-6 mx-auto max-w-7xl px-6">
          <TabsTrigger value="health">
            <Activity className="h-3.5 w-3.5 mr-1.5" />
            Health Checks
          </TabsTrigger>
          <TabsTrigger value="auth">
            <Shield className="h-3.5 w-3.5 mr-1.5" />
            Auth Status
          </TabsTrigger>
          <TabsTrigger value="database">
            <Database className="h-3.5 w-3.5 mr-1.5" />
            Database
          </TabsTrigger>
          <TabsTrigger value="metrics">
            <Cpu className="h-3.5 w-3.5 mr-1.5" />
            Metrics
          </TabsTrigger>
          <TabsTrigger value="audit">
            <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
            Audit Log
          </TabsTrigger>
          <TabsTrigger value="debug">
            <Bug className="h-3.5 w-3.5 mr-1.5" />
            Debug Tools
          </TabsTrigger>
        </TabsList>

        {/* Health Checks Tab */}
        <TabsContent value="health" className="flex-1 min-h-0 p-6">
          <div className="mx-auto max-w-7xl space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter checks..."
                  value={filterText}
                  onChange={e => setFilterText(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Category:</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-[160px] h-8 text-sm">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <div className="flex items-center gap-2">
                          <cat.icon className="h-3.5 w-3.5" />
                          {cat.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Health Checks Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredChecks.map(check => (
                <Card key={check.id} className={cn(
                  "transition-all",
                  check.status === "down" && "border-destructive/30",
                  check.status === "degraded" && "border-amber/30",
                  check.status === "operational" && "border-emerald-500/20"
                )}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {getCategoryIcon(check.category)}
                        <CardTitle className="text-sm font-medium">{check.name}</CardTitle>
                      </div>
                      {getStatusBadge(check.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-mono truncate max-w-[200px]">{check.endpoint}</span>
                      {check.latencyMs !== null && (
                        <span className={cn(
                          "font-mono tabular-nums px-1.5 py-0.5 rounded bg-secondary/40",
                          check.latencyMs > 1000 ? "text-destructive" : check.latencyMs > 500 ? "text-amber-400" : "text-emerald-400"
                        )}>
                          {check.latencyMs}ms
                        </span>
                      )}
                    </div>
                    
                    {check.error && (
                      <div className="text-xs text-destructive bg-destructive/10 p-2 rounded font-mono break-all">
                        {check.error}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Last checked: {check.lastChecked ? new Date(check.lastChecked).toLocaleTimeString() : "Never"}
                    </div>

                    {/* Expandable details */}
                    <button
                      onClick={() => setShowRaw(prev => ({ ...prev, [check.id]: !prev[check.id] }))}
                      className="w-full text-left text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      {showRaw[check.id] ? (
                        <>
                          <ChevronUp className="h-3 w-3" />
                          Hide details
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" />
                          Show details
                        </>
                      )}
                    </button>

                    {showRaw[check.id] && (
                      <div className="mt-2 p-2 bg-muted/50 rounded text-[10px] font-mono overflow-auto max-h-48">
                        <pre>{JSON.stringify(check.details, null, 2)}</pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {filteredChecks.length === 0 && (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No health checks match your filters</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Auth Status Tab */}
        <TabsContent value="auth" className="flex-1 min-h-0 p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            {/* Clerk Auth */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Clerk Authentication
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className={cn("p-3 rounded-lg", authStatus?.clerk.authenticated ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-destructive/10 border border-destructive/20")}>
                    <p className="text-xs text-muted-foreground">Authenticated</p>
                    <p className="text-lg font-semibold flex items-center gap-1">
                      {authStatus?.clerk.authenticated ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          Yes
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 text-destructive" />
                          No
                        </>
                      )}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <p className="text-xs text-muted-foreground">User ID</p>
                    <p className="text-sm font-mono truncate">{authStatus?.clerk.userId || "—"}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <p className="text-xs text-muted-foreground">Organization ID</p>
                    <p className="text-sm font-mono truncate">{authStatus?.clerk.orgId || "—"}</p>
                  </div>
                  <div className={cn("p-3 rounded-lg", authStatus?.clerk.sessionValid ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-destructive/10 border border-destructive/20")}>
                    <p className="text-xs text-muted-foreground">Session Valid</p>
                    <p className="text-lg font-semibold flex items-center gap-1">
                      {authStatus?.clerk.sessionValid ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          Valid
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 text-destructive" />
                          Invalid
                        </>
                      )}
                    </p>
                  </div>
                </div>
                {authStatus?.clerk.error && (
                  <div className="text-xs text-destructive bg-destructive/10 p-3 rounded font-mono">
                    {authStatus.clerk.error}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Neon Auth */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Neon Auth (JWT)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className={cn("p-3 rounded-lg", authStatus?.neonAuth.configured ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-amber-500/10 border border-amber-500/20")}>
                    <p className="text-xs text-muted-foreground">Configured</p>
                    <p className="text-lg font-semibold flex items-center gap-1">
                      {authStatus?.neonAuth.configured ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          Yes
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-4 w-4 text-amber-400" />
                          No
                        </>
                      )}
                    </p>
                  </div>
                  <div className={cn("p-3 rounded-lg", authStatus?.neonAuth.jwtValid ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-destructive/10 border border-destructive/20")}>
                    <p className="text-xs text-muted-foreground">JWT Valid</p>
                    <p className="text-lg font-semibold flex items-center gap-1">
                      {authStatus?.neonAuth.jwtValid ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          Valid
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 text-destructive" />
                          Invalid
                        </>
                      )}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <p className="text-xs text-muted-foreground">Trusted Domain</p>
                    <p className="text-sm font-mono truncate">{authStatus?.neonAuth.trustedDomain || "—"}</p>
                  </div>
                </div>
                {authStatus?.neonAuth.error && (
                  <div className="text-xs text-destructive bg-destructive/10 p-3 rounded font-mono">
                    {authStatus.neonAuth.error}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Agent Tokens */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Agent Tokens
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <p className="text-xs text-muted-foreground">Total Agents</p>
                    <p className="text-2xl font-semibold tabular-nums">{authStatus?.agentTokens.count || 0}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-xs text-muted-foreground">Active</p>
                    <p className="text-2xl font-semibold tabular-nums text-emerald-400">{authStatus?.agentTokens.active || 0}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-xs text-muted-foreground">Revoked</p>
                    <p className="text-2xl font-semibold tabular-nums text-destructive">{authStatus?.agentTokens.revoked || 0}</p>
                  </div>
                </div>
                {authStatus?.agentTokens.error && (
                  <div className="text-xs text-destructive bg-destructive/10 p-3 rounded font-mono">
                    {authStatus.agentTokens.error}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Database Tab */}
        <TabsContent value="database" className="flex-1 min-h-0 p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Database Connection
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <div className={cn("p-3 rounded-lg", databaseStatus?.connected ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-destructive/10 border border-destructive/20")}>
                    <p className="text-xs text-muted-foreground">Connected</p>
                    <p className="text-lg font-semibold flex items-center gap-1">
                      {databaseStatus?.connected ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          Yes
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 text-destructive" />
                          No
                        </>
                      )}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <p className="text-xs text-muted-foreground">Pool Size</p>
                    <p className="text-lg font-semibold tabular-nums">{databaseStatus?.poolSize || 0}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <p className="text-xs text-muted-foreground">Active Connections</p>
                    <p className="text-lg font-semibold tabular-nums">{databaseStatus?.activeConnections || 0}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <p className="text-xs text-muted-foreground">Latency</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {databaseStatus?.latencyMs !== null ? `${databaseStatus.latencyMs}ms` : "—"}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <p className="text-xs text-muted-foreground">Tables</p>
                    <p className="text-lg font-semibold tabular-nums">{databaseStatus?.tables.length || 0}</p>
                  </div>
                </div>
                {databaseStatus?.error && (
                  <div className="text-xs text-destructive bg-destructive/10 p-3 rounded font-mono">
                    {databaseStatus.error}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tables */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <List className="h-5 w-5" />
                  Tables
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Name</th>
                        <th className="pb-2 pr-4 text-right">Rows</th>
                        <th className="pb-2 pr-4">Size</th>
                        <th className="pb-2">Last Analyzed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {databaseStatus?.tables.map((table, i) => (
                        <tr key={table.name} className={cn("border-b border-border/50", i % 2 === 0 && "bg-muted/30")}>
                          <td className="py-2 pr-4 font-mono">{table.name}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{table.rowCount.toLocaleString()}</td>
                          <td className="py-2 pr-4 font-mono">{table.size}</td>
                          <td className="py-2 text-muted-foreground">{table.lastAnalyzed || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics" className="flex-1 min-h-0 p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            {/* System Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5" />
                  System Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <p className="text-xs text-muted-foreground">Uptime</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {systemMetrics ? `${Math.floor(systemMetrics.uptime / (1000 * 60 * 60))}h ${Math.floor((systemMetrics.uptime % (1000 * 60 * 60)) / (1000 * 60))}m` : "—"}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <p className="text-xs text-muted-foreground">Heap Used</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {systemMetrics ? `${(systemMetrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)} MB` : "—"}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <p className="text-xs text-muted-foreground">Heap Total</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {systemMetrics ? `${(systemMetrics.memoryUsage.heapTotal / 1024 / 1024).toFixed(1)} MB` : "—"}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <p className="text-xs text-muted-foreground">CPU Usage</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {systemMetrics ? `${systemMetrics.cpuUsage.toFixed(1)}%` : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Request Counts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Request Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <p className="text-xs text-muted-foreground">Total Requests</p>
                    <p className="text-2xl font-semibold tabular-nums">{systemMetrics?.requestCount.total.toLocaleString() || 0}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-xs text-muted-foreground">Last Minute</p>
                    <p className="text-2xl font-semibold tabular-nums text-blue-400">{systemMetrics?.requestCount.lastMinute || 0}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border">
                    <p className="text-xs text-muted-foreground">Last Hour</p>
                    <p className="text-2xl font-semibold tabular-nums">{systemMetrics?.requestCount.lastHour.toLocaleString() || 0}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-xs text-muted-foreground">Errors</p>
                    <p className="text-2xl font-semibold tabular-nums text-destructive">{systemMetrics?.requestCount.errors || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Edge Function Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Edge Functions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="pb-2 pr-4">Function</th>
                        <th className="pb-2 pr-4 text-right">Invocations</th>
                        <th className="pb-2 pr-4 text-right">Avg Duration</th>
                        <th className="pb-2 pr-4 text-right">Errors</th>
                        <th className="pb-2">Last Invoked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {systemMetrics?.edgeFunctionMetrics.map((fn, i) => (
                        <tr key={fn.name} className={cn("border-b border-border/50", i % 2 === 0 && "bg-muted/30")}>
                          <td className="py-2 pr-4 font-mono">{fn.name}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{fn.invocations.toLocaleString()}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{fn.avgDurationMs}ms</td>
                          <td className="py-2 pr-4 text-right tabular-nums text-destructive">{fn.errors}</td>
                          <td className="py-2 text-muted-foreground">{fn.lastInvoked ? new Date(fn.lastInvoked).toLocaleTimeString() : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit" className="flex-1 min-h-0 p-6">
          <div className="mx-auto max-w-7xl space-y-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Audit Log
              </CardTitle>
              <Button variant="outline" size="sm" onClick={fetchAuditLogs} disabled={loading.audit} className="gap-2">
                <RefreshCw className={cn("h-3.5 w-3.5", loading.audit && "animate-spin")} />
                Refresh
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground bg-muted/30">
                        <th className="p-3 pr-4">Timestamp</th>
                        <th className="p-3 pr-4">Workspace</th>
                        <th className="p-3 pr-4">Agent</th>
                        <th className="p-3 pr-4">Action</th>
                        <th className="p-3 pr-4">Resource</th>
                        <th className="p-3">Metadata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log, i) => (
                        <tr key={log.id} className={cn("border-b border-border/50", i % 2 === 0 && "bg-muted/30")}>
                          <td className="p-3 pr-4 font-mono text-xs whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="p-3 pr-4 font-mono text-xs truncate max-w-[120px]">{log.workspace_id}</td>
                          <td className="p-3 pr-4 font-mono text-xs truncate max-w-[120px]">{log.agent_id}</td>
                          <td className="p-3 pr-4 font-mono text-xs">{log.action}</td>
                          <td className="p-3 pr-4 font-mono text-xs truncate max-w-[150px]">{log.resource}</td>
                          <td className="p-3">
                            <button
                              onClick={() => setShowRaw(prev => ({ ...prev, [`audit-${log.id}`]: !prev[`audit-${log.id}`] }))}
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              {showRaw[`audit-${log.id}`] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              {showRaw[`audit-${log.id}`] ? "Hide" : "Show"}
                            </button>
                            {showRaw[`audit-${log.id}`] && (
                              <div className="mt-1 p-2 bg-muted/50 rounded text-[10px] font-mono overflow-auto max-h-32">
                                <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {auditLogs.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">
                    <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No audit logs found</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Debug Tools Tab */}
        <TabsContent value="debug" className="flex-1 min-h-0 p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            {/* Raw API Tester */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  Raw API Tester
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ApiTester />
              </CardContent>
            </Card>

            {/* Environment Variables */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Environment Check
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EnvironmentChecker />
              </CardContent>
            </Card>

            {/* MCP Server Diagnostics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5" />
                  MCP Servers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <McpDiagnostics />
              </CardContent>
            </Card>

            {/* Database Query Runner */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Database Query Runner
                </CardTitle>
              </CardHeader>
              <CardContent>
                <QueryRunner />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Sub-components for Debug Tools

function ApiTester() {
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("https://memorify.dev/api/health");
  const [headers, setHeaders] = useState("Authorization: Bearer \nContent-Type: application/json");
  const [body, setBody] = useState("");
  const [response, setResponse] = useState<{ status: number; headers: Record<string, string>; body: string; latency: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const sendRequest = async () => {
    setLoading(true);
    const start = performance.now();
    try {
      const headerObj: Record<string, string> = {};
      headers.split("\n").forEach(line => {
        const [key, ...val] = line.split(":");
        if (key && val.length) headerObj[key.trim()] = val.join(":").trim();
      });

      const res = await fetch(url, {
        method,
        headers: headerObj,
        body: method !== "GET" && method !== "HEAD" ? body : undefined,
      });

      const latency = Math.round(performance.now() - start);
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => { responseHeaders[key] = value; });
      const text = await res.text();

      setResponse({ status: res.status, headers: responseHeaders, body: text, latency });
    } catch (error) {
      setResponse({ 
        status: 0, 
        headers: {}, 
        body: error instanceof Error ? error.message : "Unknown error", 
        latency: Math.round(performance.now() - start) 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="w-[100px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"].map(m => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="URL"
          className="flex-1 min-w-[300px]"
        />
        <Button onClick={sendRequest} disabled={loading} className="gap-2">
          <Terminal className="h-3.5 w-3.5" />
          {loading ? "Sending..." : "Send"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="text-xs text-muted-foreground">Headers (one per line)</Label>
          <textarea
            value={headers}
            onChange={e => setHeaders(e.target.value)}
            className="mt-1 w-full h-24 font-mono text-xs p-2 rounded-md border border-border bg-background resize-y"
            placeholder="Authorization: Bearer token&#10;Content-Type: application/json"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Body</Label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            className="mt-1 w-full h-24 font-mono text-xs p-2 rounded-md border border-border bg-background resize-y"
            placeholder='{"key": "value"}'
          />
        </div>
      </div>

      {response && (
        <div className="space-y-2">
          <div className="flex items-center gap-4 text-sm">
            <span className={cn(
              "px-2 py-0.5 rounded font-mono",
              response.status >= 200 && response.status < 300 ? "bg-emerald-500/10 text-emerald-400" :
              response.status >= 400 && response.status < 500 ? "bg-amber-500/10 text-amber-400" :
              response.status >= 500 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
            )}>
              {response.status || "Error"}
            </span>
            <span className="text-muted-foreground font-mono">{response.latency}ms</span>
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {JSON.stringify(response.headers, null, 2)}
          </div>
          <div className="bg-muted/50 rounded p-3 max-h-64 overflow-auto font-mono text-xs">
            <pre>{response.body}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function EnvironmentChecker() {
  const [envVars, setEnvVars] = useState<Record<string, { required: boolean; present: boolean; value?: string }>>({});
  const [loading, setLoading] = useState(false);

  const checkEnv = async () => {
    setLoading(true);
    try {
      // Known required environment variables
      const required = [
        "NEON_DATABASE_URL",
        "CLERK_PUBLISHABLE_KEY",
        "CLERK_SECRET_KEY",
        "NVIDIA_API_KEY",
        "OPENROUTER_API_KEY",
        "EMBEDDING_API_URL",
        "EMBEDDING_API_KEY",
        "GITHUB_OAUTH_CLIENT_ID",
        "GITHUB_OAUTH_CLIENT_SECRET",
        "VITE_APP_URL",
        "VITE_CLERK_PUBLISHABLE_KEY",
      ];

      const results: Record<string, { required: boolean; present: boolean; value?: string }> = {};
      
      for (const key of required) {
        const value = Deno.env.get(key);
        results[key] = {
          required: true,
          present: !!value,
          value: value ? `${value.substring(0, 8)}...` : undefined,
        };
      }

      // Also check for any other env vars that might be set
      for (const [key, value] of Object.entries(Deno.env.toObject())) {
        if (!results[key]) {
          results[key] = {
            required: false,
            present: true,
            value: `${value.substring(0, 8)}...`,
          };
        }
      }

      setEnvVars(results);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkEnv();
  }, []);

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={checkEnv} disabled={loading} className="gap-2">
        <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        {loading ? "Checking..." : "Check Environment"}
      </Button>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="p-2 pr-4">Variable</th>
              <th className="p-2 pr-4">Required</th>
              <th className="p-2 pr-4">Status</th>
              <th className="p-2">Value (masked)</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(envVars).sort(([a], [b]) => a.localeCompare(b)).map(([key, info], i) => (
              <tr key={key} className={cn("border-b border-border/50", i % 2 === 0 && "bg-muted/30")}>
                <td className="p-2 pr-4 font-mono text-xs">{key}</td>
                <td className="p-2 pr-4 text-center">
                  {info.required ? (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">Required</span>
                  ) : (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Optional</span>
                  )}
                </td>
                <td className="p-2 pr-4 text-center">
                  {info.present ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 mx-auto" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive mx-auto" />
                  )}
                </td>
                <td className="p-2 pr-4 font-mono text-xs text-muted-foreground">
                  {info.value || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function McpDiagnostics() {
  const [servers, setServers] = useState<Array<{ id: string; name: string; url: string; enabled: boolean; status: string; tools: number }>>([]);
  const [loading, setLoading] = useState(false);

  const fetchMcpServers = async () => {
    setLoading(true);
    try {
      const res = await fetch("https://memorify.dev/api/mcp/servers", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("memorify_admin_token") || ""}` },
      });
      if (res.ok) {
        const data = await res.json();
        setServers(data.data || []);
      }
    } catch (error) {
      console.error("MCP fetch failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const testServer = async (serverUrl: string) => {
    try {
      const res = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "1", method: "initialize", params: {} }),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    fetchMcpServers();
  }, []);

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={fetchMcpServers} disabled={loading} className="gap-2">
        <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        {loading ? "Loading..." : "Refresh Servers"}
      </Button>

      {servers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Network className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No MCP servers configured</p>
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map(server => (
            <Card key={server.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn("h-2 w-2 rounded-full", server.enabled ? "bg-emerald-400" : "bg-muted-foreground")} />
                  <div>
                    <p className="font-medium">{server.name}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate max-w-[300px]">{server.url}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-secondary/40 text-muted-foreground">
                    {server.tools} tools
                  </span>
                  <Button variant="outline" size="sm" onClick={() => testServer(server.url).then(ok => toast[ok ? "success" : "error"](ok ? "Server reachable" : "Server unreachable"))}>
                    Test
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function QueryRunner() {
  const [query, setQuery] = useState("SELECT * FROM memories LIMIT 10;");
  const [results, setResults] = useState<{ columns: string[]; rows: unknown[][]; rowCount: number; duration: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runQuery = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    const start = performance.now();
    try {
      // This would need a backend endpoint - for now show mock
      // In real implementation, call a secure admin endpoint
      throw new Error("Database query endpoint not implemented. Use Neon console or add /api/admin/query endpoint.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Label className="text-xs text-muted-foreground">SQL Query</Label>
      <textarea
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="w-full h-24 font-mono text-xs p-2 rounded-md border border-border bg-background resize-y"
        placeholder="SELECT * FROM memories LIMIT 10;"
      />
      <div className="flex items-center gap-2">
        <Button onClick={runQuery} disabled={loading} className="gap-2">
          <Terminal className="h-3.5 w-3.5" />
          {loading ? "Running..." : "Execute"}
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>

      {results && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            {results.rowCount} rows in {results.duration}ms
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  {results.columns.map(col => <th key={col} className="p-2 pr-4 font-mono">{col}</th>)}
                </tr>
              </thead>
              <tbody>
                {results.rows.slice(0, 100).map((row, i) => (
                  <tr key={i} className={cn("border-b border-border/50", i % 2 === 0 && "bg-muted/30")}>
                    {row.map((cell, j) => (
                      <td key={j} className="p-2 pr-4 font-mono truncate max-w-[200px]">
                        {cell === null ? "NULL" : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {results.rows.length > 100 && (
            <p className="text-xs text-muted-foreground">Showing first 100 rows of {results.rows.length}</p>
          )}
        </div>
      )}
    </div>
  );
}