import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardUI } from "./DashboardUIContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot, X, Send, Sparkles, Loader2, CheckCircle2, AlertCircle, ListTree,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { useCopilotBus } from "@/copilot/bus";
import { getCommand, getManifest } from "@/copilot/registry";

type ToolCall = { id: string; name: string; arguments: any };
type ChipState = "running" | "ok" | "error" | "blocked";
type Chip = { id: string; name: string; args: any; state: ChipState; result?: any; error?: string };

type Msg = {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  chips?: Chip[];
  pendingConfirm?: { call: ToolCall };
};

const SUGGESTIONS = [
  "Add a Slack relay HTTP plugin",
  "Move my plugins around",
  "Show me what you can do here",
  "Open the events stream",
];

const MAX_TURNS = 5;

export function AIChatSidebar() {
  const { chatOpen, setChatOpen } = useDashboardUI();
  const { runCommand } = useCopilotBus();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Build the OpenAI-format message list to ship to agent-chat.
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
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          })),
        };
      }
      return { role: m.role, content: m.content };
    });

  // Run the multi-turn loop until the model returns no more tool_calls
  // (or we hit a confirm gate / turn limit).
  const runLoop = async (initialMessages: Msg[]) => {
    let working = initialMessages;
    setLoading(true);
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
          return;
        }

        // Build chips for each call. Destructive ones go to "blocked" state
        // and get rendered with a Confirm/Cancel pair.
        const chips: Chip[] = calls.map((c) => {
          const def = getCommand(c.name);
          const isDestructive = !!def?.destructive;
          return {
            id: c.id,
            name: c.name,
            args: c.arguments,
            state: isDestructive ? "blocked" : "running",
          };
        });
        const assistantMsg: Msg = { role: "assistant", content, chips };
        working = [...working, assistantMsg];
        setMessages(working);

        // Run all non-destructive calls in parallel.
        const toRun = calls.filter((c) => !getCommand(c.name)?.destructive);
        const blocked = calls.filter((c) => getCommand(c.name)?.destructive);

        if (toRun.length) {
          const results = await Promise.all(
            toRun.map(async (c) => {
              const out = await runCommand(c.name, c.arguments);
              return { call: c, out };
            })
          );

          // Update chips + append tool messages.
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
                role: "tool",
                tool_call_id: call.id,
                content: JSON.stringify(out).slice(0, 8000),
              });
            }
            return next;
          });
          working = [...working, ...toolMsgs];
          setMessages(working);
        }

        // If any are blocked, stop the loop here — user must confirm.
        if (blocked.length) return;
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Copilot failed");
      setMessages((m) => [...m, { role: "assistant", content: "Sorry — I hit an error. Try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");
    runLoop([...messages, { role: "user", content: trimmed }]);
  };

  // For destructive chips: confirm = run the command, then continue the loop.
  const confirmChip = async (msgIdx: number, chipId: string, accept: boolean) => {
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
        role: "tool",
        tool_call_id: chip.id,
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
      role: "tool",
      tool_call_id: chip.id,
      content: JSON.stringify(out).slice(0, 8000),
    });
    setMessages(next);
    runLoop(next);
  };

  return (
    <aside
      className={cn(
        "shrink-0 border-l border-border bg-card flex flex-col transition-[width] duration-200 overflow-hidden",
        chatOpen ? "w-96" : "w-0"
      )}
      aria-hidden={!chatOpen}
    >
      <div className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-md bg-gradient-primary flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight">Copilot</div>
            <div className="text-[11px] text-muted-foreground">Agentic — runs commands for you</div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setChatOpen(false)} aria-label="Close copilot">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-4 space-y-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-secondary/40 p-3">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Try
                </div>
                <div className="mt-2 grid gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-left text-sm px-2.5 py-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => send("List the commands you can run on this page.")}
                className="w-full flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground px-1"
              >
                <ListTree className="h-3 w-3" /> What can you do here?
              </button>
            </div>
          )}

          {messages.map((m, i) => {
            if (m.role === "tool") return null; // hidden from UI
            return (
              <div key={i} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/60 text-foreground"
                  )}
                >
                  {m.role === "assistant" ? (
                    m.content ? (
                      <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    ) : null
                  ) : (
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  )}
                  {m.chips && m.chips.length > 0 && (
                    <div className={cn("space-y-1", m.content ? "mt-2" : "")}>
                      {m.chips.map((c) => (
                        <ActionChip
                          key={c.id}
                          chip={c}
                          onConfirm={(accept) => confirmChip(i, c.id, accept)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
            </div>
          )}
        </div>
      </ScrollArea>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="p-3 border-t border-border shrink-0 flex items-center gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Copilot…"
          className="h-9"
          disabled={loading}
        />
        <Button type="submit" size="icon" className="h-9 w-9" disabled={loading || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </aside>
  );
}

function ActionChip({
  chip,
  onConfirm,
}: {
  chip: Chip;
  onConfirm: (accept: boolean) => void;
}) {
  const Icon =
    chip.state === "ok" ? CheckCircle2 :
    chip.state === "error" ? AlertCircle :
    Loader2;
  const tone =
    chip.state === "ok" ? "text-emerald-400" :
    chip.state === "error" ? "text-destructive" :
    chip.state === "blocked" ? "text-amber-400" :
    "text-muted-foreground";

  return (
    <div className="rounded-md border border-border bg-background/40 px-2 py-1.5">
      <div className="flex items-center gap-1.5 text-[11px]">
        <Icon className={cn("h-3 w-3 shrink-0", chip.state === "running" && "animate-spin", tone)} />
        <span className="font-mono truncate">{chip.name}</span>
        {chip.error && <span className="text-destructive truncate ml-1">· {chip.error}</span>}
      </div>
      {chip.state === "blocked" && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <Button size="sm" variant="destructive" className="h-6 px-2 text-[11px]" onClick={() => onConfirm(true)}>
            Confirm
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => onConfirm(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
