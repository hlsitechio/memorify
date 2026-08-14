// mindmap/src/hooks/useMindMapData.ts
// Framework-agnostic data hook shape — wire to react-query in app if desired.

import { useCallback, useEffect, useState } from "react";
import { createMemoryGraphClient } from "../api/memory-graph.ts";
import type { MindMapGraph } from "../types/memory-graph.ts";

export type UseMindMapOptions = {
  getToken: () => Promise<string | null>;
  slug?: string;
  focusMemId?: string | null;
  autoEnsure?: boolean;
};

export function useMindMapData(opts: UseMindMapOptions) {
  const slug = opts.slug ?? "main";
  const [data, setData] = useState<MindMapGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const client = createMemoryGraphClient(opts.getToken);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (opts.autoEnsure !== false) {
        await client.ensureMain().catch(() => {
          /* map tables may not exist yet */
        });
      }
      if (opts.focusMemId) {
        const sub = await client.subgraph({
          focus: opts.focusMemId,
          depth: 2,
          limit: 80,
        });
        setData({ nodes: sub.nodes, edges: sub.edges });
      } else {
        const graph = await client.loadMap(slug);
        setData(graph);
      }
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [slug, opts.focusMemId, opts.getToken, opts.autoEnsure]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload, client };
}
