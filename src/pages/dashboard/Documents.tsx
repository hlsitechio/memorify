import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { FileText } from "lucide-react";

export default function Documents() {
  return (
    <ComingSoon
      title="Documents"
      description="Ingest, chunk, and ground your agents in your own knowledge."
      icon={FileText}
      blurb="Upload PDFs, Markdown, HTML, or sync from Drive/Notion. Synapse parses, chunks, embeds, and indexes — your agents query through Memory."
      bullets={[
        "Drag-and-drop upload, or sync from connectors",
        "Automatic chunking + embedding pipeline",
        "Per-namespace access control",
        "Re-index on change, with cost preview",
      ]}
    />
  );
}
