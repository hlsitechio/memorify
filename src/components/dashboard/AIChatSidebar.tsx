import { useEffect, useRef, useState } from "react";
import { useDashboardUI } from "./DashboardUIContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot, X, Send, Sparkles, Loader2, CheckCircle2, AlertCircle, ListTree, Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { useCopilotChat, type Chip } from "@/copilot/chat-context";

const SUGGESTIONS = [
  "Add a Slack relay HTTP plugin",
  "Move my plugins around",
  "Show me what you can do here",
  "Open the events stream",
];

export function AIChatSidebar() {
  const { chatOpen, setChatOpen } = useDashboardUI();
  const { messages, loading, send, confirmChip, clear } = useCopilotChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const submit = (text: string) => {
    if (!text.trim() || loading) return;
    setInput("");
    send(text);
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
            <div className="text-[11px] text-muted-foreground">
              {loading ? "Working…" : "Agentic — runs commands for you"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" onClick={clear} aria-label="Clear chat" title="Clear">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => setChatOpen(false)} aria-label="Close copilot">
            <X className="h-4 w-4" />
          </Button>
        </div>
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
                      onClick={() => submit(s)}
                      className="text-left text-sm px-2.5 py-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => submit("List the commands you can run on this page.")}
                className="w-full flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground px-1"
              >
                <ListTree className="h-3 w-3" /> What can you do here?
              </button>
            </div>
          )}

          {messages.map((m, i) => {
            if (m.role === "tool") return null;
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
        onSubmit={(e) => { e.preventDefault(); submit(input); }}
        className="p-3 border-t border-border shrink-0 flex items-center gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={loading ? "Copilot is working…" : "Ask Copilot…"}
          className="h-9"
        />
        <Button type="submit" size="icon" className="h-9 w-9" disabled={loading || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </aside>
  );
}

function ActionChip({ chip, onConfirm }: { chip: Chip; onConfirm: (accept: boolean) => void }) {
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
