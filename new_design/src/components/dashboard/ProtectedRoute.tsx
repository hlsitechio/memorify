import { Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth as useClerkAuth, useOrganizationList } from "@clerk/react";
import { useAuth } from "@/hooks/useAuth";
import { useNeonBootstrap } from "@/hooks/useNeonBootstrap";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { orgId } = useClerkAuth();
  const { isLoaded: orgListLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: true,
  });
  // Mirror Clerk user/org → Neon workspaces (debug + joins)
  useNeonBootstrap();

  useEffect(() => {
    if (!user || orgId || !orgListLoaded || !setActive) return;
    const firstOrg = userMemberships.data?.[0]?.organization?.id;
    if (!firstOrg) return;
    void setActive({ organization: firstOrg });
  }, [orgId, orgListLoaded, setActive, user, userMemberships.data]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}
