import { ReactNode, useEffect } from "react";
import { useDashboardUI } from "./DashboardUIContext";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  const { setPageMeta } = useDashboardUI();
  useEffect(() => {
    setPageMeta({ title, description, actions });
    return () => setPageMeta(null);
  }, [title, description, actions, setPageMeta]);
  return null;
}
