// mindmap/src/components/mindmap/MindMapCanvas.tsx

import { useMemo, useState } from "react";
import type { MemoryEdge, MemoryNodeChip, MemoryMapLayoutItem } from "../../types/memory-graph.ts";
import { MindMapNode } from "./MindMapNode.tsx";
import { MindMapEdge, autoLayout } from "./MindMapEdge.tsx";

export type MindMapCanvasProps = {
  nodes: MemoryNodeChip[];
  edges: MemoryEdge[];
  layout?: MemoryMapLayoutItem[];
  width?: number;
  height?: number;
  selectedId?: string | null;
  onSelect?: (node: MemoryNodeChip) => void;
};

export function MindMapCanvas({
  nodes,
  edges,
  layout,
  width = 960,
  height = 580,
  selectedId,
  onSelect,
}: MindMapCanvasProps) {
  const [toast, setToast] = useState<string | null>(null);

  const points = useMemo(
    () => autoLayout(nodes, layout, width, height),
    [nodes, layout, width, height],
  );

  const copyId = async (memId: string) => {
    try {
      await navigator.clipboard.writeText(memId);
      setToast(`Copied ${memId}`);
      setTimeout(() => setToast(null), 1600);
    } catch {
      setToast(memId);
    }
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height,
        borderRadius: 16,
        border: "1px solid var(--border, #333)",
        overflow: "hidden",
        background:
          "radial-gradient(ellipse at center, rgba(99,102,241,0.06), transparent 60%), var(--background, #0a0a0a)",
      }}
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <marker
            id="mm-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--border, #666)" />
          </marker>
        </defs>
        {edges.map((e) => (
          <MindMapEdge key={e.id} edge={e} nodesById={points} />
        ))}
      </svg>

      {nodes.map((n) => {
        const p = points.get(n.id);
        if (!p) return null;
        return (
          <MindMapNode
            key={n.id}
            node={n}
            x={p.x}
            y={p.y}
            selected={selectedId === n.id}
            onSelect={onSelect}
            onCopyId={copyId}
          />
        );
      })}

      {toast && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--card, #111)",
            border: "1px solid var(--border, #333)",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 12,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {toast}
        </div>
      )}

      {nodes.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            opacity: 0.6,
            fontSize: 14,
          }}
        >
          No nodes yet — agents create memories via MCP; edges appear after link.
        </div>
      )}
    </div>
  );
}
