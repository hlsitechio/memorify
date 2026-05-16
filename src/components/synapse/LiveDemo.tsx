import { useEffect, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

const GATEWAY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-gateway`;
// Public demo agent token — intentionally exposed; only allows memory ops in the demo namespace.
const DEMO_TOKEN = "public_demo_token_synapse_landing";

type Memory = { id: string; content: string; tags: string[]; created_at: string };

export const LiveDemo = () => {
  const [content, setContent] = useState("Memorify will replace MCP juggling for me.");
  const [tags, setTags] = useState("intent");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string>("");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [tab, setTab] = useState<"remember" | "recall">("remember");
  const [recallQuery, setRecallQuery] = useState("");

  const refresh = async () => {
    try {
      const res = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEMO_TOKEN}` },
        body: JSON.stringify({ agent: "memory", action: "list", input: { limit: 8 } }),
      });
      const json = await res.json();
      setMemories(json.result ?? []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const send = async () => {
    setLoading(true);
    setResponse("");
    try {
      const body =
        tab === "remember"
          ? {
              agent: "memory",
              action: "remember",
              input: {
                content,
                tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
              },
            }
          : {
              agent: "memory",
              action: "recall",
              input: { query: recallQuery, limit: 5 },
            };

      const res = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEMO_TOKEN}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      setResponse(JSON.stringify(json, null, 2));
      if (json.status === "success") {
        toast.success(tab === "remember" ? "Memory stored" : `Recalled ${Array.isArray(json.result) ? json.result.length : 0} memories`);
        if (tab === "remember") refresh();
      } else {
        toast.error(json.error ?? "Gateway error");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="demo" className="py-24 border-t border-border/50 relative">
      <div className="container">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs font-mono text-primary mb-3 tracking-wider flex items-center justify-center gap-2">
            <Sparkles className="w-3 h-3" /> LIVE GATEWAY
          </p>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
            This isn't a mockup. <span className="text-gradient">Try it.</span>
          </h2>
          <p className="mt-5 text-muted-foreground text-lg">
            Real endpoint, real database, real protocol. Store a memory below — any visitor's agent can recall it.
          </p>
        </div>

        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-4">
          {/* Request panel */}
          <div className="rounded-xl border border-border bg-card/60 backdrop-blur card-elevated overflow-hidden">
            <div className="flex border-b border-border">
              {(["remember", "recall"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 px-4 py-3 text-sm font-mono transition-colors ${
                    tab === t ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  memory.{t}
                </button>
              ))}
            </div>
            <div className="p-5 space-y-3">
              {tab === "remember" ? (
                <>
                  <Field label="content">
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      rows={3}
                      className="w-full bg-background border border-border rounded-md p-3 text-sm font-mono focus:outline-none focus:border-primary/50 transition-colors resize-none"
                    />
                  </Field>
                  <Field label="tags (comma separated)">
                    <input
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      className="w-full bg-background border border-border rounded-md p-3 text-sm font-mono focus:outline-none focus:border-primary/50 transition-colors"
                    />
                  </Field>
                </>
              ) : (
                <Field label="query (substring match on content/tags)">
                  <input
                    value={recallQuery}
                    onChange={(e) => setRecallQuery(e.target.value)}
                    placeholder="e.g. preference"
                    className="w-full bg-background border border-border rounded-md p-3 text-sm font-mono focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </Field>
              )}
              <button
                onClick={send}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-md bg-gradient-primary text-primary-foreground font-medium glow-primary hover:scale-[1.01] transition-transform disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                POST /v1
              </button>
              <p className="text-[10px] font-mono text-muted-foreground break-all">{GATEWAY_URL}</p>
            </div>
          </div>

          {/* Response / state panel */}
          <div className="rounded-xl border border-border bg-card/60 backdrop-blur card-elevated overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-[10px] font-mono tracking-wider text-muted-foreground">RESPONSE</span>
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
            </div>
            <pre className="p-4 text-xs font-mono overflow-auto no-scrollbar min-h-[180px] max-h-[260px] text-foreground/90 whitespace-pre-wrap">
              <code>{response || "// Awaiting first call..."}</code>
            </pre>
            <div className="border-t border-border px-4 py-3 text-[10px] font-mono tracking-wider text-muted-foreground">
              RECENT MEMORIES · public namespace
            </div>
            <div className="p-3 space-y-2 max-h-[200px] overflow-auto no-scrollbar">
              {memories.length === 0 && (
                <p className="text-xs text-muted-foreground font-mono px-2 py-3">No memories yet. Be the first.</p>
              )}
              {memories.map((m) => (
                <div key={m.id} className="px-3 py-2 rounded border border-border/60 bg-secondary/30 text-xs">
                  <p className="text-foreground/90 line-clamp-2">{m.content}</p>
                  {m.tags?.length > 0 && (
                    <div className="mt-1.5 flex gap-1 flex-wrap">
                      {m.tags.map((t) => (
                        <span key={t} className="font-mono text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-[10px] font-mono tracking-wider text-muted-foreground uppercase">{label}</label>
    <div className="mt-1.5">{children}</div>
  </div>
);
