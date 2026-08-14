/**
 * Memorify Mind Map — module entry (Deno).
 * Frontend types live under ./src/types (import from app as path alias later).
 */

export {
  classifyMemoryRef,
  isMemId,
  isUuid,
  memIdFromUuid,
  mintMemId,
} from "./backend/lib/memory-ids.ts";

export {
  MemoryGraphError,
  isMemoryGraphError,
  type MemoryErrorCode,
} from "./backend/lib/memory-errors.ts";

export {
  assertNoContentKey,
  isBuildZone,
  opsFromDebugRow,
  toChip,
  toFullNode,
  TOUCHABLE_STATUSES,
  type MemoryEdgePublic,
  type MemoryNodeChip,
  type MemoryNodeFull,
  type MemoryNodeOps,
  type MemoryRow,
  type MemoryStatus,
} from "./backend/lib/memory-privacy.ts";

export {
  assertTouchable,
  ensureMainMap,
  getFull,
  getMap,
  healthForAgent,
  healthOps,
  link,
  listMaps,
  neighbors,
  remember,
  resolveMemory,
  saveLayout,
  subgraph,
  unlink,
  type GraphActor,
} from "./backend/lib/memory-graph.ts";

export {
  handleMemoryGraphAction,
  MEMORY_GRAPH_ACTIONS,
} from "./backend/routes/v1-memory-graph.ts";

export {
  MEMORY_GRAPH_MCP_TOOLS,
  type McpToolDef,
} from "./backend/routes/mcp-tools.ts";

export { handleMemoryApi, listMemoryChips } from "./backend/routes/memory-api.ts";
export { handleOpsMemory } from "./backend/routes/ops-memory.ts";
