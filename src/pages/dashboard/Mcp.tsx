import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, RefreshCcw, Trash2, Server, Wrench, Plug2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type McpServer = {
  id: string;
  name: string;
  url: string;
  transport: string;
  auth: any;
  enabled: boolean;
  last_handshake_at: string | null;
  last_error: string | null;
  created_at: string;
};

type McpTool = {
  id: string;
  mcp_server_id: string;
  name: string;
  description: string | null;
  input_schema: any;
  enabled: boolean;
};

export default function Mcp() {
  const { user } = useAuth();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", url: "", transport: "http", bearer: "" });

  const load = async () => {
    if (!user) return;
    const [s, t] = await Promise.all([
      supabase.from("mcp_servers").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("mcp_tools").select("*").order("name"),
    ]);
    setServers((s.data as any) ?? []);
    setTools((t.data as any) ?? []);
  };
  useEffect(() => { load(); }, [user]);

  const create = async () => {
    if (!user || !form.name || !form.url) return toast.error("Name and URL required");
    const { error } = await supabase.from("mcp_servers").insert({
      user_id: user.id,
      name: form.name,
      url: form.url,
      transport: form.transport,
      auth: form.bearer ? { bearer: form.bearer } : {},
    });
    if (error) return toast.error(error.message);
    toast.success("Server added — running handshake…");
    setOpen(false);
    setForm({ name: "", url: "", transport: "http", bearer: "" });
    await load();
  };

  const handshake = async (id: string) => {
    setBusy(id);
    try {
      const { data, error } = await supabase.functions.invoke("mcp-handshake", { body: { server_id: id } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "handshake failed");
      toast.success(`Discovered ${data.count} tools`);
    } catch (e: any) {
      toast.error(e.message ?? "handshake failed");
    } finally {
      setBusy(null);
      load();
    }
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("mcp_servers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const toggleServer = async (s: McpServer) => {
    await supabase.from("mcp_servers").update({ enabled: !s.enabled }).eq("id", s.id);
    load();
  };

  const toggleTool = async (t: McpTool) => {
    await supabase.from("mcp_tools").update({ enabled: !t.enabled }).eq("id", t.id);
    load();
  };

  const addAsPlugin = async (s: McpServer, t: McpTool) => {
    if (!user) return;
    const { error } = await supabase.from("plugins").insert({
      user_id: user.id,
      name: `${s.name}: ${t.name}`,
      kind: "mcp_tool",
      ref_id: t.id,
      config: { server_id: s.id, tool_name: t.name },
    });
    if (error) return toast.error(error.message);
    toast.success("Added to plugins");
  };

  return (
    <>
      <PageHeader
        title="MCP servers"
        description="Model Context Protocol — bring your own tools via remote servers"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Refresh
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add server</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add MCP server</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My MCP" /></div>
                  <div className="space-y-1.5"><Label>URL</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/mcp" /></div>
                  <div className="space-y-1.5">
                    <Label>Transport</Label>
                    <Select value={form.transport} onValueChange={(v) => setForm({ ...form, transport: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="http">Streamable HTTP</SelectItem>
                        <SelectItem value="sse">SSE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Bearer token (optional)</Label><Input value={form.bearer} onChange={(e) => setForm({ ...form, bearer: e.target.value })} type="password" /></div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={create}>Add</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />
      <div className="p-6 space-y-4 overflow-y-auto scrollbar-thin h-[calc(100vh-3.5rem)]">
        {servers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <Server className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
            <p className="text-sm font-medium">No MCP servers</p>
            <p className="text-xs text-muted-foreground mt-1">Add a Streamable HTTP or SSE MCP server to expose its tools to your agents.</p>
          </div>
        ) : (
          servers.map((s) => {
            const stools = tools.filter((t) => t.mcp_server_id === s.id);
            return (
              <div key={s.id} className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      <div className="text-sm font-semibold truncate">{s.name}</div>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-mono",
                        s.last_error ? "bg-destructive/15 text-destructive" :
                        s.last_handshake_at ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground")}>
                        {s.last_error ? "error" : s.last_handshake_at ? "ready" : "pending"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{s.url}</div>
                    {s.last_error && <div className="text-xs text-destructive mt-1 truncate">{s.last_error}</div>}
                    {s.last_handshake_at && !s.last_error && <div className="text-[10px] text-muted-foreground mt-0.5">Last sync {formatDistanceToNow(new Date(s.last_handshake_at), { addSuffix: true })}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={s.enabled} onCheckedChange={() => toggleServer(s)} />
                    <Button size="sm" variant="outline" onClick={() => handshake(s.id)} disabled={busy === s.id}>
                      <RefreshCcw className={cn("h-3.5 w-3.5 mr-1.5", busy === s.id && "animate-spin")} /> Sync
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => del(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {stools.length === 0 ? (
                    <div className="p-4 text-xs text-muted-foreground">No tools discovered yet — click Sync.</div>
                  ) : stools.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                      <Wrench className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-mono truncate">{t.name}</div>
                        {t.description && <div className="text-[11px] text-muted-foreground truncate">{t.description}</div>}
                      </div>
                      <Switch checked={t.enabled} onCheckedChange={() => toggleTool(t)} />
                      <Button size="sm" variant="ghost" onClick={() => addAsPlugin(s, t)}>
                        <Plug2 className="h-3.5 w-3.5 mr-1.5" /> As plugin
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
