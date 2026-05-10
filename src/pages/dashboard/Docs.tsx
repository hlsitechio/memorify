import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FlaskConical, Sparkles, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "built" | "beta" | "next";
type Item = { title: string; desc: string; status: Status; area?: string };

const items: Item[] = [
  // BUILT
  { area: "Foundation", title: "Lovable Cloud backend", desc: "Postgres + Auth (email/password + Google) + Storage + Edge Functions, all RLS-protected per user.", status: "built" },
  { area: "Foundation", title: "Dashboard shell", desc: "Sidebar nav, command palette (⌘K), persistent Copilot sidebar (⌘I), per-tab routing.", status: "built" },
  { area: "Copilot", title: "Multi-turn agent chat", desc: "agent-chat edge fn with tool-calling loop, streaming, persistent across tab switches and reloads.", status: "built" },
  { area: "Copilot", title: "Action registry (Wave A+B)", desc: "Unified CommandDef registry — nav, widgets, plugins commands wired to the agent.", status: "built" },
  { area: "Knowledge", title: "Memory", desc: "Namespaces, categories, tags, versions, archive, AI suggestions from text.", status: "built" },
  { area: "Knowledge", title: "Documents", desc: "Drag-drop upload, signed URLs, private per-user storage bucket.", status: "built" },
  { area: "Knowledge", title: "Images", desc: "AI image generation via Lovable AI Gateway + upload library.", status: "built" },
  { area: "Knowledge", title: "Voices (Otter-style)", desc: "Browser recording, audio upload, transcript editor, AI summary + action items.", status: "built" },
  { area: "Build", title: "Skills", desc: "Custom prompt-based skills with schemas, publish/run via skill-run edge fn.", status: "built" },
  { area: "Build", title: "Plugins", desc: "Plugin registry with toggles, reorder, multi-source (skill / connector / MCP / HTTP).", status: "built" },
  { area: "Build", title: "Connectors", desc: "External service connections with config + test endpoint.", status: "built" },
  { area: "Build", title: "MCP", desc: "Model Context Protocol servers, handshake, per-tool toggles.", status: "built" },
  { area: "Data", title: "AI-Native Collections (Database)", desc: "Schemaless JSON docs, AI smart import, natural-language query bar — Postgres+JSONB underneath.", status: "built" },
  { area: "Data", title: "Vault", desc: "Per-user secret names registry (values stored in backend secrets).", status: "built" },
  { area: "Observe", title: "Events stream", desc: "Real-time event bus with live tail and filtering.", status: "built" },
  { area: "Observe", title: "Logs", desc: "Historical log viewer.", status: "built" },
  { area: "Project", title: "API keys", desc: "Reveal-once token creation + revoke.", status: "built" },

  // BETA
  { area: "Copilot", title: "Action chips in chat", desc: "Each tool call rendered as a card with status — partial coverage, polish in progress.", status: "beta" },
  { area: "Knowledge", title: "Voice auto-transcription", desc: "Currently manual paste; ElevenLabs Scribe wiring is staged.", status: "beta" },
  { area: "Data", title: "Collections NL query", desc: "Works on common shapes; complex nested filters still iterating.", status: "beta" },
  { area: "Build", title: "MCP tool invocation", desc: "Handshake + listing works; live invoke routing still hardening.", status: "beta" },

  // COMING NEXT
  { area: "Copilot", title: "Wave C — memory / skills / mcp commands", desc: "Full command coverage so Copilot can CRUD memory, run skills, manage MCP servers.", status: "next" },
  { area: "Copilot", title: "Wave D — docs / images / voices / api_keys", desc: "Upload, generate, register, revoke — all via Copilot.", status: "next" },
  { area: "Copilot", title: "Wave E — db / vault / events / profile / ui", desc: "Read-only queries, secret name management, theme + density commands.", status: "next" },
  { area: "Copilot", title: "Undo + confirm gates", desc: "meta.confirm for destructive ops, meta.undo using the event log.", status: "next" },
  { area: "Knowledge", title: "ElevenLabs Scribe", desc: "Real STT for voice clips and meetings, with speaker diarization.", status: "next" },
  { area: "Knowledge", title: "Document Q&A + embeddings", desc: "pgvector-backed semantic search across documents and memory.", status: "next" },
  { area: "Data", title: "Graph / relations layer", desc: "Edges between collection items (people ↔ projects ↔ docs) for relational reasoning.", status: "next" },
  { area: "Project", title: "Per-command permission toggles", desc: "Settings UI to allow/deny each Copilot command class.", status: "next" },
  { area: "Project", title: "Workspace sharing", desc: "Invite collaborators with roles, shared memory namespaces.", status: "next" },
];

const buckets: { key: Status; label: string; icon: typeof CheckCircle2; tone: string }[] = [
  { key: "built", label: "Built", icon: CheckCircle2, tone: "text-primary" },
  { key: "beta", label: "Beta", icon: FlaskConical, tone: "text-amber-500" },
  { key: "next", label: "Coming next", icon: Sparkles, tone: "text-accent-foreground" },
];

export default function Docs() {
  return (
    <>
      <PageHeader
        title="Docs"
        description="What's built, what's in beta, and what's shipping next. Living document — kept in sync as the platform evolves."
      />
      <div className="p-6 space-y-8 max-w-5xl">
        {buckets.map((b) => {
          const rows = items.filter((i) => i.status === b.key);
          return (
            <section key={b.key}>
              <div className="flex items-center gap-2 mb-3">
                <b.icon className={cn("h-4 w-4", b.tone)} />
                <h2 className="text-sm font-semibold uppercase tracking-wider">{b.label}</h2>
                <Badge variant="outline" className="ml-1 text-[10px]">{rows.length}</Badge>
              </div>
              <div className="rounded-lg border border-border bg-card divide-y divide-border">
                {rows.map((r, i) => (
                  <div key={i} className="px-4 py-3 flex items-start gap-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground w-20 shrink-0 pt-0.5">
                      {r.area}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{r.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{r.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-4 flex items-start gap-3">
          <BookOpen className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            This page is the source of truth for product state. When a feature ships, moves to beta, or is queued — update <code className="px-1 py-0.5 rounded bg-background border border-border">src/pages/dashboard/Docs.tsx</code>.
          </div>
        </div>
      </div>
    </>
  );
}
