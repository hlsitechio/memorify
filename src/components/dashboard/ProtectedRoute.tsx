// Auth is managed by the external backend (api.memorify.dev), not by this preview app.
// ProtectedRoute is a passthrough so the dashboard is always accessible from here.
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

