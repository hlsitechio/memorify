import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { Image as ImageIcon } from "lucide-react";

export default function Images() {
  return (
    <ComingSoon
      title="Images"
      description="Generate, edit, and store images that agents can read and write."
      icon={ImageIcon}
      blurb="A first-class image surface for your agents — generate from prompts, edit existing assets, and reference them by URL or memory key."
      bullets={[
        "Multi-provider generation (Gemini, GPT-Image, SDXL)",
        "In-place edits and inpainting",
        "Asset library with tags and namespaces",
        "Vision-ready: feed back into agents",
      ]}
    />
  );
}
