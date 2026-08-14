// mindmap/src/components/mindmap/MindMapEdge.tsx

import type { MemoryEdge, MemoryNodeChip } from "../../types/memory-graph.ts";

export type LayoutPoint = { id: string; x: number; y: number };

export type MindMapEdgeProps = {
  edge: MemoryEdge;
  nodesById: Map<string, LayoutPoint>;
};

export function MindMapEdge({ edge, nodesById }: MindMapEdgeProps) {
  const a = nodesById.get(edge.from_memory_id);
  const b = nodesById.get(edge.to_memory_id);
  if (!a || !b) return null;

  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;

  return (
    <g>
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="var(--border, #444)"
        strokeWidth={1.5}
        markerEnd="url(#mm-arrow)"
      />
      <text
        x={midX}
        y={midY - 6}
        textAnchor="middle"
        fill="var(--muted-foreground, #888)"
        fontSize={10}
      >
        {edge.relation}
      </text>
    </g>
  );
}

/** Simple circular layout when no saved positions. */
export function autoLayout(
  nodes: MemoryNodeChip[],
  layout?: Array<{ memory_id: string; x: number; y: number }>,
  width = 900,
  height = 560,
): Map<string, LayoutPoint> {
  const map = new Map<string, LayoutPoint>();
  const saved = new Map((layout ?? []).map((l) => [l.memory_id, l]));

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.35;
  const n = Math.max(nodes.length, 1);

  nodes.forEach((node, i) => {
    const s = saved.get(node.id);
    if (s) {
      map.set(node.id, { id: node.id, x: s.x, y: s.y });
      return;
    }
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    map.set(node.id, {
      id: node.id,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  });
  return map;
}
