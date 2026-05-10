import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen, Rocket, Sparkles, Puzzle, Plug, Server, Database, FileText,
  Image as ImageIcon, Mic, Table2, Lock, Activity, ScrollText, KeyRound,
  Bot, ChevronRight, List, Copy, Check, ArrowUpRight, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Status = "stable" | "beta" | "next";

const statusStyles: Record<Status, string> = {
  stable: "bg-primary/10 text-primary border-primary/20",
  beta: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  next: "bg-muted text-muted-foreground border-border",
};

const statusLabel: Record<Status, string> = {
  stable: "Stable",
  beta: "Beta",
  next: "Coming",
};

type Feature = {
  title: string;
  desc: string;
  status: Status;
  icon?: LucideIcon;
  to?: string;
};

type Section = {
  id: string;
  group: string;
  title: string;
  intro?: string;
  features: Feature[];
};

const sections: Section[] = [
  {
    id: "quickstart",
    group: "Get started",
    title: "Quickstart",
    intro:
      "Synapse is your personal AI workspace — a Copilot that can read your memory, run skills, drive plugins, and call MCP tools. Drop in data, talk to it in natural language, ship.",
    features: [
      { title: "Open the Copilot", desc: "Hit ⌘I anywhere to talk to the agent. It stays alive across tab switches and reloads.", status: "stable", icon: Bot },
      { title: "Search routes & actions", desc: "⌘K command palette to jump anywhere or fire an action.", status: "stable", icon: Sparkles },
      { title: "Drop in your first data", desc: "Memory · Documents · Images · Voices — all drag-drop, AI-assisted.", status: "stable", icon: Database, to: "/dashboard/memory" },
    ],
  },
  {
    id: "foundation",
    group: "Foundation",
    title: "Platform",
    intro: "The bedrock everything runs on — backend, auth, storage, observability.",
    features: [
      { title: "Lovable Cloud backend", desc: "Postgres + Auth (email + Google) + Storage + Edge Functions, all RLS-scoped per user.", status: "stable" },
      { title: "Dashboard shell", desc: "Sidebar nav, command palette (⌘K), persistent Copilot sidebar (⌘I), per-tab routing.", status: "stable" },
      { title: "Workspace sharing", desc: "Invite collaborators with roles and shared memory namespaces.", status: "next" },
    ],
  },
  {
    id: "copilot",
    group: "Copilot",
    title: "Agent & action layer",
    intro: "Multi-turn agent with a unified command registry — every action you can click, the Copilot can call.",
    features: [
      { title: "Multi-turn agent chat", desc: "Streaming, tool-calling, persistent across reloads and tab switches.", status: "stable", icon: Bot },
      { title: "Action registry (Wave A+B)", desc: "Unified CommandDef — nav, widgets, plugins commands wired to the agent.", status: "stable", icon: Puzzle },
      { title: "Action chips in chat", desc: "Each tool call rendered as a card with status and result.", status: "beta" },
      { title: "Wave C — memory / skills / mcp", desc: "Full Copilot CRUD over memory, skills, and MCP servers.", status: "next" },
      { title: "Wave D — docs / images / voices / api keys", desc: "Upload, generate, register, revoke — all via Copilot.", status: "next" },
      { title: "Wave E — db / vault / events / profile / ui", desc: "Reads, secret names, theme + density commands.", status: "next" },
      { title: "Undo + confirm gates", desc: "meta.confirm for destructive ops, meta.undo via the event log.", status: "next" },
    ],
  },
  {
    id: "knowledge",
    group: "Knowledge",
    title: "Memory & content",
    intro: "Everything the Copilot can remember, read, see, and hear.",
    features: [
      { title: "Memory", desc: "Namespaces, categories, tags, versions, archive, AI suggestions from text.", status: "stable", icon: Database, to: "/dashboard/memory" },
      { title: "Documents", desc: "Drag-drop upload, signed URLs, private per-user storage.", status: "stable", icon: FileText, to: "/dashboard/documents" },
      { title: "Images", desc: "AI generation via Lovable AI Gateway + upload library.", status: "stable", icon: ImageIcon, to: "/dashboard/images" },
      { title: "Voices (Otter-style)", desc: "Record, upload, transcribe, AI summary + action items.", status: "stable", icon: Mic, to: "/dashboard/voices" },
      { title: "Voice auto-transcription", desc: "Manual paste today; ElevenLabs Scribe wiring is staged.", status: "beta" },
      { title: "Document Q&A + embeddings", desc: "pgvector-backed semantic search across documents and memory.", status: "next" },
    ],
  },
  {
    id: "build",
    group: "Build",
    title: "Skills, plugins, connectors, MCP",
    intro: "Extend the Copilot — your own prompts, third-party services, and MCP tools.",
    features: [
      { title: "Skills", desc: "Custom prompt-based skills with schemas; publish & run via skill-run.", status: "stable", icon: Sparkles, to: "/dashboard/skills" },
      { title: "Plugins", desc: "Registry with toggles, reorder, multi-source (skill / connector / MCP / HTTP).", status: "stable", icon: Puzzle, to: "/dashboard/plugins" },
      { title: "Connectors", desc: "External service connections with config + test endpoint.", status: "stable", icon: Plug, to: "/dashboard/connectors" },
      { title: "MCP", desc: "Model Context Protocol servers, handshake, per-tool toggles.", status: "stable", icon: Server, to: "/dashboard/mcp" },
      { title: "MCP tool invocation", desc: "Handshake + listing works; live invoke routing still hardening.", status: "beta" },
    ],
  },
  {
    id: "data",
    group: "Data",
    title: "Collections & secrets",
    intro: "AI-Native data — no SQL, no schema upfront.",
    features: [
      { title: "AI-Native Collections", desc: "Schemaless JSON docs, AI smart import, natural-language query bar.", status: "stable", icon: Table2, to: "/dashboard/database" },
      { title: "Vault", desc: "Per-user secret names registry (values stored in backend secrets).", status: "stable", icon: Lock, to: "/dashboard/vault" },
      { title: "Collections NL query", desc: "Works on common shapes; complex nested filters still iterating.", status: "beta" },
      { title: "Graph / relations layer", desc: "Edges between items (people ↔ projects ↔ docs) for relational reasoning.", status: "next" },
    ],
  },
  {
    id: "observe",
    group: "Observe",
    title: "Events & logs",
    intro: "See what your agents and tools are doing in real time.",
    features: [
      { title: "Events stream", desc: "Real-time bus with live tail and filtering.", status: "stable", icon: Activity, to: "/dashboard/events" },
      { title: "Logs", desc: "Historical log viewer.", status: "stable", icon: ScrollText, to: "/dashboard/logs" },
    ],
  },
  {
    id: "project",
    group: "Project",
    title: "API & access",
    features: [
      { title: "API keys", desc: "Reveal-once token creation + revoke.", status: "stable", icon: KeyRound, to: "/dashboard/api-keys" },
      { title: "Per-command permissions", desc: "Settings UI to allow/deny each Copilot command class.", status: "next" },
    ],
  },
];

const navGroups = [
  { label: "Get started", ids: ["quickstart"] },
  { label: "Platform", ids: ["foundation", "copilot"] },
  { label: "Capabilities", ids: ["knowledge", "build", "data"] },
  { label: "Operations", ids: ["observe", "project"] },
];

export const docsNavGroups = navGroups.map((g) => ({
  label: g.label,
  items: g.ids
    .map((id) => sections.find((s) => s.id === id))
    .filter((s): s is Section => !!s)
    .map((s) => ({ id: s.id, title: s.title })),
}));


export default function Docs() {
  const [activeId, setActiveId] = useState<string>(sections[0].id);
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  const counts = useMemo(() => {
    const all = sections.flatMap((s) => s.features);
    return {
      stable: all.filter((f) => f.status === "stable").length,
      beta: all.filter((f) => f.status === "beta").length,
      next: all.filter((f) => f.status === "next").length,
    };
  }, []);

  const copyMarkdown = async () => {
    const md = sections
      .map((s) => `## ${s.title}\n\n${s.intro ?? ""}\n\n${s.features.map((f) => `- **${f.title}** _(${statusLabel[f.status]})_ — ${f.desc}`).join("\n")}`)
      .join("\n\n");
    await navigator.clipboard.writeText(`# Synapse — Docs\n\n${md}`);
    setCopied(true);
    toast.success("Markdown copied");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" ref={containerRef}>

        <div className="max-w-3xl mx-auto px-8 py-10">
          {/* Hero */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <span>Docs</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground">Overview</span>
          </div>
          <div className="flex items-start justify-between gap-4 mb-4">
            <h1 className="text-4xl font-bold tracking-tight">Synapse Docs</h1>
            <button
              onClick={copyMarkdown}
              className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-card hover:bg-secondary/60 text-xs"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
              Copy markdown
            </button>
          </div>
          <p className="text-base text-muted-foreground leading-relaxed">
            The living source of truth for what's shipped, what's in beta, and what's coming next. Inspired by the way framework docs evolve — keep this in sync as the platform grows.
          </p>

          {/* Status legend */}
          <div className="mt-6 flex flex-wrap gap-2">
            <Badge status="stable" count={counts.stable} />
            <Badge status="beta" count={counts.beta} />
            <Badge status="next" count={counts.next} />
          </div>

          {/* Quickstart strip */}
          <div className="mt-8 rounded-xl border border-border bg-gradient-to-br from-primary/5 via-card to-card p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Rocket className="h-3.5 w-3.5" /> Quickstart
            </div>
            <div className="mt-1 text-lg font-semibold">Three things to try right now</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
              {sections[0].features.map((f, i) => (
                <QuickCard key={i} feature={f} />
              ))}
            </div>
          </div>

          {/* Sections */}
          <div className="mt-10 space-y-12">
            {sections.slice(1).map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-20">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.group}</div>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">{s.title}</h2>
                {s.intro && <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.intro}</p>}
                <div className="mt-5 rounded-lg border border-border bg-card divide-y divide-border">
                  {s.features.map((f, i) => (
                    <FeatureRow key={i} feature={f} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-16 rounded-lg border border-dashed border-border bg-secondary/30 p-4 flex items-start gap-3">
            <BookOpen className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground">
              When a feature ships, moves to beta, or is queued — update <code className="px-1 py-0.5 rounded bg-background border border-border">src/pages/dashboard/Docs.tsx</code>. This page is the single source of truth.
            </div>
          </div>
      </div>
    </div>
  );
}

function Badge({ status, count }: { status: Status; count: number }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px]", statusStyles[status])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {statusLabel[status]} · {count}
    </span>
  );
}

function QuickCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon ?? Sparkles;
  const inner = (
    <div className="h-full rounded-lg border border-border bg-card p-3 hover:border-primary/40 hover:bg-card/80 transition-colors group">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <div className="text-sm font-medium truncate">{feature.title}</div>
        {feature.to && <ArrowUpRight className="h-3 w-3 ml-auto text-muted-foreground group-hover:text-foreground" />}
      </div>
      <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{feature.desc}</div>
    </div>
  );
  return feature.to ? <Link to={feature.to}>{inner}</Link> : inner;
}

function FeatureRow({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  const inner = (
    <div className="px-4 py-3 flex items-start gap-3 group">
      {Icon ? (
        <div className="h-8 w-8 rounded-md bg-secondary/60 border border-border flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
      ) : (
        <div className="h-8 w-8 rounded-md bg-secondary/30 border border-dashed border-border shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-sm font-medium">{feature.title}</div>
          <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] uppercase tracking-wider", statusStyles[feature.status])}>
            {statusLabel[feature.status]}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{feature.desc}</div>
      </div>
      {feature.to && (
        <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
      )}
    </div>
  );
  return feature.to ? <Link to={feature.to} className="block hover:bg-secondary/40 transition-colors">{inner}</Link> : inner;
}
