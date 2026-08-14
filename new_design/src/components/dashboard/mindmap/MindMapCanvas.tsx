import { useMemo } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type MindMapEdge,
  type MindMapLayoutItem,
  type MindMapNode,
  isBuildLocked,
  nodeLabel,
} from "./types";

const W = 900;
const H = 520;

function autoLayout(
  nodes: MindMapNode[],
  layout?: MindMapLayoutItem[],
): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  const saved = new Map((layout ?? []).map((l) => [l.memory_id, l]));
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) * 0.32;
  const n = Math.max(nodes.length, 1);

  nodes.forEach((node, i) => {
    const s = saved.get(node.id);
    if (s) {
      map.set(node.id, { x: s.x, y: s.y });
      return;
    }
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    map.set(node.id, {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  });
  return map;
}

export function MindMapCanvas({
  nodes,
  edges,
  layout,
  selectedId,
  zoom = 1,
  onSelect,
  onCopyMemId,
}: {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  layout?: MindMapLayoutItem[];
  selectedId?: string | null;
  zoom?: number;
  onSelect?: (n: MindMapNode) => void;
  onCopyMemId?: (memId: string) => void;
}) {
  const points = useMemo(() => autoLayout(nodes, layout), [nodes, layout]);

  return (
    <div className="relative w-full h-[520px] bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.07),transparent_55%)]">
      <div
        className="absolute inset-0 origin-center transition-transform duration-200"
        style={{ transform: `scale(${zoom})` }}
      >
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <marker
              id="mm-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L7,3 L0,6 Z" className="fill-muted-foreground/50" />
            </marker>
            <linearGradient id="mm-edge" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
              <stop offset="100%" stopColor="hsl(var(--primary-glow))" stopOpacity="0.55" />
            </linearGradient>
          </defs>

          {edges.map((e) => {
            const a = points.get(e.from_memory_id);
            const b = points.get(e.to_memory_id);
            if (!a || !b) return null;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            return (
              <g key={e.id}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="url(#mm-edge)"
                  strokeWidth={1.75}
                  markerEnd="url(#mm-arrow)"
                />
                <rect
                  x={mx - e.relation.length * 3.2}
                  y={my - 14}
                  width={e.relation.length * 6.4 + 8}
                  height={16}
                  rx={4}
                  className="fill-card/90 stroke-border"
                  strokeWidth={1}
                />
                <text
                  x={mx}
                  y={my - 3}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
                >
                  {e.relation}
                </text>
              </g>
            );
          })}
        </svg>

        {nodes.map((node) => {
          const p = points.get(node.id);
          if (!p) return null;
          const locked = isBuildLocked(node);
          const selected = selectedId === node.id;
          // Convert viewBox coords to % of container for absolute chips
          const left = `${(p.x / W) * 100}%`;
          const top = `${(p.y / H) * 100}%`;

          return (
            <button
              key={node.id}
              type="button"
              disabled={locked}
              onClick={() => {
                if (!locked) onSelect?.(node);
              }}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 text-left rounded-lg border px-3 py-2.5 w-[168px] transition-all",
                "bg-card/95 backdrop-blur-sm shadow-card",
                locked && "opacity-50 cursor-not-allowed border-border/50",
                !locked && "hover:border-primary/50 hover:shadow-glow cursor-pointer",
                selected && "border-primary ring-2 ring-primary/30",
                !selected && !locked && "border-border",
              )}
              style={{ left, top }}
              title={locked ? "BUILD_ZONE — do not touch" : node.mem_id ?? node.id}
            >
              <div className="flex items-start justify-between gap-1 mb-1">
                <div className="text-xs font-semibold leading-snug line-clamp-2">
                  {nodeLabel(node)}
                </div>
                {locked && <Lock className="h-3 w-3 shrink-0 text-muted-foreground mt-0.5" />}
              </div>
              <div className="text-[10px] text-muted-foreground mb-1.5 truncate">
                {node.category}
                <span className="mx-1 opacity-40">·</span>
                <span className="font-mono">{node.namespace}</span>
              </div>
              {node.mem_id ? (
                <span
                  role="link"
                  tabIndex={0}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onCopyMemId?.(node.mem_id!);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      ev.stopPropagation();
                      onCopyMemId?.(node.mem_id!);
                    }
                  }}
                  className="block font-mono text-[10px] text-accent-foreground/90 hover:text-primary truncate cursor-copy"
                >
                  {node.mem_id}
                </span>
              ) : (
                <span className="block text-[10px] text-destructive font-medium">
                  no mem_id · BUILD_ZONE
                </span>
              )}
            </button>
          );
        })}

        {nodes.length === 0 && (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            No nodes in this filter
          </div>
        )}
      </div>
    </div>
  );
}
