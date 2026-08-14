import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type CmdState = { open: boolean; initialQuery: string };
export type PageMeta = { title: string; description?: string; actions?: ReactNode } | null;

const Ctx = createContext<{
  cmd: CmdState;
  openCmd: (q?: string) => void;
  closeCmd: () => void;
  chatOpen: boolean;
  toggleChat: () => void;
  setChatOpen: (v: boolean) => void;
  pageMeta: PageMeta;
  setPageMeta: (m: PageMeta) => void;
} | null>(null);

export function DashboardUIProvider({ children }: { children: ReactNode }) {
  const [cmd, setCmd] = useState<CmdState>({ open: false, initialQuery: "" });
  const [pageMeta, setPageMeta] = useState<PageMeta>(null);
  const [chatOpen, setChatOpenState] = useState<boolean>(false);
  const setChatOpen = useCallback((v: boolean) => {
    setChatOpenState(v);
  }, []);

  const openCmd = useCallback((q = "") => setCmd({ open: true, initialQuery: q }), []);
  const closeCmd = useCallback(() => setCmd((s) => ({ ...s, open: false })), []);
  const toggleChat = useCallback(() => setChatOpen(!chatOpen), [chatOpen, setChatOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openCmd();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        toggleChat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCmd, toggleChat]);

  const value = useMemo(
    () => ({ cmd, openCmd, closeCmd, chatOpen, toggleChat, setChatOpen, pageMeta, setPageMeta }),
    [cmd, openCmd, closeCmd, chatOpen, toggleChat, setChatOpen, pageMeta]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboardUI() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDashboardUI must be used within DashboardUIProvider");
  return ctx;
}
