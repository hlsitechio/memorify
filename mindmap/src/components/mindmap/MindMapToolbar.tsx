// mindmap/src/components/mindmap/MindMapToolbar.tsx

import type { CSSProperties } from "react";

export type MindMapToolbarProps = {
  namespace: string;
  category: string;
  depth: number;
  onNamespace: (v: string) => void;
  onCategory: (v: string) => void;
  onDepth: (v: number) => void;
  onRefresh: () => void;
  busy?: boolean;
};

export function MindMapToolbar(props: MindMapToolbarProps) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        marginBottom: 12,
      }}
    >
      <input
        placeholder="namespace filter"
        value={props.namespace}
        onChange={(e) => props.onNamespace(e.target.value)}
        style={inputStyle}
      />
      <input
        placeholder="category filter"
        value={props.category}
        onChange={(e) => props.onCategory(e.target.value)}
        style={inputStyle}
      />
      <label style={{ fontSize: 12, opacity: 0.8 }}>
        depth{" "}
        <input
          type="number"
          min={0}
          max={3}
          value={props.depth}
          onChange={(e) => props.onDepth(Number(e.target.value))}
          style={{ ...inputStyle, width: 56 }}
        />
      </label>
      <button type="button" onClick={props.onRefresh} disabled={props.busy} style={btnStyle}>
        Refresh
      </button>
    </div>
  );
}

const inputStyle: CSSProperties = {
  background: "var(--background, #0a0a0a)",
  border: "1px solid var(--border, #333)",
  borderRadius: 8,
  padding: "6px 10px",
  color: "inherit",
  fontSize: 13,
};

const btnStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--border, #333)",
  padding: "6px 12px",
  background: "var(--secondary, #222)",
  color: "inherit",
  cursor: "pointer",
  fontSize: 13,
};
