import { useMemo, useState, useEffect } from "react";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import {
  WelcomeWidget, MemoriesStatWidget, ConnectorsStatWidget, EventsStatWidget,
  QuickStartWidget, ProjectInfoWidget, AnalyticsWidget, SkillsResumeWidget,
  PluginsSummaryWidget, RecentActivityWidget, UsageWidget, DocsWidget,
} from "@/components/dashboard/widgets";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const RGL = WidthProvider(GridLayout);

type WidgetDef = { i: string; el: React.ReactNode; default: Omit<Layout, "i"> };

const WIDGETS: WidgetDef[] = [
  { i: "welcome",    el: <WelcomeWidget />,        default: { x: 0, y: 0,  w: 8, h: 6, minW: 4, minH: 5 } },
  { i: "usage",      el: <UsageWidget />,          default: { x: 8, y: 0,  w: 4, h: 6, minW: 3, minH: 5 } },
  { i: "memories",   el: <MemoriesStatWidget />,   default: { x: 0, y: 6,  w: 3, h: 6, minW: 2, minH: 5 } },
  { i: "connectors", el: <ConnectorsStatWidget />, default: { x: 3, y: 6,  w: 3, h: 6, minW: 2, minH: 5 } },
  { i: "events",     el: <EventsStatWidget />,     default: { x: 6, y: 6,  w: 3, h: 6, minW: 2, minH: 5 } },
  { i: "docs",       el: <DocsWidget />,           default: { x: 9, y: 6,  w: 3, h: 6, minW: 2, minH: 5 } },
  { i: "analytics",  el: <AnalyticsWidget />,      default: { x: 0, y: 12, w: 6, h: 8, minW: 4, minH: 6 } },
  { i: "skills",     el: <SkillsResumeWidget />,   default: { x: 6, y: 12, w: 3, h: 8, minW: 3, minH: 5 } },
  { i: "plugins",    el: <PluginsSummaryWidget />, default: { x: 9, y: 12, w: 3, h: 8, minW: 3, minH: 5 } },
  { i: "activity",   el: <RecentActivityWidget />, default: { x: 0, y: 20, w: 6, h: 6, minW: 4, minH: 5 } },
  { i: "quickstart", el: <QuickStartWidget />,     default: { x: 6, y: 20, w: 3, h: 6, minW: 3, minH: 5 } },
  { i: "project",    el: <ProjectInfoWidget />,    default: { x: 9, y: 20, w: 3, h: 6, minW: 3, minH: 5 } },
];

const STORAGE_KEY = "synapse:dashboard:layout:v2";

export default function DashboardHome() {
  const defaultLayout = useMemo<Layout[]>(
    () => WIDGETS.map((w) => ({ i: w.i, ...w.default })),
    []
  );

  const [layout, setLayout] = useState<Layout[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return defaultLayout;
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch {}
  }, [layout]);

  const reset = () => setLayout(defaultLayout);

  return (
    <>
      <PageHeader
        title="Home"
        description="Drag widgets by their handle, resize from the corners."
        actions={
          <Button variant="outline" size="sm" onClick={reset} className="gap-2">
            <RotateCcw className="h-3.5 w-3.5" /> Reset layout
          </Button>
        }
      />
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <RGL
            className="layout"
            layout={layout}
            cols={12}
            rowHeight={36}
            margin={[16, 16]}
            containerPadding={[0, 0]}
            draggableHandle=".drag-handle"
            onLayoutChange={(l) => setLayout(l)}
            onDragStart={() => document.body.classList.add("rgl-dragging")}
            onDragStop={() => document.body.classList.remove("rgl-dragging")}
            onResizeStart={() => document.body.classList.add("rgl-dragging")}
            onResizeStop={() => document.body.classList.remove("rgl-dragging")}
            compactType="vertical"
          >
            {WIDGETS.map((w) => (
              <div key={w.i}>{w.el}</div>
            ))}
          </RGL>
        </div>
      </div>
    </>
  );
}
