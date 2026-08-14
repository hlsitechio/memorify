// Copilot global bus. Provides:
//   - runCommand(name, args): unified dispatch (client or server).
//   - useRegisterFlash(key, fn): pages register a "flash" callback to
//     visually highlight a row when the agent touches it.
//   - useDashboardWidgetBridge(...): Home page wires its layout state.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useAuth as useClerkAuth, useOrganization } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import { toast as sonner } from "sonner";
import { getCommand } from "./registry";
import type { ClientCtx, CommandResult } from "./types";
import { useDashboardUI } from "@/components/dashboard/DashboardUIContext";
import { readCurrentWorkspace } from "@/hooks/useCurrentWorkspace";

type WidgetBridge = ClientCtx["widgets"];
const noopBridge: WidgetBridge = {
  list: () => [],
  move: () => {},
  resize: () => {},
  add: () => {},
  remove: () => {},
  reset: () => {},
};

function apiErrorMessage(data: any, fallback: string): string {
  if (typeof data?.detail === "string" && data.detail) return data.detail;
  if (typeof data?.error === "string" && data.error) return data.error;
  return fallback;
}

type BusValue = {
  runCommand: (name: string, args?: any) => Promise<CommandResult>;
  registerFlash: (key: string, fn: () => void) => () => void;
  setWidgetBridge: (b: WidgetBridge) => void;
};

const Ctx = createContext<BusValue | null>(null);

export function CopilotBusProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { getToken, orgId } = useClerkAuth();
  const { organization } = useOrganization();
  const { openCmd, setChatOpen } = useDashboardUI();
  const flashRegistry = useRef(new Map<string, () => void>());
  const widgetBridgeRef = useRef<WidgetBridge>(noopBridge);

  const registerFlash = useCallback((key: string, fn: () => void) => {
    flashRegistry.current.set(key, fn);
    return () => {
      if (flashRegistry.current.get(key) === fn) flashRegistry.current.delete(key);
    };
  }, []);

  const setWidgetBridge = useCallback((b: WidgetBridge) => {
    widgetBridgeRef.current = b;
  }, []);

  const ctx: ClientCtx = useMemo(
    () => ({
      navigate,
      goBack: () => window.history.back(),
      goForward: () => window.history.forward(),
      toast: (message, variant) => {
        if (variant === "error") sonner.error(message);
        else if (variant === "success") sonner.success(message);
        else sonner(message);
      },
      openCmd,
      setChatOpen,
      flash: (key) => flashRegistry.current.get(key)?.(),
      widgets: {
        list: () => widgetBridgeRef.current.list(),
        move: (id, x, y) => widgetBridgeRef.current.move(id, x, y),
        resize: (id, w, h) => widgetBridgeRef.current.resize(id, w, h),
        add: (id) => widgetBridgeRef.current.add(id),
        remove: (id) => widgetBridgeRef.current.remove(id),
        reset: () => widgetBridgeRef.current.reset(),
      },
    }),
    [navigate, openCmd, setChatOpen]
  );

  const runCommand = useCallback(
    async (name: string, args: any = {}): Promise<CommandResult> => {
      const def = getCommand(name);
      if (!def) return { ok: false, error: `unknown command: ${name}` };

      try {
        if (def.scope === "client") {
          if (!def.handler) return { ok: false, error: `client command "${name}" has no handler` };
          const out = await def.handler(args, ctx);
          return out ?? { ok: true };
        }
        // server scope — auto-inject the active agent_id so server commands
        // (documents.*, etc.) are scoped to the workspace the user picked.
        const ws = readCurrentWorkspace();
        const workspaceId = organization?.id || orgId || ws?.id;
        const finalArgs =
          ws?.kind === "agent" && ws.agentId && args && args.agent_id === undefined
            ? { ...args, agent_id: ws.agentId }
            : args;
        const token = await getToken();
        if (!token) return { ok: false, error: "No Clerk session token" };
        const res = await fetch("/api/copilot/action", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
          },
          body: JSON.stringify({ name, args: finalArgs, ...(workspaceId ? { workspace_id: workspaceId } : {}) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, error: apiErrorMessage(data, `HTTP ${res.status}`) };
        if (data && (data as any).ok === false) return data as CommandResult;
        return (data as any)?.ok === true ? data as CommandResult : { ok: true, data };
      } catch (e: any) {
        return { ok: false, error: e?.message ?? "command failed" };
      }
    },
    [ctx, getToken, orgId, organization?.id]
  );

  const value = useMemo(
    () => ({ runCommand, registerFlash, setWidgetBridge }),
    [runCommand, registerFlash, setWidgetBridge]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCopilotBus() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCopilotBus must be used within CopilotBusProvider");
  return v;
}

export function useRegisterFlash(key: string | null, fn: () => void) {
  const { registerFlash } = useCopilotBus();
  useEffect(() => {
    if (!key) return;
    return registerFlash(key, fn);
  }, [key, fn, registerFlash]);
}

export function useDashboardWidgetBridge(b: WidgetBridge) {
  const { setWidgetBridge } = useCopilotBus();
  useEffect(() => {
    setWidgetBridge(b);
    return () => setWidgetBridge(noopBridge);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
