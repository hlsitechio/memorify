import { useMemo, useState, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Share2,
  RefreshCcw,
  Search,
  Copy,
  Lock,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Info,
  Database,
  Link2,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DEMO_EDGES,
  DEMO_LAYOUT,
  DEMO_NODES,
  type MindMapEdge,
  type MindMapLayoutItem,
  type MindMapNode,
  isBuildLocked,
  nodeLabel,
} from "@/components/dashboard/mindmap/types";
import { MindMapCanvas } from "@/components/dashboard/mindmap/MindMapCanvas";
import { MindMapSidePanel } from "@/components/dashboard/mindmap/MindMapSidePanel";

type LoadState = "demo" | "empty" | "live";

export default function MindMapPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const focusParam = params.get("focus");

  const [nodes, setNodes] = useState<MindMapNode[]>(DEMO_NODES);
  const [edges, setEdges] = useState<MindMapEdge[]>(DEMO_EDGES);
  const [layout, setLayout] = useState<MindMapLayoutItem[]>(DEMO_LAYOUT);
  const [loadState, setLoadState] = useState<LoadState>("demo");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  // Try live API; fall back to demo so UI is always visible pre-wire
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/memory/maps/main", { credentials: "include" });
      if (!res.ok) throw new Error("api_unavailable");
      const data = await res.json();
      if (data?.nodes?.length) {
        setNodes(data.nodes);
        setEdges(data.edges ?? []);
        setLayout(data.layout ?? []);
        setLoadState("live");
        return;
      }
      setNodes([]);
      setEdges([]);
      setLayout([]);
      setLoadState("empty");
    } catch {
      setNodes(DEMO_NODES);
      setEdges(DEMO_EDGES);
      setLayout(DEMO_LAYOUT);
      setLoadState("demo");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!focusParam) return;
    const hit = nodes.find((n) => n.mem_id === focusParam || n.id === focusParam);
    if (hit) setSelectedId(hit.id);
  }, [focusParam, nodes]);

  const categories = useMemo(() => {
    const s = new Set(nodes.map((n) => n.category || "general"));
    return Array.from(s).sort();
  }, [nodes]);

  const filteredNodes = useMemo(() => {
    let list = nodes;
    if (category !== "all") list = list.filter((n) => n.category === category);
    if (q.trim()) {
      const ql = q.toLowerCase();
      list = list.filter(
        (n) =>
          nodeLabel(n).toLowerCase().includes(ql) ||
          (n.mem_id ?? "").toLowerCase().includes(ql) ||
          n.namespace.toLowerCase().includes(ql) ||
          n.category.toLowerCase().includes(ql),
      );
    }
    return list;
  }, [nodes, category, q]);

  const idSet = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);
  const filteredEdges = useMemo(
    () => edges.filter((e) => idSet.has(e.from_memory_id) && idSet.has(e.to_memory_id)),
    [edges, idSet],
  );

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  const copyMemId = async (memId: string) => {
    try {
      await navigator.clipboard.writeText(memId);
      toast.success("Memory ID copied");
    } catch {
      toast.message(memId);
    }
  };

  const headerActions = useMemo(
    () => (
      <>
        <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/memory")}>
          <Database className="h-3.5 w-3.5 mr-1.5" /> Memory list
        </Button>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </>
    ),
    [navigate, load],
  );

  return (
    <>
      <PageHeader
        title="Mind Map"
        description="Your workspace graph only · other users: IDs never bodies"
        actions={headerActions}
      />

      <div className="p-6 space-y-4 overflow-y-auto scrollbar-thin h-[calc(100vh-3.5rem)]">
        {/* Privacy — transparent boundary */}
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 flex flex-wrap items-start gap-2 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <div className="space-y-0.5 min-w-0">
            <p className="text-foreground/90 font-medium">
              Visibility: this map is <span className="text-primary">your workspace only</span>
            </p>
            <p>
              Full nodes (titles + content on open) = you and agents in this org.{" "}
              <span className="text-foreground/80">Other customers:</span> ops may use{" "}
              <span className="font-mono text-[11px]">workspace_id → mem_id</span> for health —{" "}
              <span className="text-destructive/90 font-medium">never their memory text</span>.
            </p>
          </div>
        </div>

        {/* Status strip */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="secondary"
            className={cn(
              "font-normal",
              loadState === "live" && "bg-accent text-accent-foreground",
              loadState === "demo" && "border border-border",
            )}
          >
            <Share2 className="h-3 w-3 mr-1.5" />
            {loadState === "live" && "Live · your workspace"}
            {loadState === "demo" && "Preview · sample (not other users)"}
            {loadState === "empty" && "Empty workspace"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {filteredNodes.length} nodes · {filteredEdges.length} edges
          </span>
          {loadState === "demo" && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              API not wired — design sample. Live mode never pulls foreign orgs.
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={cn(
              "text-xs px-3 py-1.5 rounded-md border transition-colors flex items-center gap-1.5",
              category === "all"
                ? "bg-secondary border-border text-foreground"
                : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary/50",
            )}
          >
            All
            <span className="tabular-nums text-muted-foreground">{nodes.length}</span>
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-md border transition-colors flex items-center gap-1.5",
                category === cat
                  ? "bg-secondary border-border text-foreground"
                  : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary/50",
              )}
            >
              {cat}
              <span className="tabular-nums text-muted-foreground">
                {nodes.filter((n) => n.category === cat).length}
              </span>
            </button>
          ))}

          <div className="relative flex-1 min-w-[180px] max-w-md ml-auto">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-9"
              placeholder="Search title, mem_id, namespace…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {/* Canvas + side panel */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 min-h-[560px] items-start">
          <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col shadow-card">
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/40">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Link2 className="h-3.5 w-3.5 text-primary" />
                Graph canvas
                <span className="hidden sm:inline">· drag is layout-only · truth lives in Neon edges</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))}
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="text-[11px] tabular-nums text-muted-foreground w-10 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setZoom(1)}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <MindMapCanvas
              nodes={filteredNodes}
              edges={filteredEdges}
              layout={layout}
              selectedId={selectedId}
              zoom={zoom}
              onSelect={(n) => setSelectedId(n.id)}
              onCopyMemId={copyMemId}
            />

            <div className="px-3 py-2 border-t border-border flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-primary/80" /> ready
              </span>
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3 w-3" /> building / no mem_id — do not touch
              </span>
              <span className="inline-flex items-center gap-1">
                <Copy className="h-3 w-3" /> click mem_id to copy for support
              </span>
            </div>
          </div>

          <MindMapSidePanel
            node={selected}
            edges={edges}
            nodes={nodes}
            onCopyMemId={copyMemId}
            onFocusNeighbor={(id) => setSelectedId(id)}
            onOpenMemory={(memId) => navigate(`/dashboard/memory/${memId}`)}
          />
        </div>

        {/* Empty */}
        {loadState === "empty" && (
          <div className="rounded-lg border border-border bg-card p-8 text-center max-w-lg mx-auto">
            <div className="h-12 w-12 rounded-md bg-gradient-primary flex items-center justify-center mx-auto mb-4">
              <Share2 className="h-6 w-6 text-primary-foreground" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">No graph nodes yet</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Agents create memories via MCP; edges appear after <code className="font-mono text-xs">memory.link</code>.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
