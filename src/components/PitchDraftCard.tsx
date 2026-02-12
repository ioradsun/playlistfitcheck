import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, MessageCircle, Copy, Check, Zap } from "lucide-react";
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
      className="glass-card rounded-xl p-5 space-y-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Sample Pitch
          </h3>
        </div>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
          <button
            onClick={() => setTab("email")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === "email"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Mail size={12} /> Email
          </button>
          <button
            onClick={() => setTab("dm")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === "dm"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageCircle size={12} /> DM
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground italic">
        Signals understanding, not analysis. Customize before sending.
      </p>

      <pre className="text-sm text-secondary-foreground leading-relaxed whitespace-pre-wrap font-sans bg-muted/30 rounded-lg p-4 border border-border/50">
        {pitch}
      </pre>

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="gap-1.5"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </motion.div>
  );
}
