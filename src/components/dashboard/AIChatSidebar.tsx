import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardUI } from "./DashboardUIContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, X, Send, Sparkles, Loader2, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; actions?: { label: string; path?: string }[] };

const SUGGESTIONS = [
  "Open Memory",
  "Take me to API keys",
  "What can Skills do?",
  "Show event stream",
];

export function AIChatSidebar() {
  const { chatOpen, setChatOpen, openCmd } = useDashboardUI();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const runToolCalls = (calls: any[]): Msg["actions"] => {
    const actions: Msg["actions"] = [];
    for (const call of calls ?? []) {
      const name = call.function?.name;
      let args: any = {};
      try { args = JSON.parse(call.function?.arguments ?? "{}"); } catch { /* ignore */ }
      if (name === "navigate" && args.path) {
        navigate(args.path);
        actions.push({ label: `Opened ${args.path}`, path: args.path });
      } else if (name === "toast") {
        const v = args.variant;
        if (v === "error") toast.error(args.message);
        else if (v === "success") toast.success(args.message);
        else toast(args.message);
        actions.push({ label: args.message });
      } else if (name === "search") {
        openCmd(args.query ?? "");
        actions.push({ label: `Searched: ${args.query ?? ""}` });
      }
    }
    return actions;
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const userMsg: Msg = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("agent-chat", {
        body: { messages: next.map(({ role, content }) => ({ role, content })) },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const actions = runToolCalls((data as any).tool_calls);
      const content = (data as any).content || (actions?.length ? "Done." : "…");
      setMessages((m) => [...m, { role: "assistant", content, actions }]);
    } catch (e: any) {
      toast.error(e?.message ?? "Agent failed");
      setMessages((m) => [...m, { role: "assistant", content: "Sorry — I hit an error. Try again." }]);
    } finally {
      setLoading(false);
    }
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
            <div className="text-[11px] text-muted-foreground">Agentic — can navigate the UI</div>
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
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Try
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
              <p className="text-[11px] text-muted-foreground px-1">
                Ask me to open pages, explain features, or run actions. ⌘K for search • ⌘I to toggle me.
              </p>
            </div>
          )}

          {messages.map((m, i) => (
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
                  <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                )}
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {m.actions.map((a, j) => (
                      <div
                        key={j}
                        className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                      >
                        <ArrowUpRight className="h-3 w-3" />
                        <span className="truncate">{a.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking…
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
