import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, MessageCircle, Copy, Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import type { PlaylistInput } from "@/lib/playlistHealthEngine";

interface Props {
  songName: string;
  artistName?: string;
  playlistName: string;
  curatorName?: string;
  fitLabel?: string;
  strengths?: string[];
  concerns?: string[];
  suggestion?: string;
  inputData?: PlaylistInput;
  blendedScore?: number;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function buildMetricsLines(input?: PlaylistInput): string[] {
  if (!input) return [];
  const lines: string[] = [];

  // Follower-to-track ratio
  if (input.followersTotal != null && input.tracksTotal != null && input.tracksTotal > 0) {
    const ratio = Math.round(input.followersTotal / input.tracksTotal);
    if (ratio > 50) {
      lines.push(`${fmt(ratio)}:1 follower-to-track ratio`);
    }
  }

  // Track count (selectivity signal)
  if (input.tracksTotal != null && input.tracksTotal <= 100) {
    lines.push(`tight ${input.tracksTotal}-track rotation`);
  }

  // Churn rate
  if (input.churnRate30d != null) {
    const churnPct = Math.round(input.churnRate30d * 100);
    if (churnPct > 0) {
      lines.push(`${churnPct}% monthly churn`);
    }
  }

  // Recent activity
  if (input.lastUpdatedDays != null) {
    if (input.lastUpdatedDays === 0) {
      lines.push("updated today");
    } else if (input.lastUpdatedDays <= 7) {
      lines.push(`updated ${input.lastUpdatedDays} day${input.lastUpdatedDays !== 1 ? "s" : ""} ago`);
    }
  }

  // Bottom placement
  if (input.bottomDumpScore != null && input.bottomDumpScore > 0.1) {
    lines.push("bottom-entry rotation style");
  }

  return lines;
}

function generateEmailPitch({ songName, artistName, playlistName, curatorName, strengths, inputData, blendedScore }: Props): string {
  const artist = artistName || "[Your Artist Name]";
  const curator = curatorName || "there";
  const metrics = buildMetricsLines(inputData);

  // Opening — show intelligence
  let opener: string;
  if (metrics.length >= 2) {
    opener = `I've been studying "${playlistName}" — the ${metrics.slice(0, 2).join(" and ")} tells me you're extremely selective and protect the listening experience.`;
  } else if (metrics.length === 1) {
    opener = `I've been studying "${playlistName}" — the ${metrics[0]} tells me you curate with real intention.`;
  } else {
    opener = `I've been following "${playlistName}" and I can see you curate with intention — the quality stands out.`;
  }

  // Fit positioning from strengths
  let fitLine = "";
  if (strengths && strengths.length > 0) {
    fitLine = `\n\n${strengths[0]}`;
    if (strengths.length > 1) {
      fitLine += ` ${strengths[1]}`;
    }
  }

  // Risk removal
  let riskRemoval = "";
  if (inputData?.bottomDumpScore != null && inputData.bottomDumpScore > 0.1) {
    riskRemoval = "\n\nHappy for it to start at the bottom and prove itself on saves and completion rate.";
  } else if (inputData?.churnRate30d != null && inputData.churnRate30d < 0.2) {
    riskRemoval = "\n\nI respect the low rotation — if it doesn't genuinely elevate the list, no worries at all.";
  }

  // Metrics context line
  const metricsContext = metrics.length > 2
    ? `\n\n[If you have streaming data, add one line like: "Currently seeing a __% save rate on similar playlists."]`
    : "";

  return `Subject: ${songName} — [genre/vibe keyword] for ${playlistName}

Hey ${curator},

${opener}

I'm reaching out about "${songName}" by ${artist}.${fitLine}${riskRemoval}

Here's the track:
[Spotify Link]${metricsContext}

If it doesn't fit, no worries at all. But I think it earns a spot.

Appreciate what you're building.

— ${artist}`;
}

function generateDMPitch({ songName, artistName, playlistName, curatorName, strengths, inputData }: Props): string {
  const artist = artistName || "[Your Artist Name]";
  const curator = curatorName ? `${curatorName} — ` : "";
  const metrics = buildMetricsLines(inputData);

  // Compact intelligence signal
  let intelLine: string;
  if (metrics.length >= 2) {
    intelLine = `The ${metrics.slice(0, 2).join(" + ")} shows you protect quality.`;
  } else if (metrics.length === 1) {
    intelLine = `The ${metrics[0]} shows you curate with intention.`;
  } else {
    intelLine = `The curation quality stands out.`;
  }

  // Fit line from strengths
  let fitLine = "";
  if (strengths && strengths.length > 0) {
    // Extract the core insight, keep it short
    const s = strengths[0];
    fitLine = s.length > 100 ? s.slice(0, 100) + "." : s;
  }

  // Risk removal
  let riskLine = "";
  if (inputData?.bottomDumpScore != null && inputData.bottomDumpScore > 0.1) {
    riskLine = "\n\nHappy for it to start bottom-of-list and prove itself.";
  }

  return `${curator}been following "${playlistName}".

${intelLine}

I have a track ("${songName}" — ${artist}) that ${fitLine ? fitLine.charAt(0).toLowerCase() + fitLine.slice(1) : "fits the vibe you've built"}.

If you're open to hearing it:
[Spotify Link]${riskLine}

Appreciate your ear.`;
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
            Data-Driven Pitch
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
        Built from playlist metrics — not templates. Customize the bracketed sections before sending.
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
