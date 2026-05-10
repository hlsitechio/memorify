import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { Table2 } from "lucide-react";

export default function DatabasePage() {
  return (
    <ComingSoon
      title="Database"
      description="Structured state your agents can read and write — with schema, types, and RLS."
      icon={Table2}
      blurb="Where Memory is associative, Database is relational. Define tables, run queries, and let agents persist structured facts safely."
      bullets={[
        "Visual table editor with types and constraints",
        "SQL playground with saved snippets",
        "Row-level policies bound to agent identity",
        "Realtime subscriptions for live UIs",
      ]}
    />
  );
}
