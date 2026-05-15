const codeRequest = `POST https://api.memorify.dev/agent-gateway
Content-Type: application/json
Authorization: Bearer <agent_token>

{
  "agent":  "memory",
  "action": "remember",
  "input": {
    "content": "User prefers dark mode and cyan accents",
    "tags": ["preference", "ui"]
  }
}`;

const codeResponse = `{
  "status": "success",
  "result": {
    "id": "mem_8f3...",
    "content": "User prefers dark mode and cyan accents",
    "tags": ["preference", "ui"],
    "created_at": "2026-05-09T14:22:11Z"
  },
  "source": "memory"
}`;

export const Protocol = () => {
  return (
    <section id="protocol" className="py-24 border-t border-border/50">
      <div className="container">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs font-mono text-primary mb-3 tracking-wider">PROTOCOL</p>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
            Three keys. <span className="text-gradient">Any capability.</span>
          </h2>
          <p className="mt-5 text-muted-foreground text-lg">
            No SQL. No schemas to memorize. Agents speak in verbs they already know — <span className="font-mono text-foreground">remember</span>,
            {" "}<span className="font-mono text-foreground">recall</span>, <span className="font-mono text-foreground">link</span>, <span className="font-mono text-foreground">act</span>.
          </p>
        </div>

        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-4">
          <CodeBlock label="REQUEST" code={codeRequest} />
          <CodeBlock label="RESPONSE" code={codeResponse} accent />
        </div>
      </div>
    </section>
  );
};

const CodeBlock = ({ label, code, accent }: { label: string; code: string; accent?: boolean }) => (
  <div className="rounded-xl border border-border bg-card/60 backdrop-blur card-elevated overflow-hidden">
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/70 bg-secondary/40">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-foreground/10" />
        <span className="w-2.5 h-2.5 rounded-full bg-foreground/10" />
        <span className={`w-2.5 h-2.5 rounded-full ${accent ? "bg-primary animate-pulse-glow" : "bg-foreground/10"}`} />
      </div>
      <span className="text-[10px] font-mono tracking-wider text-muted-foreground">{label}</span>
    </div>
    <pre className="p-5 text-xs md:text-sm font-mono leading-relaxed overflow-x-auto scrollbar-thin">
      <code className="text-foreground/90 whitespace-pre">{code}</code>
    </pre>
  </div>
);
