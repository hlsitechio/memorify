import { Home, Sparkles, Puzzle, Plug, Database, FileText, Image as ImageIcon, Mic, Table2, Lock, Activity, ScrollText, KeyRound, Settings, type LucideIcon } from "lucide-react";

export type DashRoute = {
  to: string;
  label: string;
  group: string;
  icon: LucideIcon;
  keywords?: string;
  end?: boolean;
};

export const dashboardRoutes: DashRoute[] = [
  { to: "/dashboard", label: "Home", group: "Workspace", icon: Home, end: true, keywords: "overview" },
  { to: "/dashboard/skills", label: "Skills", group: "Build", icon: Sparkles, keywords: "capabilities tools" },
  { to: "/dashboard/plugins", label: "Plugins", group: "Build", icon: Puzzle, keywords: "extensions runtime" },
  { to: "/dashboard/connectors", label: "Connectors", group: "Build", icon: Plug, keywords: "integrations" },
  { to: "/dashboard/memory", label: "Memory", group: "Knowledge", icon: Database, keywords: "vector store" },
  { to: "/dashboard/documents", label: "Documents", group: "Knowledge", icon: FileText, keywords: "files pdf" },
  { to: "/dashboard/images", label: "Images", group: "Knowledge", icon: ImageIcon, keywords: "photos vision" },
  { to: "/dashboard/voices", label: "Voices", group: "Knowledge", icon: Mic, keywords: "audio tts stt" },
  { to: "/dashboard/database", label: "Database", group: "Data", icon: Table2, keywords: "sql tables" },
  { to: "/dashboard/vault", label: "Vault", group: "Data", icon: Lock, keywords: "secrets credentials" },
  { to: "/dashboard/events", label: "Events", group: "Observe", icon: Activity, keywords: "stream realtime" },
  { to: "/dashboard/logs", label: "Logs", group: "Observe", icon: ScrollText, keywords: "history" },
  { to: "/dashboard/api-keys", label: "API keys", group: "Project", icon: KeyRound, keywords: "tokens" },
  { to: "/dashboard/settings", label: "Settings", group: "Project", icon: Settings },
];
