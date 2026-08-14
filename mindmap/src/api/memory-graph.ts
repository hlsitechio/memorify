// mindmap/src/api/memory-graph.ts

import type { GetToken } from "./memory.ts";
import type { MindMapGraph, MemoryEdge, MemoryNodeChip } from "../types/memory-graph.ts";

async function apiFetch<T>(
  path: string,
  getToken: GetToken,
  init?: RequestInit,
): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error("not_signed_in");
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string; code?: string }).error ?? res.statusText;
    const code = (data as { code?: string }).code;
    throw new Error(code ? `${code}: ${msg}` : msg);
  }
  return data as T;
}

export function createMemoryGraphClient(getToken: GetToken) {
  return {
    async loadMap(slug = "main"): Promise<MindMapGraph> {
      const data = await apiFetch<{
        ok: true;
        map: MindMapGraph["map"];
        layout: MindMapGraph["layout"];
        nodes: MemoryNodeChip[];
        edges: MemoryEdge[];
      }>(`/api/memory/maps/${encodeURIComponent(slug)}`, getToken);
      return {
        map: data.map,
        layout: data.layout,
        nodes: data.nodes ?? [],
        edges: data.edges ?? [],
      };
    },

    ensureMain() {
      return apiFetch<{ ok: true; map: unknown }>(
        `/api/memory/maps/ensure`,
        getToken,
        { method: "POST", body: "{}" },
      );
    },

    subgraph(params: {
      focus?: string;
      depth?: number;
      limit?: number;
      namespace?: string;
      category?: string;
    }) {
      const q = new URLSearchParams();
      if (params.focus) q.set("focus", params.focus);
      if (params.depth != null) q.set("depth", String(params.depth));
      if (params.limit != null) q.set("limit", String(params.limit));
      if (params.namespace) q.set("namespace", params.namespace);
      if (params.category) q.set("category", params.category);
      return apiFetch<{ ok: true; nodes: MemoryNodeChip[]; edges: MemoryEdge[] }>(
        `/api/memory/subgraph?${q}`,
        getToken,
      );
    },

    neighbors(memId: string, direction: "in" | "out" | "both" = "both") {
      return apiFetch<{
        ok: true;
        center: MemoryNodeChip;
        nodes: MemoryNodeChip[];
        edges: MemoryEdge[];
      }>(
        `/api/memory/${encodeURIComponent(memId)}/neighbors?direction=${direction}`,
        getToken,
      );
    },

    link(body: {
      from: string;
      to: string;
      relation?: string;
      weight?: number;
      bidirectional?: boolean;
    }) {
      return apiFetch<{ ok: true; edge: MemoryEdge }>(`/api/memory/link`, getToken, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    unlink(body: {
      edge_id?: string;
      from?: string;
      to?: string;
      relation?: string;
    }) {
      return apiFetch<{ ok: true; deleted: boolean }>(`/api/memory/unlink`, getToken, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    saveLayout(
      slug: string,
      positions: Array<{ memory_id: string; x: number; y: number; collapsed?: boolean }>,
    ) {
      return apiFetch<{ ok: true; saved: number }>(
        `/api/memory/maps/${encodeURIComponent(slug)}/layout`,
        getToken,
        { method: "PUT", body: JSON.stringify({ positions }) },
      );
    },
  };
}
