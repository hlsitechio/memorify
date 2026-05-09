import { AlertTriangle } from "lucide-react";

const stack = [
  "Postgres for structured state",
  "Pinecone for vectors",
  "S3 for files",
  "Notion / Obsidian for notes",
  "Redis for cache",
  "10+ MCP servers",
  "Per-app OAuth",
  "Custom glue code",
];

export const Problem = () => {
  return (
    <section className="py-24 border-t border-border/50">
      <div className="container">
        <div className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-mono text-destructive mb-4">
              <AlertTriangle className="w-3.5 h-3.5" /> The current state
            </div>
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-tight">
              Every agent today is duct-taped to <span className="text-muted-foreground/60">ten different backends.</span>
            </h2>
            <p className="mt-6 text-muted-foreground text-lg leading-relaxed">
              Cursor, Claude Code, and OpenCode all ship a great agent — then ask you to wire it up to Postgres, vector DBs,
              Notion, Obsidian, Drive, and a dozen MCP servers. SQL is the wrong dialect for an LLM. Notes apps are not memory.
            </p>
            <p className="mt-4 text-muted-foreground text-lg leading-relaxed">
              Synapse replaces all of that with one gateway and one verb-based protocol.
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-gradient-radial blur-2xl opacity-50" aria-hidden />
            <div className="relative grid grid-cols-2 gap-2">
              {stack.map((s) => (
                <div
                  key={s}
                  className="px-3 py-3 rounded-md border border-border bg-card/40 text-sm text-muted-foreground line-through decoration-destructive/60 decoration-1"
                >
                  {s}
                </div>
              ))}
              <div className="col-span-2 px-3 py-3 rounded-md border border-primary/40 bg-gradient-primary text-primary-foreground text-sm font-medium text-center ring-primary-soft">
                Synapse Gateway
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
