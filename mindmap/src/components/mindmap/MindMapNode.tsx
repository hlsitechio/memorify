// mindmap/src/components/mindmap/MindMapNode.tsx

import type { CSSProperties } from "react";
import type { MemoryNodeChip } from "../../types/memory-graph.ts";
import { isBuildLocked, nodeLabel } from "../../types/memory-graph.ts";

export type MindMapNodeProps = {
  node: MemoryNodeChip;
  x: number;
  y: number;
  selected?: boolean;
  onSelect?: (node: MemoryNodeChip) => void;
  onCopyId?: (memId: string) => void;
};

export function MindMapNode({
  node,
  x,
  y,
  selected,
  onSelect,
  onCopyId,
}: MindMapNodeProps) {
  const locked = isBuildLocked(node);
  const style: CSSProperties = {
    position: "absolute",
    left: x,
    top: y,
    transform: "translate(-50%, -50%)",
    minWidth: 140,
    maxWidth: 200,
    padding: "10px 12px",
    borderRadius: 12,
    border: selected ? "2px solid var(--primary, #6366f1)" : "1px solid var(--border, #333)",
    background: locked
      ? "var(--muted, #1a1a1a)"
      : "var(--card, #111)",
    opacity: locked ? 0.55 : 1,
    cursor: locked ? "not-allowed" : "pointer",
    boxShadow: selected ? "0 0 0 3px rgba(99,102,241,0.25)" : "0 4px 16px rgba(0,0,0,0.25)",
    userSelect: "none",
  };

  return (
    <div
      style={style}
      role="button"
      tabIndex={0}
      title={locked ? "In build — do not touch" : node.mem_id ?? node.id}
      onClick={() => {
        if (!locked) onSelect?.(node);
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !locked) onSelect?.(node);
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        {nodeLabel(node)}
        {locked ? " 🔒" : ""}
      </div>
      <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 6 }}>
        {node.category} · {node.namespace}
      </div>
      {node.mem_id ? (
        <button
          type="button"
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 10,
            opacity: 0.85,
            background: "transparent",
            border: "none",
            color: "inherit",
            padding: 0,
            cursor: "copy",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onCopyId?.(node.mem_id!);
          }}
        >
          {node.mem_id}
        </button>
      ) : (
        <div style={{ fontSize: 10, color: "var(--destructive, #f87171)" }}>
          no mem_id · BUILD_ZONE
        </div>
      )}
    </div>
  );
}
