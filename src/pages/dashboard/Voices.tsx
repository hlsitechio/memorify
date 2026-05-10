import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { Mic } from "lucide-react";

export default function Voices() {
  return (
    <ComingSoon
      title="Voices"
      description="Speech in, speech out — clone, synthesize, transcribe."
      icon={Mic}
      blurb="A unified voice layer: TTS for agent replies, STT for user input, and voice cloning for branded personas."
      bullets={[
        "Low-latency streaming TTS / STT",
        "Voice library with cloning + presets",
        "Per-agent voice assignment",
        "Realtime mode for live conversations",
      ]}
    />
  );
}
