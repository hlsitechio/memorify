// mindmap/backend/lib/memory-errors.ts

export type MemoryErrorCode =
  | "BUILD_ZONE"
  | "BUILD_ZONE_OR_MISSING"
  | "MEMORY_NOT_FOUND"
  | "CROSS_WORKSPACE"
  | "INVALID_REF"
  | "NOT_EDITABLE"
  | "EDGE_EXISTS"
  | "EDGE_NOT_FOUND"
  | "MAP_NOT_FOUND"
  | "FORBIDDEN"
  | "OPS_DISABLED";

export class MemoryGraphError extends Error {
  readonly code: MemoryErrorCode;
  readonly action: "do_not_touch" | "retry" | "fix_input" | "none";
  readonly httpStatus: number;

  constructor(
    code: MemoryErrorCode,
    message: string,
    opts?: { action?: MemoryGraphError["action"]; httpStatus?: number },
  ) {
    super(message);
    this.name = "MemoryGraphError";
    this.code = code;
    this.action = opts?.action ??
      (code === "BUILD_ZONE" || code === "BUILD_ZONE_OR_MISSING"
        ? "do_not_touch"
        : "none");
    this.httpStatus = opts?.httpStatus ??
      (code === "BUILD_ZONE" || code === "BUILD_ZONE_OR_MISSING"
        ? 409
        : code === "MEMORY_NOT_FOUND" || code === "EDGE_NOT_FOUND" ||
            code === "MAP_NOT_FOUND"
        ? 404
        : code === "FORBIDDEN" || code === "OPS_DISABLED"
        ? 403
        : 400);
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      action: this.action,
    };
  }
}

export function isMemoryGraphError(e: unknown): e is MemoryGraphError {
  return e instanceof MemoryGraphError;
}
