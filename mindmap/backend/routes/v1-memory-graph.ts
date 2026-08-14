// mindmap/backend/routes/v1-memory-graph.ts
// Agent gateway actions for the memory graph (merge into handleMemory).

import {
  ensureMainMap,
  getFull,
  getMap,
  healthForAgent,
  link,
  listMaps,
  neighbors,
  remember,
  subgraph,
  unlink,
  type GraphActor,
} from "../lib/memory-graph.ts";
import { isMemoryGraphError } from "../lib/memory-errors.ts";

export const MEMORY_GRAPH_ACTIONS = new Set([
  "get",
  "link",
  "unlink",
  "neighbors",
  "subgraph",
  "health",
  "map_list",
  "map_get",
  "map_ensure",
  // remember is also provided here as enhanced path
  "remember_graph",
]);

export async function handleMemoryGraphAction(
  action: string,
  input: Record<string, unknown>,
  ctx: GraphActor,
): Promise<unknown> {
  try {
    switch (action) {
      case "remember_graph":
      case "remember": {
        // Enhanced remember with mem_id + optional parent link
        if (action === "remember" && input.__legacy_only) {
          throw new Error("use core remember");
        }
        return await remember(ctx, {
          content: String(input.content ?? ""),
          title: input.title as string | undefined,
          namespace: input.namespace as string | undefined,
          category: input.category as string | undefined,
          tags: input.tags as string[] | undefined,
          metadata: input.metadata as Record<string, unknown> | undefined,
          status: input.status as string | undefined,
          parent_ref: (input.parent_mem_id ?? input.parent_ref) as string | undefined,
          relation: input.relation as string | undefined,
        });
      }

      case "get": {
        const ref = (input.mem_id ?? input.id) as string;
        if (!ref) throw new Error("mem_id or id required");
        return await getFull(ctx.workspace_id, ref);
      }

      case "link": {
        const from = (input.from ?? input.from_mem_id) as string;
        const to = (input.to ?? input.to_mem_id) as string;
        if (!from || !to) throw new Error("from and to required");
        return await link(ctx, {
          from,
          to,
          relation: input.relation as string | undefined,
          weight: input.weight as number | undefined,
          bidirectional: input.bidirectional as boolean | undefined,
          metadata: input.metadata as Record<string, unknown> | undefined,
        });
      }

      case "unlink": {
        return await unlink(ctx, {
          edge_id: input.edge_id as string | undefined,
          from: (input.from ?? input.from_mem_id) as string | undefined,
          to: (input.to ?? input.to_mem_id) as string | undefined,
          relation: input.relation as string | undefined,
        });
      }

      case "neighbors": {
        const ref = (input.mem_id ?? input.id) as string;
        if (!ref) throw new Error("mem_id or id required");
        return await neighbors(ctx.workspace_id, ref, {
          direction: input.direction as "in" | "out" | "both" | undefined,
          limit: input.limit as number | undefined,
        });
      }

      case "subgraph": {
        return await subgraph(ctx.workspace_id, {
          focus: (input.mem_id ?? input.focus ?? input.id) as string | undefined,
          depth: input.depth as number | undefined,
          limit_nodes: input.limit_nodes as number | undefined,
          namespace: input.namespace as string | undefined,
          category: input.category as string | undefined,
        });
      }

      case "health": {
        const ref = (input.mem_id ?? input.id) as string;
        if (!ref) throw new Error("mem_id or id required");
        return await healthForAgent(ctx.workspace_id, ref);
      }

      case "map_list":
        return await listMaps(ctx.workspace_id);

      case "map_ensure":
        return await ensureMainMap(ctx.workspace_id);

      case "map_get": {
        const slug = (input.slug as string) || "main";
        return await getMap(ctx.workspace_id, slug);
      }

      default:
        throw new Error(`unknown memory graph action: ${action}`);
    }
  } catch (e) {
    if (isMemoryGraphError(e)) {
      throw new Error(JSON.stringify(e.toJSON()));
    }
    throw e;
  }
}
