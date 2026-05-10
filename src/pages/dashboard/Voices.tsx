import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Mic, Square, Upload, Trash2, RefreshCcw, Sparkles, Play, Pause, FileAudio, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type Voice = {
  id: string;
  title: string | null;
  name: string;
  kind: string;
  storage_path: string | null;
  mime: string | null;
  duration_sec: number | null;
  size: number | null;
  transcript: string | null;
  summary: string | null;
  action_items: string[] | null;
  status: string;
  recorded_at: string;
  created_at: string;
};

const fmtDuration = (s: number | null) => {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
};

export default function Voices() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Voice | null>(null);
  const [recording, setRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState("");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("voices")
      .select("*")
      .eq("user_id", user.id)
      .order("recorded_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as any) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [user]);

  // --- recording ---
  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        const duration = (Date.now() - startedAtRef.current) / 1000;
        await uploadBlob(blob, `Recording ${new Date().toLocaleString()}`, duration);
      };
      mr.start();
      mediaRef.current = mr;
      startedAtRef.current = Date.now();
      setRecElapsed(0);
      setRecording(true);
      tickRef.current = window.setInterval(() => {
        setRecElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);
    } catch (e: any) {
      toast.error(e.message ?? "Mic permission denied");
    }
  };
  const stopRec = () => {
    mediaRef.current?.stop();
    setRecording(false);
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  };

  const uploadBlob = async (blob: Blob, title: string, duration?: number) => {
    if (!user) return;
    setBusy(true);
    try {
      const ext = blob.type.includes("mp3") ? "mp3" : blob.type.includes("wav") ? "wav" : blob.type.includes("m4a") ? "m4a" : "webm";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("voices").upload(path, blob, { contentType: blob.type, upsert: false });
      if (up.error) throw up.error;
      const { error } = await supabase.from("voices").insert({
        user_id: user.id,
        name: title,
        title,
        kind: "recording",
        storage_path: path,
        mime: blob.type,
        size: blob.size,
        duration_sec: duration ?? null,
        status: "uploaded",
      });
      if (error) throw error;
      toast.success("Saved to your voice library");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await uploadBlob(f, f.name.replace(/\.[^.]+$/, ""));
    e.target.value = "";
  };

  // --- detail / playback ---
  const openDetail = async (v: Voice) => {
    setSelected(v);
    setTranscriptDraft(v.transcript ?? "");
    setPlaying(false);
    if (v.storage_path) {
      const { data } = await supabase.storage.from("voices").createSignedUrl(v.storage_path, 3600);
      setAudioUrl(data?.signedUrl ?? null);
    } else setAudioUrl(null);
  };

  const togglePlay = () => {
    const el = audioRef.current; if (!el) return;
    if (playing) { el.pause(); setPlaying(false); } else { el.play(); setPlaying(true); }
  };

  const saveTranscript = async () => {
    if (!selected) return;
    const { error } = await supabase
      .from("voices")
      .update({ transcript: transcriptDraft, status: transcriptDraft.trim() ? "transcribed" : selected.status })
      .eq("id", selected.id);
    if (error) return toast.error(error.message);
    toast.success("Transcript saved");
    load();
    setSelected({ ...selected, transcript: transcriptDraft });
  };

  const summarize = async () => {
    if (!selected || !transcriptDraft.trim()) return toast.error("Add transcript first");
    setBusy(true);
    try {
      // Persist current transcript first
      await supabase.from("voices").update({ transcript: transcriptDraft }).eq("id", selected.id);
      const { data, error } = await supabase.functions.invoke("voice-summarize", {
        body: { voice_id: selected.id, transcript: transcriptDraft },
      });
      if (error) throw error;
      toast.success("Summary ready");
      const updated = {
        ...selected,
        transcript: transcriptDraft,
        title: data?.title ?? selected.title,
        summary: data?.summary ?? selected.summary,
        action_items: data?.action_items ?? selected.action_items,
        status: "summarized",
      };
      setSelected(updated);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Summarize failed");
    } finally {
      setBusy(false);
    }
  };

  const del = async (v: Voice) => {
    if (v.storage_path) await supabase.storage.from("voices").remove([v.storage_path]);
    await supabase.from("voices").delete().eq("id", v.id);
    if (selected?.id === v.id) setSelected(null);
    load();
  };

  return (
    <>
      <PageHeader
        title="Voices"
        description="Record or upload voice clips and meetings — get instant transcripts, summaries, and action items."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load}><RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Refresh</Button>
            <label>
              <input type="file" accept="audio/*" className="hidden" onChange={onPickFile} />
              <Button asChild size="sm" variant="outline"><span className="cursor-pointer"><Upload className="h-3.5 w-3.5 mr-1.5" /> Upload</span></Button>
            </label>
            {!recording ? (
              <Button size="sm" onClick={startRec}><Mic className="h-3.5 w-3.5 mr-1.5" /> Record</Button>
            ) : (
              <Button size="sm" variant="destructive" onClick={stopRec}>
                <Square className="h-3.5 w-3.5 mr-1.5" /> Stop · {fmtDuration(recElapsed)}
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] h-[calc(100vh-3.5rem)] overflow-hidden">
        {/* List */}
        <div className="border-r border-border overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <FileAudio className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
              <p className="text-sm font-medium">No clips yet</p>
              <p className="text-xs text-muted-foreground mt-1">Hit Record or drop an audio file.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((v) => (
                <button
                  key={v.id}
                  onClick={() => openDetail(v)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-secondary/40 transition-colors",
                    selected?.id === v.id && "bg-secondary/60",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 h-8 w-8 shrink-0 rounded-md bg-primary/10 flex items-center justify-center">
                      <Mic className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{v.title || v.name}</p>
                        {v.status === "summarized" && <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {v.summary?.split("\n")[0] || (v.transcript ? v.transcript.slice(0, 80) : "No transcript yet")}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{v.status}</Badge>
                        <span className="text-[10px] text-muted-foreground">{fmtDuration(v.duration_sec)}</span>
                        <span className="text-[10px] text-muted-foreground">· {formatDistanceToNow(new Date(v.recorded_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="overflow-y-auto scrollbar-thin">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground p-12 text-center">
              <div>
                <Sparkles className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
                <p>Select a clip to view its transcript and AI summary.</p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-5 max-w-3xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Input
                    value={selected.title ?? selected.name}
                    onChange={(e) => setSelected({ ...selected, title: e.target.value })}
                    onBlur={async (e) => {
                      await supabase.from("voices").update({ title: e.target.value }).eq("id", selected.id);
                      load();
                    }}
                    className="text-lg font-semibold border-0 px-0 h-auto shadow-none focus-visible:ring-0"
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-[10px]">{selected.status}</Badge>
                    <span className="text-xs text-muted-foreground">{fmtDuration(selected.duration_sec)} · {formatDistanceToNow(new Date(selected.recorded_at), { addSuffix: true })}</span>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => del(selected)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>

              {audioUrl && (
                <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
                  <Button size="icon" variant="outline" onClick={togglePlay}>
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <audio ref={audioRef} src={audioUrl} onEnded={() => setPlaying(false)} className="flex-1" controls />
                </div>
              )}

              {(selected.summary || (selected.action_items?.length ?? 0) > 0) && (
                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4 text-primary" /> AI Summary
                  </div>
                  {selected.summary && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{selected.summary}</p>
                  )}
                  {(selected.action_items?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs font-medium mb-1.5 text-foreground">Action items</p>
                      <ul className="space-y-1">
                        {selected.action_items!.map((a, i) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Transcript</label>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={saveTranscript} disabled={busy}>Save</Button>
                    <Button size="sm" onClick={summarize} disabled={busy || !transcriptDraft.trim()}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                      Summarize
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={transcriptDraft}
                  onChange={(e) => setTranscriptDraft(e.target.value)}
                  placeholder="Paste or type the transcript here. Auto-transcription via ElevenLabs Scribe is coming next — for now you can drop in your own text or notes."
                  className="min-h-[280px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Tip: paste raw notes or a transcript and press Summarize — Lovable AI will produce a title, summary, and action items.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
