import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { Lock } from "lucide-react";

export default function Vault() {
  return (
    <ComingSoon
      title="Vault"
      description="Encrypted secrets — API keys, tokens, and credentials your agents need."
      icon={Lock}
      blurb="Store sensitive values once, reference them by name from skills and connectors. Encrypted at rest, never logged, scoped per environment."
      bullets={[
        "Per-environment scopes (dev / staging / prod)",
        "Audit log on every read",
        "Auto-rotation hooks for supported providers",
        "Sealed: never returned in plaintext via API",
      ]}
    />
  );
}
