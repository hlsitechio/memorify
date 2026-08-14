// Stripe client for Memorify frontend
// Loads publishable key from Vite env

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (typeof window === "undefined") return null;
  if (!stripeInstance) {
    const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      console.warn("VITE_STRIPE_PUBLISHABLE_KEY not set");
      return null;
    }
    stripeInstance = new Stripe(publishableKey);
  }
  return stripeInstance;
}

export async function createCheckoutSession(
  priceId: string,
  successUrl: string,
  cancelUrl: string,
  mode: "payment" | "subscription" = "subscription",
  customerEmail?: string
): Promise<{ sessionId: string; url: string } | null> {
  const token = await (window as any).Clerk?.session?.getToken?.();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch("/api/v1/stripe/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ priceId, successUrl, cancelUrl, mode, customerEmail }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create checkout session");
  }

  return res.json();
}

export async function createPortalSession(returnUrl: string): Promise<{ url: string } | null> {
  const token = await (window as any).Clerk?.session?.getToken?.();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch("/api/v1/stripe/portal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ returnUrl }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create portal session");
  }

  return res.json();
}