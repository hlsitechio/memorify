import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { RotateCcw, Plus, Check, LayoutGrid } from "lucide-react";
import { WIDGET_CATALOG, DEFAULT_VISIBLE_IDS } from "@/components/dashboard/widgets";
import { useDashboardWidgetBridge } from "@/copilot/bus";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { loadPrefs, readPrefsCache, savePrefs } from "@/lib/workspace-prefs";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const RGL = WidthProvider(GridLayout);

const WIDGET_BY_ID = Object.fromEntries(WIDGET_CATALOG.map((w) => [w.id, w]));

export default function DashboardHome() {
  const { user } = useAuth();
  const [ws] = useCurrentWorkspace();
  // Workspace key comes from Clerk org or the in-memory agent selection.
  const wsKey = ws?.id ?? (user ? `org:${user.id}` : "org:anon");

  const defaultLayout = useMemo<Layout[]>(
    () => DEFAULT_VISIBLE_IDS.map((id) => ({ i: id, ...WIDGET_BY_ID[id].default })),
    []
  );

  // Prime from cache so the dashboard paints instantly on workspace switch.
  const cached = readPrefsCache(wsKey);
  const [layout, setLayout] = useState<Layout[]>(
    cached?.layout?.length ? (cached.layout as Layout[]) : defaultLayout
  );
  const [visibleIds, setVisibleIds] = useState<string[]>(
    cached?.visible_ids?.length ? cached.visible_ids : [...DEFAULT_VISIBLE_IDS]
  );
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Skip the first save right after a workspace swap (we just loaded those values).
  const skipNextSave = useRef(false);

  // Workspace changed → load that workspace's prefs from backend.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    skipNextSave.current = true;
    (async () => {
      const remote = await loadPrefs(wsKey);
      if (cancelled) return;
      if (remote) {
        setLayout(remote.layout?.length ? (remote.layout as Layout[]) : defaultLayout);
        setVisibleIds(remote.visible_ids?.length ? remote.visible_ids : [...DEFAULT_VISIBLE_IDS]);
      } else {
        // No prefs yet for this workspace — start from defaults.
        setLayout(defaultLayout);
        setVisibleIds([...DEFAULT_VISIBLE_IDS]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsKey, user?.id]);

  // Persist (debounced) on every layout / visibility change.
  useEffect(() => {
    if (!user) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    savePrefs(wsKey, { layout: layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })) });
  }, [layout, wsKey, user]);
  useEffect(() => {
    if (!user) return;
    savePrefs(wsKey, { visible_ids: visibleIds });
  }, [visibleIds, wsKey, user]);

  const reset = useCallback(() => {
    setLayout(defaultLayout);
    setVisibleIds([...DEFAULT_VISIBLE_IDS]);
  }, [defaultLayout]);

  const addWidget = useCallback((id: string) => {
    const def = WIDGET_BY_ID[id];
    if (!def) return;
    setVisibleIds((cur) => (cur.includes(id) ? cur : [...cur, id]));
    setLayout((l) => (l.some((x) => x.i === id) ? l : [...l, { i: id, ...def.default }]));
  }, []);
  const removeWidget = useCallback((id: string) => {
    setVisibleIds((cur) => cur.filter((x) => x !== id));
  }, []);
  const moveWidget = useCallback((id: string, x: number, y: number) => {
    setLayout((l) => l.map((it) => (it.i === id ? { ...it, x, y } : it)));
  }, []);
  const resizeWidget = useCallback((id: string, w: number, h: number) => {
    setLayout((l) => l.map((it) => (it.i === id ? { ...it, w, h } : it)));
  }, []);
  const listWidgets = useCallback(
    () => layout.filter((it) => visibleIds.includes(it.i)).map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
    [layout, visibleIds]
  );

  useDashboardWidgetBridge({
    list: listWidgets,
    move: moveWidget,
    resize: resizeWidget,
    add: addWidget,
    remove: removeWidget,
    reset,
  });

  const visible = WIDGET_CATALOG.filter((w) => visibleIds.includes(w.id));
  const visibleLayout = layout.filter((l) => visibleIds.includes(l.i));

  const categories = useMemo(() => Array.from(new Set(WIDGET_CATALOG.map((w) => w.category))), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return WIDGET_CATALOG;
    return WIDGET_CATALOG.filter((w) =>
      w.name.toLowerCase().includes(q) ||
      w.description.toLowerCase().includes(q) ||
      w.category.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <>
      <PageHeader
        title="Home"
        description="Drag widgets by their handle, resize from the corners. Or ask Copilot."
        actions={
          <>
            <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
              <DialogTrigger asChild>
                <Button variant="border-glow" size="sm" className="gap-2">
                  <Plus className="h-3.5 w-3.5" /> Add widget
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><LayoutGrid className="h-4 w-4" /> Widget library</DialogTitle>
                  <DialogDescription>Add, remove, or replace cards on your dashboard. Changes save instantly.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <Input
                    autoFocus
                    placeholder="Search widgets…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <div className="max-h-[60vh] overflow-auto scrollbar-thin space-y-5 pr-1">
                    {categories.map((cat) => {
                      const items = filtered.filter((w) => w.category === cat);
                      if (!items.length) return null;
                      return (
                        <div key={cat}>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{cat}</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {items.map((w) => {
                              const installed = visibleIds.includes(w.id);
                              const Icon = w.icon;
                              return (
                                <button
                                  key={w.id}
                                  onClick={() => (installed ? removeWidget(w.id) : addWidget(w.id))}
                                  className={cn(
                                    "group text-left rounded-lg border bg-card p-3 flex items-start gap-3 transition-all duration-base",
                                    installed
                                      ? "border-primary/40 bg-primary/5 shadow-glow-subtle"
                                      : "border-border hover:border-primary/50 hover:bg-primary/5 hover:shadow-glow-subtle"
                                  )}
                                >
                                  <div className={cn(
                                    "h-8 w-8 shrink-0 rounded-md flex items-center justify-center transition-colors",
                                    installed ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                  )}>
                                    <Icon className="h-4 w-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium flex items-center gap-2">
                                      {w.name}
                                      {installed && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 inline-flex items-center gap-0.5"><Check className="h-2.5 w-2.5" />added</span>}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">{w.description}</div>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground self-center">
                                    {installed ? "Remove" : "Add"}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {filtered.length === 0 && (
                      <div className="text-sm text-muted-foreground text-center py-8">No widgets match "{query}".</div>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="border-subtle" size="sm" onClick={reset} className="gap-2">
              <RotateCcw className="h-3.5 w-3.5" /> Reset layout
            </Button>
          </>
        }
      />
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <RGL
            className="layout"
            layout={visibleLayout}
            cols={12}
            rowHeight={20}
            margin={[14, 14]}
            containerPadding={[0, 0]}
            draggableHandle=".drag-handle"
            onLayoutChange={(l) => setLayout((prev) => {
              const map = new Map(l.map((x) => [x.i, x]));
              return prev.map((p) => map.get(p.i) ?? p).concat(
                l.filter((x) => !prev.some((p) => p.i === x.i))
              );
            })}
            onDragStart={() => document.body.classList.add("rgl-dragging")}
            onDragStop={() => document.body.classList.remove("rgl-dragging")}
            onResizeStart={() => document.body.classList.add("rgl-dragging")}
            onResizeStop={() => document.body.classList.remove("rgl-dragging")}
            compactType="vertical"
          >
            {visible.map((w) => {
              const C = w.Component;
              return (
                <div key={w.id}>
                  <C onRemove={() => removeWidget(w.id)} />
                </div>
              );
            })}
          </RGL>
        </div>
      </div>
    </>
  );
}
