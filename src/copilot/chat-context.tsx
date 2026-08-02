// Persistent Copilot chat state. Lives at the DashboardLayout level so it
// survives tab switches, and persists to localStorage so a page reload
// doesn't lose the conversation or cancel work in progress.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getCommand, getManifest } from "./registry";
import { useCopilotBus } from "./bus";

type ToolCall = { id: string; name: string; arguments: any };
type ChipState = "running" | "ok" | "error" | "blocked";
export type Chip = {
  id: string; name: string; args: any; state: ChipState;
  result?: any; error?: string;
};
export type Msg = {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  chips?: Chip[];
};

const MAX_TURNS = 5;
const STORAGE_KEY = "memorify.copilot.chat.v1";

type Persisted = { messages: Msg[]; pending: boolean };

function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { messages: [], pending: false };
    const p = JSON.parse(raw);
    return { messages: Array.isArray(p.messages) ? p.messages : [], pending: !!p.pending };
  } catch {
    return { messages: [], pending: false };
  }
}

type Ctx = {
  messages: Msg[];
  loading: boolean;
  send: (text: string) => void;
  confirmChip: (msgIdx: number, chipId: string, accept: boolean) => void;
  clear: () => void;
};

const ChatCtx = createContext<Ctx | null>(null);

export function CopilotChatProvider({ children }: { children: ReactNode }) {
  const { runCommand } = useCopilotBus();
  const [messages, setMessages] = useState<Msg[]>(() => loadPersisted().messages);
  const [loading, setLoading] = useState(false);
  const resumedRef = useRef(false);

  // Persist messages + a "pending" flag (true while a runLoop is in flight).
  const persist = useCallback((msgs: Msg[], pending: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: msgs, pending }));
    } catch {}
  }, []);

  const buildApiMessages = (msgs: Msg[]) =>
    msgs.map((m) => {
      if (m.role === "tool") {
        return { role: "tool", tool_call_id: m.tool_call_id, content: m.content };
      }
      if (m.role === "assistant" && m.chips?.length) {
        return {
          role: "assistant",
          content: m.content || "",
          tool_calls: m.chips.map((c) => ({
            id: c.id, type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          })),
        };
      }
      return { role: m.role, content: m.content };
    });

  const runLoop = useCallback(async (initial: Msg[]) => {
    let working = initial;
    setLoading(true);
    persist(working, true);
    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const { data, error } = await supabase.functions.invoke("agent-chat", {
          body: { messages: buildApiMessages(working), tools: getManifest() },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);

        const calls: ToolCall[] = (data as any).tool_calls ?? [];
        const content: string = (data as any).content ?? "";

        if (!calls.length) {
          working = [...working, { role: "assistant", content: content || "Done." }];
          setMessages(working);
          persist(working, false);
          return;
        }

        const chips: Chip[] = calls.map((c) => {
          const def = getCommand(c.name);
          return {
            id: c.id, name: c.name, args: c.arguments,
            state: def?.destructive ? "blocked" : "running",
          };
        });
        const assistantMsg: Msg = { role: "assistant", content, chips };
        working = [...working, assistantMsg];
        setMessages(working);
        persist(working, true);

        const toRun = calls.filter((c) => !getCommand(c.name)?.destructive);
        const blocked = calls.filter((c) => getCommand(c.name)?.destructive);

        if (toRun.length) {
          const results = await Promise.all(
            toRun.map(async (c) => ({ call: c, out: await runCommand(c.name, c.arguments) }))
          );
          const toolMsgs: Msg[] = [];
          working = working.map((m) => {
            if (m !== assistantMsg) return m;
            const next = { ...m, chips: m.chips!.map((ch) => ({ ...ch })) };
            for (const { call, out } of results) {
              const ch = next.chips!.find((x) => x.id === call.id)!;
              ch.state = out.ok ? "ok" : "error";
              ch.result = out.data;
              ch.error = out.error;
              toolMsgs.push({
                role: "tool", tool_call_id: call.id,
                content: JSON.stringify(out).slice(0, 8000),
              });
            }
            return next;
          });
          working = [...working, ...toolMsgs];
          setMessages(working);
          persist(working, true);
        }

        if (blocked.length) {
          persist(working, false);
          return;
        }
      }
      persist(working, false);
    } catch (e: any) {
      toast.error(e?.message ?? "Copilot failed");
      const next = [...working, { role: "assistant", content: "Sorry — I hit an error. Try again." } as Msg];
      setMessages(next);
      persist(next, false);
    } finally {
      setLoading(false);
    }
  }, [runCommand, persist]);

  // Resume any work that was in flight when the page reloaded.
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    const { messages: persisted, pending } = loadPersisted();
    if (!pending || !persisted.length) return;
    const last = persisted[persisted.length - 1];
    // Resume only if last message is a user prompt or tool result waiting
    // for the model to act. Don't resume if we're sitting on a blocked chip.
    const hasBlocked = persisted.some(
      (m) => m.role === "assistant" && m.chips?.some((c) => c.state === "blocked")
    );
    if (hasBlocked) return;
    if (last.role === "user" || last.role === "tool") {
      runLoop(persisted);
    }
  }, [runLoop]);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    runLoop([...messages, { role: "user", content: trimmed }]);
  }, [messages, loading, runLoop]);

  const confirmChip = useCallback(async (msgIdx: number, chipId: string, accept: boolean) => {
    const msg = messages[msgIdx];
    const chip = msg?.chips?.find((c) => c.id === chipId);
    if (!chip) return;
    let next = [...messages];
    if (!accept) {
      next[msgIdx] = {
        ...msg,
        chips: msg.chips!.map((c) => (c.id === chipId ? { ...c, state: "error", error: "cancelled" } : c)),
      };
      next.push({
        role: "tool", tool_call_id: chip.id,
        content: JSON.stringify({ ok: false, error: "user cancelled" }),
      });
      setMessages(next);
      runLoop(next);
      return;
    }
    next[msgIdx] = {
      ...msg,
      chips: msg.chips!.map((c) => (c.id === chipId ? { ...c, state: "running" } : c)),
    };
    setMessages(next);
    persist(next, true);
    const out = await runCommand(chip.name, chip.args);
    next = [...next];
    next[msgIdx] = {
      ...next[msgIdx],
      chips: next[msgIdx].chips!.map((c) =>
        c.id === chipId ? { ...c, state: out.ok ? "ok" : "error", result: out.data, error: out.error } : c
      ),
    };
    next.push({
      role: "tool", tool_call_id: chip.id,
      content: JSON.stringify(out).slice(0, 8000),
    });
    setMessages(next);
    runLoop(next);
  }, [messages, runCommand, runLoop, persist]);

  const clear = useCallback(() => {
    setMessages([]);
    persist([], false);
  }, [persist]);

  const value = useMemo(
    () => ({ messages, loading, send, confirmChip, clear }),
    [messages, loading, send, confirmChip, clear]
  );

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}

export function useCopilotChat() {
  const v = useContext(ChatCtx);
  if (!v) throw new Error("useCopilotChat must be used within CopilotChatProvider");
  return v;
}
