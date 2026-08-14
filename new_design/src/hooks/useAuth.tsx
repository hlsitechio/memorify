import { createContext, useContext, ReactNode } from "react";
import {
  useAuth as useClerkAuth,
  useUser,
  useClerk,
} from "@clerk/react";

/**
 * Compatibility auth layer: Clerk under the hood, same useAuth() surface
 * the dashboard already expects (user / loading / signOut).
 */
type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

type AuthCtx = {
  user: AuthUser | null;
  session: { access_token?: string } | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const { signOut: clerkSignOut } = useClerk();

  const loading = !isLoaded;

  const user: AuthUser | null =
    isLoaded && isSignedIn && userId
      ? {
          id: userId,
          email: clerkUser?.primaryEmailAddress?.emailAddress ?? null,
          user_metadata: {
            username:
              clerkUser?.username ??
              clerkUser?.fullName ??
              clerkUser?.firstName ??
              undefined,
            full_name: clerkUser?.fullName ?? undefined,
            avatar_url: clerkUser?.imageUrl ?? undefined,
          },
        }
      : null;

  // Lightweight session shim so older callers expecting session.access_token
  // can still call getToken when they migrate.
  const session =
    user != null
      ? {
          access_token: undefined as string | undefined,
          getToken,
        }
      : null;

  return (
    <Ctx.Provider
      value={{
        user,
        session,
        loading,
        signOut: async () => {
          await clerkSignOut({ redirectUrl: "/" });
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
