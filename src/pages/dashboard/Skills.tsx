import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { Sparkles } from "lucide-react";

export default function Skills() {
  return (
    <ComingSoon
      title="Skills"
      description="Reusable agent capabilities — code, prompts, and tools bundled into one."
      icon={Sparkles}
      blurb="A skill is a versioned bundle that gives your agent a new capability: a prompt, a script, optional schemas, and the connectors it needs."
      bullets={[
        "Author skills in TS/Python or pure prompt",
        "Version, fork, and roll back per environment",
        "Share across agents in your workspace",
        "Composable — skills can call other skills",
      ]}
    />
  );
}
