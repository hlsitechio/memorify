import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, Lock, Share2 } from "lucide-react";
import {
  type MindMapEdge,
  type MindMapNode,
  isBuildLocked,
  nodeLabel,
} from "./types";

export function MindMapSidePanel({
  node,
  edges,
  nodes,
  onCopyMemId,
  onFocusNeighbor,
  onOpenMemory,
}: {
  node: MindMapNode | null;
  edges: MindMapEdge[];
  nodes: MindMapNode[];
  onCopyMemId: (memId: string) => void;
  onFocusNeighbor: (id: string) => void;
  onOpenMemory: (memId: string) => void;
}) {
  if (!node) {
    return (
      <aside className="rounded-lg border border-border bg-card p-4 shadow-card h-fit lg:sticky lg:top-4">
        <div className="flex items-center gap-2 text-sm font-medium mb-2">
          <Share2 className="h-4 w-4 text-primary" />
          Selection
        </div>
        <p className="text-sm text-muted-foreground">
          Click a node to inspect Memory ID, relations, and build status.
        </p>
        <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
          <li>• This panel = <span className="text-foreground/80">your</span> workspace only</li>
          <li>• Other users: ops sees IDs/health — never their text</li>
          <li>• Locked nodes = building — do not touch</li>
        </ul>
      </aside>
    );
  }

  const locked = isBuildLocked(node);
  const related = edges.filter(
    (e) => e.from_memory_id === node.id || e.to_memory_id === node.id,
  );
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <aside className="rounded-lg border border-border bg-card p-4 shadow-card h-fit lg:sticky lg:top-4 space-y-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-snug">{nodeLabel(node)}</h3>
          {locked && (
            <Badge variant="outline" className="shrink-0 text-[10px] gap-1">
              <Lock className="h-3 w-3" /> building
            </Badge>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="font-normal text-[10px]">
            {node.category}
          </Badge>
          <Badge variant="outline" className="font-mono font-normal text-[10px]">
            {node.namespace}
          </Badge>
          <Badge variant="outline" className="font-normal text-[10px]">
            {node.status}
          </Badge>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Memory ID</div>
        {node.mem_id ? (
          <div className="flex items-center gap-1.5">
            <code className="flex-1 text-[11px] font-mono bg-muted/60 border border-border rounded-md px-2 py-1.5 truncate">
              {node.mem_id}
            </code>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8 shrink-0"
              onClick={() => onCopyMemId(node.mem_id!)}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="text-xs text-destructive border border-destructive/30 rounded-md px-2 py-2 bg-destructive/5">
            BUILD_ZONE_OR_MISSING — do not touch this part of the workspace.
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Relations ({related.length})
        </div>
        {related.length === 0 && (
          <p className="text-xs text-muted-foreground">No edges on this node.</p>
        )}
        <ul className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
          {related.map((e) => {
            const otherId = e.from_memory_id === node.id ? e.to_memory_id : e.from_memory_id;
            const other = byId.get(otherId);
            const dir = e.from_memory_id === node.id ? "→" : "←";
            return (
              <li key={e.id}>
                <button
                  type="button"
                  className="w-full text-left rounded-md border border-border/60 hover:bg-secondary/50 px-2 py-1.5 transition-colors"
                  onClick={() => other && onFocusNeighbor(other.id)}
                  disabled={!other || isBuildLocked(other)}
                >
                  <div className="text-[10px] font-mono text-primary">
                    {dir} {e.relation}
                  </div>
                  <div className="text-xs truncate">{other ? nodeLabel(other) : otherId}</div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="pt-1 flex flex-col gap-2">
        {node.mem_id && !locked && (
          <Button
            size="sm"
            className="w-full"
            onClick={() => onOpenMemory(node.mem_id!)}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Open memory
          </Button>
        )}
        {locked && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Agents and ops must skip this node until it has a stable mem_id and status{" "}
            <span className="font-mono">ready</span>.
          </p>
        )}
      </div>
    </aside>
  );
}
