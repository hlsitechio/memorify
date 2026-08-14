// lib/logger.ts — Structured logging for Memorify Edge Functions / Deno
// Provides: JSON console output + buffered DB persistence to security_logs & agent_calls

import { getSql } from "./db.ts";

export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";

export interface LogEntry {
  level: LogLevel;
  message: string;
  workspace_id?: string;
  agent_id?: string;
  request_id?: string;       // Correlation ID (generate per request)
  user_id?: string;          // Clerk user_id
  action?: string;           // e.g., "memory.remember", "mcp.call"
  resource_type?: string;    // "memory" | "agent" | "token" | "workspace"
  resource_id?: string;
  metadata?: Record<string, unknown>;
  duration_ms?: number;
  status?: "ok" | "error";
  error_code?: string;
  error_message?: string;
  ip?: string;
  user_agent?: string;
  created_at?: string;
  // Allow additional arbitrary fields for flexibility
  [key: string]: unknown;
}

interface LoggerMethods {
  debug: (msg: string, meta?: Partial<LogEntry>) => void;
  info: (msg: string, meta?: Partial<LogEntry>) => void;
  warn: (msg: string, meta?: Partial<LogEntry>) => void;
  error: (msg: string, meta?: Partial<LogEntry>) => void;
  critical: (msg: string, meta?: Partial<LogEntry>) => void;
  child: (bindings: Partial<LogEntry>) => LoggerMethods;
  flush: () => Promise<void>;
  generateRequestId: () => string;
}

const LOG_LEVEL_ORDER: LogLevel[] = ["debug", "info", "warn", "error", "critical"];
const MIN_LEVEL = (Deno.env.get("LOG_LEVEL") as LogLevel) ?? "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER.indexOf(level) >= LOG_LEVEL_ORDER.indexOf(MIN_LEVEL);
}

function generateRequestId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// In-memory buffer for batch flush (Edge-friendly)
const logBuffer: LogEntry[] = [];
const BUFFER_FLUSH_SIZE = 50;
const BUFFER_FLUSH_MS = 5000;

async function flushBuffer(): Promise<void> {
  if (logBuffer.length === 0) return;
  const batch = logBuffer.splice(0, BUFFER_FLUSH_SIZE);
  
  try {
    // Batch insert to security_logs + agent_calls
    for (const entry of batch) {
      // Security logs for security-relevant events
      if (["warn", "error", "critical"].includes(entry.level) || 
          entry.action?.startsWith("auth.") || 
          entry.action?.startsWith("token.") ||
          entry.action?.startsWith("workspace.") ||
          entry.action?.startsWith("mcp_server.")) {
        await getSql()`
          INSERT INTO security_logs (workspace_id, event_type, payload, severity)
          VALUES (${entry.workspace_id ?? null}, ${entry.action ?? "app.log"}, 
                  ${JSON.stringify(entry)}, ${entry.level})
        `;
      }
      
      // Agent calls for all API gateway calls
      if (entry.action && entry.agent_id) {
        await getSql()`
          INSERT INTO agent_calls (workspace_id, agent_id, kind, name, status, latency_ms, metadata)
          VALUES (${entry.workspace_id}, ${entry.agent_id}, 
                  ${entry.action.split(".")[0]}, ${entry.action}, 
                  ${entry.status ?? "ok"}, ${entry.duration_ms ?? 0}, ${JSON.stringify(entry.metadata ?? {})})
        `;
      }
    }
  } catch (e) {
    // Fail silently - never break main flow
    console.error("Log flush failed:", e);
  }
}

// Auto-flush interval
if (typeof setInterval !== "undefined") {
  setInterval(flushBuffer, BUFFER_FLUSH_MS);
}

function createLogger(bindings: Partial<LogEntry> = {}): LoggerMethods {
  const logFn = (level: LogLevel, message: string, meta?: Partial<LogEntry>) => {
    if (!shouldLog(level)) return;
    
    const entry: LogEntry = {
      level,
      message,
      request_id: meta?.request_id ?? bindings.request_id ?? generateRequestId(),
      workspace_id: meta?.workspace_id ?? bindings.workspace_id,
      agent_id: meta?.agent_id ?? bindings.agent_id,
      user_id: meta?.user_id ?? bindings.user_id,
      action: meta?.action ?? bindings.action,
      resource_type: meta?.resource_type ?? bindings.resource_type,
      resource_id: meta?.resource_id ?? bindings.resource_id,
      metadata: meta?.metadata ?? bindings.metadata,
      duration_ms: meta?.duration_ms ?? bindings.duration_ms,
      status: meta?.status ?? bindings.status,
      error_code: meta?.error_code ?? bindings.error_code,
      error_message: meta?.error_message ?? bindings.error_message,
      ip: meta?.ip ?? bindings.ip,
      user_agent: meta?.user_agent ?? bindings.user_agent,
      created_at: new Date().toISOString(),
      ...bindings,
      ...meta,
    };
    
    // Console output (structured JSON for log aggregation)
    const consoleEntry = { ...entry };
    if (level === "error" || level === "critical") {
      console.error(JSON.stringify(consoleEntry));
    } else {
      console.log(JSON.stringify(consoleEntry));
    }
    
    // Buffer for DB persistence
    logBuffer.push(entry);
    if (logBuffer.length >= BUFFER_FLUSH_SIZE) flushBuffer();
  };
  
  const logger: LoggerMethods = {
    debug: (msg: string, meta?: Partial<LogEntry>) => logFn("debug", msg, meta),
    info:  (msg: string, meta?: Partial<LogEntry>) => logFn("info", msg, meta),
    warn:  (msg: string, meta?: Partial<LogEntry>) => logFn("warn", msg, meta),
    error: (msg: string, meta?: Partial<LogEntry>) => logFn("error", msg, meta),
    critical: (msg: string, meta?: Partial<LogEntry>) => logFn("critical", msg, meta),
    child: (childBindings: Partial<LogEntry>) => createLogger({ ...bindings, ...childBindings }),
    async flush() { await flushBuffer(); },
    generateRequestId,
  };
  
  return logger;
}

export const logger = createLogger();