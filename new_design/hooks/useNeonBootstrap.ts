/**
 * Sync signed-in Clerk user + active organization into Neon.
 * Call once when entering the dashboard (and when org changes).
 */
import { useAuth, useOrganization, useUser } from "@clerk/react";
import { useEffect, useRef } from "react";

const BOOTSTRAP_URL = "/api/bootstrap";

export function useNeonBootstrap() {
  const { isSignedIn, getToken, orgId } = useAuth();
  const { user } = useUser();
  const { organization, membership } = useOrganization();
  const lastKey = useRef<string>("");

  useEffect(() => {
    if (!isSignedIn || !user) return;

    const key = `${user.id}:${organization?.id ?? orgId ?? ""}`;
    if (lastKey.current === key) return;
    lastKey.current = key;

    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const body = {
          user: {
            id: user.id,
            email: user.primaryEmailAddress?.emailAddress ?? null,
            first_name: user.firstName,
            last_name: user.lastName,
            full_name: user.fullName,
            image_url: user.imageUrl,
          },
          workspace: organization
            ? {
                id: organization.id,
                name: organization.name,
                slug: organization.slug,
                image_url: organization.imageUrl,
              }
            : orgId
              ? { id: orgId, name: "Workspace", slug: null, image_url: null }
              : null,
        };

        const res = await fetch(BOOTSTRAP_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.text();
          console.warn("[neon-bootstrap]", res.status, err);
          return;
        }

        const data = await res.json();
        if (import.meta.env.DEV) {
          console.info("[neon-bootstrap]", data);
        }
      } catch (e) {
        console.warn("[neon-bootstrap] failed", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, user, organization, orgId, membership?.id, getToken]);
}