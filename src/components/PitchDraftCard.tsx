import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, MessageCircle, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface Props {
  songName: string;
  artistName?: string;
  playlistName: string;
  curatorName?: string;
  fitLabel?: string;
  strengths?: string[];
}

function generateEmailPitch({ songName, artistName, playlistName, curatorName, strengths }: Props): string {
  const artist = artistName || "[Your Artist Name]";
  const curator = curatorName || "there";
  const strengthLine = strengths && strengths.length > 0
    ? `\n\nI believe "${songName}" would be a strong fit because ${strengths[0].toLowerCase()}`
    : "";

  return `Subject: Song Submission — "${songName}" for ${playlistName}

Hey ${curator},

I hope this message finds you well! I'm reaching out because I'd love to submit "${songName}" by ${artist} for consideration on your playlist "${playlistName}".${strengthLine}

I've been following your playlist and really appreciate the curation. I think this track aligns well with the direction you've built.

Here's the track: [Insert Spotify Link]

Would love to hear your thoughts — thank you for your time and for supporting independent artists!

Best,
${artist}`;
}

function generateDMPitch({ songName, artistName, playlistName, curatorName, strengths }: Props): string {
  const artist = artistName || "[Your Artist Name]";
  const curator = curatorName || "";
  const greeting = curator ? `Hey ${curator}!` : "Hey!";
  const strengthLine = strengths && strengths.length > 0
    ? ` I think it fits because ${strengths[0].toLowerCase()}`
    : "";

  return `${greeting} 👋

Love what you've built with "${playlistName}" — really solid curation.

I'd love to submit "${songName}" by ${artist} for your consideration.${strengthLine}

Here's the link: [Insert Spotify Link]

Appreciate your time! 🙏`;
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
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Sample Pitch
        </h3>
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
