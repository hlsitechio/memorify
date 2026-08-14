// mindmap/src/pages/MindMap.tsx
// Drop into dashboard routes as Mind Map page.
// Requires: Clerk getToken + optional PageHeader from app shell.

import { useMemo, useState, type ReactNode } from "react";
import { MindMapCanvas, MindMapLegend, MindMapToolbar } from "../components/mindmap/index.ts";
import { useMindMapData } from "../hooks/useMindMapData.ts";
import type { MemoryNodeChip } from "../types/memory-graph.ts";
import { isBuildLocked } from "../types/memory-graph.ts";

export type MindMapPageProps = {
  /** Clerk session getToken */
  getToken: () => Promise<string | null>;
  /** Optional focus from ?focus=mem_… */
  focusMemId?: string | null;
  /** Navigate to memory detail */
  onOpenMemory?: (memId: string) => void;
  /** Render slot for app PageHeader */
  header?: ReactNode;
};

export default function MindMapPage({
  getToken,
  focusMemId,
  onOpenMemory,
  header,
}: MindMapPageProps) {
  const [namespace, setNamespace] = useState("");
  const [category, setCategory] = useState("");
  const [depth, setDepth] = useState(2);
  const [selected, setSelected] = useState<MemoryNodeChip | null>(null);

  const { data, loading, error, reload, client } = useMindMapData({
    getToken,
    focusMemId,
    slug: "main",
  });

  const filteredNodes = useMemo(() => {
    let nodes = data?.nodes ?? [];
    if (namespace.trim()) {
      nodes = nodes.filter((n) => n.namespace.includes(namespace.trim()));
    }
    if (category.trim()) {
      nodes = nodes.filter((n) => n.category.includes(category.trim()));
    }
    return nodes;
  }, [data?.nodes, namespace, category]);

  const filteredEdges = useMemo(() => {
    const ids = new Set(filteredNodes.map((n) => n.id));
    return (data?.edges ?? []).filter(
      (e) => ids.has(e.from_memory_id) && ids.has(e.to_memory_id),
    );
  }, [data?.edges, filteredNodes]);

  const onSelect = (node: MemoryNodeChip) => {
    setSelected(node);
    if (node.mem_id && !isBuildLocked(node)) {
      onOpenMemory?.(node.mem_id);
    }
  };

  const applyFilters = async () => {
    try {
      const sub = await client.subgraph({
        focus: focusMemId ?? undefined,
        depth,
        namespace: namespace || undefined,
        category: category || undefined,
        limit: 80,
      });
      // local override via reload path — simplest: parent remount or extend hook
      void sub;
      await reload();
    } catch {
      await reload();
    }
  };

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      {header ?? (
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Mind Map</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.7, fontSize: 14 }}>
            Agent-first memory graph — nodes addressable by Memory ID. Layout is presentation only.
          </p>
        </div>
      )}

      <MindMapToolbar
        namespace={namespace}
        category={category}
        depth={depth}
        onNamespace={setNamespace}
        onCategory={setCategory}
        onDepth={setDepth}
        onRefresh={() => void applyFilters()}
        busy={loading}
      />

      {error && (
        <div
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 8,
            border: "1px solid var(--destructive, #7f1d1d)",
            color: "var(--destructive, #fca5a5)",
            fontSize: 13,
          }}
        >
          {error}
          {error.includes("BUILD_ZONE") ? " — do not touch this zone." : ""}
        </div>
      )}

      {loading && !data ? (
        <div style={{ padding: 40, opacity: 0.6 }}>Loading graph…</div>
      ) : (
        <MindMapCanvas
          nodes={filteredNodes}
          edges={filteredEdges}
          layout={data?.layout}
          selectedId={selected?.id}
          onSelect={onSelect}
        />
      )}

      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 16 }}>
        <MindMapLegend />
        {selected && (
          <div style={{ fontSize: 12, fontFamily: "ui-monospace, monospace" }}>
            selected: {selected.mem_id ?? "(no mem_id)"} · {selected.status}
          </div>
        )}
      </div>
    </div>
  );
}
