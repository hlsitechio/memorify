// Copilot chat state lives at the DashboardLayout level so it survives tab
// switches. Supports SSE streaming from OpenRouter with live token display.

import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from "react";
import { useAuth as useClerkAuth, useOrganization } from "@clerk/react";
import { toast } from "sonner";
import { getCommand, getManifest } from "./registry";
import { useCopilotBus } from "./bus";
import { readCurrentWorkspace } from "@/hooks/useCurrentWorkspace";

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
  streaming?: boolean;
};

const MAX_TURNS = 5;
function apiErrorMessage(data: any, fallback: string): string {
  if (typeof data?.detail === "string" && data.detail) return data.detail;
  if (typeof data?.error === "string" && data.error) return data.error;
  return fallback;
}

function fallbackToolSummary(msgs: Msg[], error: string): Msg | null {
  const toolMessages = msgs.filter((m) => m.role === "tool");
  if (!toolMessages.length) return null;
  const last = toolMessages[toolMessages.length - 1];
  let parsed: any = null;
  try {
    parsed = JSON.parse(last.content);
  } catch {
    parsed = last.content;
  }
  return {
    role: "assistant",
    content: `I ran the tool, but OpenRouter failed while summarizing the result: ${error}\n\nRaw result:\n\`\`\`json\n${JSON.stringify(parsed, null, 2).slice(0, 6000)}\n\`\`\``,
  };
}

type Ctx = {
  messages: Msg[];
  loading: boolean;
  streamingText: string;
  isStreaming: boolean;
  send: (text: string) => void;
  confirmChip: (msgIdx: number, chipId: string, accept: boolean) => void;
  clear: () => void;
};

const ChatCtx = createContext<Ctx | null>(null);

export function CopilotChatProvider({ children }: { children: ReactNode }) {
  const { runCommand } = useCopilotBus();
  const { getToken, orgId } = useClerkAuth();
  const { organization } = useOrganization();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const sessionIdRef = useRef<string | null>(null);

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

  // ── Auto-save session to DB ──────────────────────────────────────
  const persistSession = useCallback(async (msgs: Msg[]) => {
    if (msgs.length < 2) return;
    try {
      const token = await getToken();
      if (!token) return;
      const ws = readCurrentWorkspace();
      const workspaceId = organization?.id || orgId || (ws?.kind === "agent" ? ws.id : ws?.id);
      const res = await fetch("/api/copilot/action", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
        },
        body: JSON.stringify({
          name: "copilot.session.save",
          args: {
            id: sessionIdRef.current,
            messages: msgs,
            tool_calls: msgs.flatMap((m) => m.chips ?? []).map((c) => ({ name: c.name, args: c.args })),
            title: msgs.find((m) => m.role === "user")?.content?.slice(0, 80) || "Untitled",
          },
          workspace_id: workspaceId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok && data?.data?.id) {
        sessionIdRef.current = data.data.id;
      }
    } catch {
      // Silent
    }
  }, [getToken, orgId, organization?.id]);

  // ── Self-improvement review ──────────────────────────────────────
  const runSelfReview = useCallback(async (sessionId: string) => {
    try {
      const token = await getToken();
      if (!token) return;
      const ws = readCurrentWorkspace();
      const workspaceId = organization?.id || orgId || (ws?.kind === "agent" ? ws.id : ws?.id);
      const res = await fetch("/api/copilot/action", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
        },
        body: JSON.stringify({
          name: "copilot.session.review",
          args: { id: sessionId },
          workspace_id: workspaceId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok && data?.data?.memory_id) {
        toast.success("💾 Self-improvement review: saved conversation as memory.", { duration: 4000 });
      }
    } catch {
      // Silent
    }
  }, [getToken, orgId, organization?.id]);

  // ── SSE Stream reader ────────────────────────────────────────────
  const streamChat = useCallback(async (
    apiMessages: any[],
    tools: any[],
    workspaceId: string | undefined,
    token: string,
  ): Promise<{ content: string; tool_calls: ToolCall[] }> => {
    const res = await fetch("/api/copilot/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
      },
      body: JSON.stringify({ messages: apiMessages, tools }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(apiErrorMessage(errData, `Copilot HTTP ${res.status}: ${errData?.detail || errData?.error || ""}`));
    }

    // Check if we got SSE or JSON fallback
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/event-stream")) {
      // Non-streaming fallback (error or edge function didn't stream)
      const data = await res.json().catch(() => ({}));
      if (data?.error) throw new Error(apiErrorMessage(data, "Copilot failed"));
      return {
        content: data.content || "",
        tool_calls: data.tool_calls || [],
      };
    }

    // Read SSE stream
    setIsStreaming(true);
    setStreamingText("");
    let fullContent = "";
    let collectedCalls: ToolCall[] = [];

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const jsonStr = trimmed.slice(6);
          if (jsonStr === "[DONE]") continue;

          try {
            const evt = JSON.parse(jsonStr);
            if (evt.type === "content" && evt.text) {
              fullContent += evt.text;
              setStreamingText(fullContent);
            } else if (evt.type === "done") {
              fullContent = evt.content || fullContent;
              collectedCalls = evt.tool_calls || [];
              setStreamingText(fullContent);
            } else if (evt.type === "error") {
              throw new Error(evt.error || "Stream error");
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== "Stream error") {
              // skip malformed json
            } else {
              throw parseErr;
            }
          }
        }
      }
    } finally {
      setIsStreaming(false);
    }

    return { content: fullContent, tool_calls: collectedCalls };
  }, []);

  const runLoop = useCallback(async (initial: Msg[]) => {
    let working = initial;
    setLoading(true);
    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const token = await getToken();
        if (!token) throw new Error("No Clerk session token");
        const ws = readCurrentWorkspace();
        const workspaceId = organization?.id || orgId || (ws?.kind === "agent" ? ws.id : ws?.id);

        const { content, tool_calls: calls } = await streamChat(
          buildApiMessages(working),
          getManifest(),
          workspaceId,
          token,
        );

        if (!calls.length) {
          working = [...working, { role: "assistant", content: content || "Done." }];
          setMessages(working);
          setStreamingText("");
          await persistSession(working);
          if (sessionIdRef.current) await runSelfReview(sessionIdRef.current);
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
        setStreamingText("");

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
        }

        if (blocked.length) {
          await persistSession(working);
          return;
        }
      }
      await persistSession(working);
      if (sessionIdRef.current) await runSelfReview(sessionIdRef.current);
    } catch (e: any) {
      const message = e?.message ?? "Copilot failed";
      toast.error(message);
      const fallback = fallbackToolSummary(working, message);
      const next = [
        ...working,
        fallback ?? ({ role: "assistant", content: `Sorry, I hit an error: ${message}` } as Msg),
      ];
      setMessages(next);
      setStreamingText("");
      await persistSession(next);
    } finally {
      setLoading(false);
      setIsStreaming(false);
    }
  }, [runCommand, getToken, orgId, organization?.id, persistSession, runSelfReview, streamChat]);

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
  }, [messages, runCommand, runLoop]);

  const clear = useCallback(() => {
    setMessages([]);
    setStreamingText("");
    sessionIdRef.current = null;
  }, []);

  const value = useMemo(
    () => ({ messages, loading, streamingText, isStreaming, send, confirmChip, clear }),
    [messages, loading, streamingText, isStreaming, send, confirmChip, clear]
  );

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}

export function useCopilotChat() {
  const v = useContext(ChatCtx);
  if (!v) throw new Error("useCopilotChat must be used within CopilotChatProvider");
  return v;
}