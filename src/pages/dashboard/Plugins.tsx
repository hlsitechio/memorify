import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { Puzzle } from "lucide-react";

export default function Plugins() {
  return (
    <ComingSoon
      title="Plugins"
      description="Extend Synapse — add runtimes, models, stores, and middleware."
      icon={Puzzle}
      blurb="Plugins extend the Synapse runtime itself. Drop in custom retrievers, model adapters, guards, or transports without forking the core."
      bullets={[
        "Model adapters (OpenAI, Anthropic, local, custom)",
        "Memory backends (pgvector, Redis, in-memory)",
        "Guards & middleware (PII, rate limit, cost cap)",
        "Hot-reload in dev, signed in prod",
      ]}
    />
  );
}
