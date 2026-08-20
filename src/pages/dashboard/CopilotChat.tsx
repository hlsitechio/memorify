import { useEffect, useRef, useState, useCallback } from "react";
import { useCopilotChat, type Chip } from "@/copilot/chat-context";
import { useAuth as useClerkAuth, useOrganization } from "@clerk/react";
import { readCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Bot, Send, Sparkles, Loader2, CheckCircle2, AlertCircle,
  Trash2, ChevronDown, ChevronRight, Wrench, User,
  Search, FileText, Zap, Webhook, Activity,
  Paperclip, X, File, Image, FileType,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

type ModelStatus = {
  model: string;
  status: "online" | "degraded" | "error" | "not_found" | "no_key";
  configured: boolean;
  context_length?: number;
  supports_tools?: boolean;
  supports_response_format?: boolean;
  latency_ms?: number;
  detail?: string;
  key_hint?: string;
};

const SUGGESTIONS = [
  { icon: Search, text: "Search the web for OpenRouter API docs and store it" },
  { icon: FileText, text: "List all my documents" },
  { icon: Zap, text: "What commands can you run here?" },
  { icon: Webhook, text: "Show me my connected MCP servers" },
];

export default function CopilotChat() {
  const { messages, loading, streamingText, isStreaming, send, confirmChip, clear, uploadFile } = useCopilotChat();
  const { getToken } = useClerkAuth();
  const { organization } = useOrganization();
  const [input, setInput] = useState("");
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [checkingModel, setCheckingModel] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchModelStatus = useCallback(async () => {
    setCheckingModel(true);
    try {
      const token = await getToken();
      if (!token) return;
      const ws = readCurrentWorkspace();
      const workspaceId = organization?.id || (ws?.kind === "agent" ? ws.id : ws?.id);
      const res = await fetch("/api/copilot/model-status", {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      setModelStatus(data);
    } catch {
      // silent
    } finally {
      setCheckingModel(false);
    }
  }, [getToken, organization?.id]);

  useEffect(() => {
    fetchModelStatus();
  }, [fetchModelStatus]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, streamingText]);

  const submit = (text: string) => {
    if (!text.trim() || loading) return;
    setInput("");
    send(text);
  };

  // ── File handling ────────────────────────────────────────────────
  const handleFileSelect = (file: File) => {
    // Validate file size (6 MB max)
    const maxSize = 6 * 1024 * 1024; // 6 MB
    if (file.size > maxSize) {
      setUploadError(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum is 6 MB.`);
      return;
    }
    setAttachedFile(file);
    setUploadError(null);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
      e.target.value = "";
    }
  };

  const handleRemoveFile = () => {
    setAttachedFile(null);
    setUploadError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (attachedFile) {
        handleSendWithFile();
      } else {
        submit(input);
      }
    }
  };

  const handleSendWithFile = async () => {
    if (!attachedFile || uploading) return;
    
    const file = attachedFile;
    setUploading(true);
    setUploadError(null);
    
    const result = await uploadFile(file);
    
    setUploading(false);
    
    if (!result.ok) {
      setUploadError(result.error || "Upload failed");
      return;
    }
    
    // Build a message that references the uploaded document
    const docRef = `📎 Uploaded: ${result.name} (${(file.size / 1024).toFixed(0)} KB)`;
    let docRefWithRag: string | null = null;
    if (result.rag) {
      const chunks = result.rag.chunks || 0;
      const embedded = result.rag.embedded || 0;
      docRefWithRag = `${docRef} — ${chunks} chunks, ${embedded} embedded`;
      setInput(docRefWithRag);
    } else {
      setInput(docRef);
    }
    
    setAttachedFile(null);
    submit(docRefWithRag || docRef);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-primary flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">Copilot</div>
            <div className="text-[11px] text-muted-foreground">
              {loading ? "Working…" : "Agentic — runs commands, searches the web, stores documents"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ModelStatusBadge status={modelStatus} loading={checkingModel} onRefresh={fetchModelStatus} />
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clear} className="gap-1.5 text-xs">
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {messages.length === 0 && !isStreaming && (
            <div className="space-y-8 pt-8">
              <div className="text-center space-y-3">
                <div className="h-14 w-14 rounded-2xl bg-gradient-primary flex items-center justify-center mx-auto">
                  <Bot className="h-8 w-8 text-primary-foreground" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">Memorify Copilot</h2>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  Your agentic dashboard assistant. Search the web, store documents, manage memories,
                  run commands — all from chat.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 max-w-2xl mx-auto">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.text}
                    onClick={() => submit(s.text)}
                    className="group flex items-start gap-3 p-4 rounded-xl border border-border bg-card/40 hover:bg-card hover:border-primary/30 transition-all text-left"
                  >
                    <s.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                      {s.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            if (m.role === "tool") return null;
            return (
              <MessageBubble
                key={i}
                role={m.role}
                content={m.content}
                chips={m.chips}
                onConfirm={(accept) => confirmChip(i, m.chips?.[0]?.id ?? "", accept)}
              />
            );
          })}

          {/* Inline streaming "Thinking..." block — appears in chat flow */}
          {isStreaming && (
            <ThinkingBlock text={streamingText} />
          )}

          {/* Loading indicator when not streaming (between tool calls) */}
          {loading && !isStreaming && (
            <div className="flex items-start gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-gradient-primary">
                  <Bot className="h-4 w-4 text-primary-foreground" />
                </AvatarFallback>
              </Avatar>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Working…</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-border bg-card/50 backdrop-blur shrink-0">
        <div className="max-w-3xl mx-auto px-6 py-4">
          {/* File attachment preview */}
          {attachedFile && (
            <div
              className="mb-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 animate-float-up"
              role="status"
            >
              {attachedFile.type.startsWith("image/") ? (
                <Image className="h-4 w-4 text-primary" />
              ) : (
                <FileType className="h-4 w-4 text-primary" />
              )}
              <span className="text-sm font-medium text-primary truncate flex-1">
                {attachedFile.name}
              </span>
              <span className="text-xs text-muted-foreground flex-1 text-right">
                {(attachedFile.size / 1024).toFixed(0)} KB
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={handleRemoveFile}
                aria-label="Remove attachment"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          
          {/* Drag & drop zone + input */}
          <div className="relative rounded-xl border border-border bg-background focus-within:border-primary/40 transition-colors">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileInputChange}
              className="hidden"
              accept=".txt,.md,.pdf,.docx,.doc,.csv,.json,.png,.jpg,.jpeg,.gif,.webp,.svg"
            />
            
            {/* Drag overlay hint when file is being dragged over */}
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 transition-opacity duration-200 bg-primary/5 border-2 border-dashed border-primary/50 rounded-xl"
              style={{ opacity: 0 }}
            >
              <span className="text-sm text-primary font-medium">Drop file here</span>
            </div>
            
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className="relative"
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={loading ? "Copilot is working…" : uploading ? "Uploading file…" : "Message Memorify Copilot…"}
                className="min-h-[56px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 pr-12 py-3.5"
                disabled={loading || uploading}
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
                {uploadError && (
                  <span className="text-[10px] text-destructive px-2 py-0.5 rounded bg-destructive/10">
                    {uploadError}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                  onClick={handleAttachClick}
                  disabled={loading || uploading || attachedFile}
                  aria-label="Attach file"
                  title={attachedFile ? "File already attached" : "Attach file (drag & drop or click)"}
                >
                  <Paperclip className={cn("h-4 w-4", attachedFile && "opacity-50")} />
                </Button>
                <Button
                  onClick={attachedFile ? handleSendWithFile : () => submit(input)}
                  disabled={loading || uploading || (!input.trim() && !attachedFile)}
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Copilot can search the web, store documents, manage memories, and run dashboard commands.
            Press Enter to send, Shift+Enter for new line. Drag & drop files (max 6 MB) or click 📎.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Inline collapsible "Thinking..." block ──────────────────────────
function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(true);
  const hasContent = text.length > 0;

  return (
    <div className="flex items-start gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="bg-gradient-primary">
          <Bot className="h-4 w-4 text-primary-foreground" />
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="rounded-xl border border-border/60 bg-gradient-to-b from-secondary/20 to-secondary/5 overflow-hidden">
          {/* Header — clickable to toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-secondary/30 transition-colors group"
          >
            {/* Status icon */}
            <div className="flex items-center gap-2 flex-1">
              {hasContent ? (
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
              ) : (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
              )}
              <span className="text-xs font-medium text-muted-foreground">
                {hasContent ? "Generating response…" : "Thinking…"}
              </span>
              {/* Animated dots when no content yet */}
              {!hasContent && (
                <div className="flex items-center gap-0.5 ml-1">
                  <span className="h-1 w-1 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "0ms", animationDuration: "0.8s" }} />
                  <span className="h-1 w-1 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "120ms", animationDuration: "0.8s" }} />
                  <span className="h-1 w-1 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "240ms", animationDuration: "0.8s" }} />
                </div>
              )}
            </div>

            {/* Char count + toggle */}
            {hasContent && (
              <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums">
                {text.length} chars
              </span>
            )}
            <div className="flex items-center gap-1 text-muted-foreground group-hover:text-foreground transition-colors">
              {expanded
                ? <ChevronDown className="h-3.5 w-3.5" />
                : <ChevronRight className="h-3.5 w-3.5" />}
            </div>
          </button>

          {/* Content — live streaming markdown */}
          {expanded && (
            <div className="border-t border-border/40">
              {hasContent ? (
                <div className="px-3.5 py-3 max-h-[400px] overflow-y-auto scrollbar-thin">
                  <div className="prose prose-sm prose-invert max-w-none
                    [&_p]:my-1.5 [&_p]:leading-relaxed
                    [&_code]:text-primary [&_code]:bg-primary/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[12px]
                    [&_pre]:bg-muted/30 [&_pre]:border [&_pre]:border-border/60 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:my-2
                    [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-primary
                    [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
                    [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-foreground
                    [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-foreground
                    [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-foreground
                    [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4
                    [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4
                    [&_li]:my-0.5
                    [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_blockquote]:italic
                    [&_table]:w-full [&_table]:text-xs [&_th]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-secondary/30 [&_td]:p-2 [&_td]:border [&_td]:border-border
                    [&_strong]:text-foreground [&_strong]:font-semibold
                    text-sm text-muted-foreground leading-relaxed
                  ">
                    <ReactMarkdown>{text}</ReactMarkdown>
                    {/* Blinking cursor at the end while streaming */}
                    <span className="inline-block w-1.5 h-4 bg-primary/70 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                  </div>
                </div>
              ) : (
                <div className="px-3.5 py-3 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-pulse" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-pulse" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-pulse" style={{ animationDelay: "300ms" }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Chat message bubble ─────────────────────────────────────────────
function MessageBubble({
  role,
  content,
  chips,
  onConfirm,
}: {
  role: string;
  content: string;
  chips?: Chip[];
  onConfirm: (accept: boolean) => void;
}) {
  const isUser = role === "user";

  if (isUser) {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-3 text-sm">
          <div className="whitespace-pre-wrap">{content}</div>
        </div>
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-secondary border border-border">
            <User className="h-4 w-4 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="bg-gradient-primary">
          <Bot className="h-4 w-4 text-primary-foreground" />
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 space-y-2">
        {content && (
          <div className="prose prose-sm prose-invert max-w-none
            [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_pre]:my-2
            [&_code]:text-primary [&_code]:bg-primary/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded
            [&_pre]:bg-muted/40 [&_pre]:border [&_pre]:border-border [&_pre]:rounded-lg [&_pre]:p-3
            [&_a]:text-primary [&_a]:underline
            [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1
            [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1
            [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1
            [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground
          ">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
        {chips && chips.length > 0 && (
          <div className="space-y-1.5">
            {chips.map((c) => (
              <ActionChip key={c.id} chip={c} onConfirm={onConfirm} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tool action chip ────────────────────────────────────────────────
function ActionChip({ chip, onConfirm }: { chip: Chip; onConfirm: (accept: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);
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
    <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-secondary/40 transition-colors"
      >
        <Icon className={cn("h-3.5 w-3.5 shrink-0", chip.state === "running" && "animate-spin", tone)} />
        <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="font-mono truncate flex-1 text-left">{chip.name}</span>
        {chip.state === "blocked" && (
          <span className="text-amber-400 text-[10px] font-medium">Needs confirmation</span>
        )}
        {chip.result && (
          expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {chip.state === "blocked" && (
        <div className="px-3 pb-2 flex items-center gap-2">
          <Button size="sm" variant="default" className="h-6 px-2.5 text-[11px]" onClick={() => onConfirm(true)}>
            Confirm
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2.5 text-[11px]" onClick={() => onConfirm(false)}>
            Cancel
          </Button>
        </div>
      )}

      {expanded && chip.result && (
        <div className="px-3 pb-2">
          <pre className="text-[11px] font-mono bg-muted/30 border border-border rounded-md p-2 max-h-[200px] overflow-auto whitespace-pre-wrap break-all">
            {typeof chip.result === "string" ? chip.result : JSON.stringify(chip.result, null, 2).slice(0, 2000)}
          </pre>
        </div>
      )}

      {chip.error && (
        <div className="px-3 pb-2 text-[11px] text-destructive">
          {chip.error}
        </div>
      )}
    </div>
  );
}

// ── Model status badge ──────────────────────────────────────────────
function ModelStatusBadge({ status, loading, onRefresh }: { status: ModelStatus | null; loading: boolean; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);

  if (loading && !status) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-1 rounded-md bg-secondary/40">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking model…
      </div>
    );
  }

  if (!status) return null;

  const statusConfig = {
    online: { color: "text-emerald-400", bg: "bg-emerald-500/10", dot: "bg-emerald-400", label: "Online" },
    degraded: { color: "text-amber-400", bg: "bg-amber-500/10", dot: "bg-amber-400", label: "Degraded" },
    error: { color: "text-destructive", bg: "bg-destructive/10", dot: "bg-destructive", label: "Error" },
    not_found: { color: "text-destructive", bg: "bg-destructive/10", dot: "bg-destructive", label: "Not found" },
    no_key: { color: "text-muted-foreground", bg: "bg-secondary/40", dot: "bg-muted-foreground", label: "No API key" },
  };

  const cfg = statusConfig[status.status] || statusConfig.error;
  const contextStr = status.context_length
    ? status.context_length >= 1000000
      ? `${(status.context_length / 1000000).toFixed(0)}M`
      : status.context_length >= 1000
        ? `${Math.round(status.context_length / 1000)}K`
        : String(status.context_length)
    : "?";

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn("flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md transition-colors", cfg.bg, cfg.color)}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot, status.status === "online" && "animate-pulse")} />
        <span className="font-mono truncate max-w-[120px]">{status.model}</span>
        <span className="opacity-60">·</span>
        <span>{cfg.label}</span>
        {status.latency_ms && status.status === "online" && (
          <span className="opacity-60">{status.latency_ms}ms</span>
        )}
      </button>

      {expanded && (
        <div className="absolute top-full right-0 mt-1 w-72 rounded-lg border border-border bg-card shadow-lg z-50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Model Status</span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onRefresh}>
              <Activity className="h-3 w-3" />
            </Button>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Model</span>
            <span className="font-mono">{status.model}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Status</span>
            <span className={cn("flex items-center gap-1", cfg.color)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Context</span>
            <span className="font-mono">{contextStr} tokens</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Tools</span>
            <span className={status.supports_tools ? "text-emerald-400" : "text-destructive"}>
              {status.supports_tools ? "✓ Supported" : "✗ Not supported"}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Response format</span>
            <span className={status.supports_response_format ? "text-emerald-400" : "text-muted-foreground"}>
              {status.supports_response_format ? "✓ Supported" : "✗ Not supported"}
            </span>
          </div>
          {status.latency_ms && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Latency</span>
              <span className="font-mono">{status.latency_ms}ms</span>
            </div>
          )}
          {status.key_hint && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">API key</span>
              <span className="font-mono">…{status.key_hint}</span>
            </div>
          )}
          {status.detail && (
            <div className="text-[10px] text-muted-foreground bg-secondary/30 rounded p-2 mt-1">
              {status.detail}
            </div>
          )}
        </div>
      )}
    </div>
  );
}