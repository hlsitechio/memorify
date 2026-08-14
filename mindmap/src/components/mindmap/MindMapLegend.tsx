// mindmap/src/components/mindmap/MindMapLegend.tsx

export function MindMapLegend() {
  return (
    <div style={{ fontSize: 11, opacity: 0.75, lineHeight: 1.5 }}>
      <div>
        <strong>mem_id</strong> — copy for support (Workspace → Memory ID)
      </div>
      <div>🔒 / no mem_id — <code>BUILD_ZONE</code> — do not touch</div>
      <div>Edges = agent relations (server truth). Layout = presentation only.</div>
    </div>
  );
}
