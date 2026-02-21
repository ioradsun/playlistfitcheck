import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import type { PlaylistInput } from "@/lib/playlistHealthEngine";

interface Props {
  songName: string;
  artistName?: string;
  soundDescription?: string;
  playlistName: string;
  curatorName?: string;
  fitLabel?: string;
  strengths?: string[];
  concerns?: string[];
  suggestion?: string;
  inputData?: PlaylistInput;
  blendedScore?: number;
}

/** Translate raw metrics into human observations a curator would respect */
function buildInsightLines(input?: PlaylistInput): string[] {
  if (!input) return [];
  const lines: string[] = [];

  // Tight rotation = selective curator
  if (input.tracksTotal != null && input.tracksTotal <= 80) {
    lines.push("tight rotation");
  }

  // Low churn = they care about what stays
  if (input.churnRate30d != null && input.churnRate30d < 0.2) {
    lines.push("consistent mood");
  } else if (input.churnRate30d != null && input.churnRate30d >= 0.2) {
    lines.push("active rotation");
  }

  // Recently updated = engaged curator
  if (input.lastUpdatedDays != null && input.lastUpdatedDays <= 7) {
    lines.push("actively curated");
  }

  // Bottom placement pattern
  if (input.bottomDumpScore != null && input.bottomDumpScore > 0.1) {
    lines.push("bottom-entry style");
  }

  return lines;
}

function generateEmailPitch({ songName, artistName, playlistName, curatorName, strengths, inputData, soundDescription }: Props): string {
  const artist = artistName || "[Your Name]";
  const curator = curatorName || "there";
  const insights = buildInsightLines(inputData);

  // Opening — show you listened, not that you analyzed
  let opener: string;
  if (insights.includes("tight rotation") && insights.includes("consistent mood")) {
    opener = `I've been listening to ${playlistName} — I like how tight the rotation is and how consistent the mood stays from top to bottom.`;
  } else if (insights.includes("tight rotation")) {
    opener = `I've been listening to ${playlistName} — the curation is really intentional. You can tell every track earns its spot.`;
  } else if (insights.includes("actively curated")) {
    opener = `I've been following ${playlistName} for a while — the curation stays sharp and the mood never drifts.`;
  } else {
    opener = `I've been spending time with ${playlistName}. The mood consistency is strong — very dialed-in.`;
  }

  // Fit line — translate strengths into a natural sentence
  let fitLine = "";
  if (strengths && strengths.length > 0) {
    fitLine = `\n\nI think it complements the list without disrupting the flow. [Optional: "It's currently seeing a __% save rate on similar playlists."]`;
  } else {
    fitLine = `\n\nI think it fits the direction you've built. [Optional: "It's currently seeing a __% save rate on similar playlists."]`;
  }

  // Risk removal — soft, confident
  let closer: string;
  if (inputData?.bottomDumpScore != null && inputData.bottomDumpScore > 0.1) {
    closer = "If it fits the world you're building, I'd love to see it included — happy for it to start at the bottom and prove itself.";
  } else {
    closer = "If it fits the world you're building, I'd love to see it included.";
  }

  return `Subject: ${songName} — for ${playlistName}

Hey ${curator},

${opener}

I'm sharing "${songName}" by ${artist}. ${soundDescription || "[Describe your sound in one line]"}${fitLine}

Here's the track:
[Spotify Link]

${closer}

Appreciate your time,
${artist}`;
}

function generateDMPitch({ songName, artistName, playlistName, curatorName, inputData, soundDescription }: Props): string {
  const artist = artistName || "[Your Name]";
  const curator = curatorName ? `${curatorName} — ` : "";
  const insights = buildInsightLines(inputData);

  let intelLine: string;
  if (insights.includes("tight rotation") || insights.includes("consistent mood")) {
    intelLine = "The mood consistency is strong — very dialed-in.";
  } else if (insights.includes("actively curated")) {
    intelLine = "The curation stays sharp.";
  } else {
    intelLine = "Really solid curation.";
  }

  let riskLine = "";
  if (inputData?.bottomDumpScore != null && inputData.bottomDumpScore > 0.1) {
    riskLine = "\n\nHappy for it to start bottom-of-list and prove itself.";
  }

  return `${curator}been spending time with ${playlistName}.

${intelLine}

"${songName}" by ${artist} — ${soundDescription || "[describe your sound briefly]"}.

I think it fits without disrupting the flow. [Optional: "Seeing __% save rate on similar playlists."]

Link here:
[Spotify Link]${riskLine}

If it feels right, I'd love for you to consider it.

— ${artist}`;
}

type Tab = "email" | "dm";

export function PitchDraftCard(props: Props) {
  const [tab, setTab] = useState<Tab>("email");
  const [copied, setCopied] = useState(false);

  const pitch = tab === "email" ? generateEmailPitch(props) : generateDMPitch(props);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(pitch);
    setCopied(true);
    toast({ title: "Copied to clipboard!" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7 }}
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground/60 uppercase">Sample Pitch</p>
        <div className="flex gap-0 border-b border-border/30">
          {(["email", "dm"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-[13px] font-sans font-bold tracking-[0.15em] uppercase transition-colors border-b-2 -mb-[1px] ${
                tab === t
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground/30 hover:text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground/60 leading-snug">
        Signals understanding, not analysis. Customize before sending.
      </p>

      <pre className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-sans bg-muted/20 rounded-lg p-4 border border-border/30">
        {pitch}
      </pre>

      <div className="flex justify-end">
        <button
          onClick={handleCopy}
          className="text-[13px] font-sans font-bold tracking-[0.15em] uppercase text-muted-foreground/30 hover:text-foreground transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </motion.div>
  );
}
