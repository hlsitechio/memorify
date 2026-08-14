// CopilotSidebar — replaces the main sidebar content when Copilot is active.
// Shows a conversation history list on top, with a back arrow to return
// to the main navigation sidebar. The sidebar slides in from the left
// with a CSS transition.

import { useEffect, useState } from "react";
import {
  Bot, ArrowLeft, Plus, MessageSquare, Trash2,
  Loader2, CheckCircle2, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCopilotChat, type SessionMeta } from "@/copilot/chat-context";
import { useDashboardUI } from "./DashboardUIContext";

export function CopilotSidebar() {
  const {
    sessions, sessionsLoading, loadSession, deleteSession,
    refreshSessions, currentSessionId, clear, messages,
  } = useCopilotChat();
  const { setChatOpen } = useDashboardUI();
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Load sessions on mount
  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const filtered = sessions.filter((s) =>
    !searchQuery.trim() ||
    s.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleNewChat = () => {
    clear();
  };

  const handleBack = () => {
    setChatOpen(false);
  };

  return (
    <div className="flex flex-col h-full animate-copilot-slide-in">
      {/* Header with back arrow */}
      <div className="h-14 flex items-center gap-2 px-2 border-b border-border shrink-0">
        <button
          onClick={handleBack}
          title="Back to navigation"
          className="flex items-center justify-center h-9 w-9 rounded-md hover:bg-secondary/60 transition-colors text-muted-foreground hover:text-foreground shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="h-7 w-7 rounded-md bg-gradient-primary flex items-center justify-center shrink-0">
            <Bot className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight truncate">Copilot</div>
            <div className="text-[11px] text-muted-foreground truncate">Chat history</div>
          </div>
        </div>
        <button
          onClick={handleNewChat}
          title="New chat"
          className="flex items-center justify-center h-9 w-9 rounded-md hover:bg-secondary/60 transition-colors text-muted-foreground hover:text-foreground shrink-0"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Search bar */}
      <div className="px-2 py-2 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full h-8 pl-8 pr-3 rounded-md bg-secondary/40 border border-border text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {sessionsLoading && sessions.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              {searchQuery ? "No conversations found" : "No conversations yet"}
            </p>
            {!searchQuery && (
              <button
                onClick={handleNewChat}
                className="mt-3 text-xs text-primary hover:underline"
              >
                Start a new chat
              </button>
            )}
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {filtered.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                isActive={currentSessionId === session.id}
                isConfirming={confirmDelete === session.id}
                onLoad={() => loadSession(session.id)}
                onDelete={() => setConfirmDelete(session.id)}
                onConfirmDelete={() => {
                  deleteSession(session.id);
                  setConfirmDelete(null);
                }}
                onCancelDelete={() => setConfirmDelete(null)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-border shrink-0">
        <div className="text-[10px] text-muted-foreground text-center">
          {sessions.length} conversation{sessions.length !== 1 ? "s" : ""}
          {messages.length > 0 && !currentSessionId && " · unsaved"}
        </div>
      </div>
    </div>
  );
}

// ── Session row ────────────────────────────────────────────────────
function SessionRow({
  session,
  isActive,
  isConfirming,
  onLoad,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  session: SessionMeta;
  isActive: boolean;
  isConfirming: boolean;
  onLoad: () => void;
  onDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const date = session.updated_at || session.created_at;
  const dateStr = date ? formatDate(date) : "";

  return (
    <div
      className={cn(
        "group relative rounded-md transition-colors",
        isActive ? "bg-accent" : "hover:bg-secondary/60",
      )}
    >
      <button
        onClick={onLoad}
        className="w-full flex items-start gap-2 px-2.5 py-2 text-left"
      >
        <MessageSquare className={cn(
          "h-3.5 w-3.5 shrink-0 mt-0.5",
          isActive ? "text-primary" : "text-muted-foreground",
        )} />
        <div className="flex-1 min-w-0">
          <div className={cn(
            "text-xs truncate",
            isActive ? "text-accent-foreground font-medium" : "text-foreground",
          )}>
            {session.title || "Untitled"}
          </div>
          {dateStr && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {dateStr}
              {session.reviewed && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-emerald-500">
                  <CheckCircle2 className="h-2.5 w-2.5" /> reviewed
                </span>
              )}
            </div>
          )}
        </div>
      </button>
      {/* Delete button — visible on hover */}
      {!isConfirming && (
        <button
          onClick={onDelete}
          title="Delete conversation"
          className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 rounded-md hover:bg-destructive/10 flex items-center justify-center"
        >
          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
        </button>
      )}
      {/* Confirm delete */}
      {isConfirming && (
        <div className="px-2.5 pb-2 flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Delete?</span>
          <button
            onClick={onConfirmDelete}
            className="text-[10px] px-2 py-0.5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Yes
          </button>
          <button
            onClick={onCancelDelete}
            className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground hover:bg-secondary/80"
          >
            No
          </button>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}