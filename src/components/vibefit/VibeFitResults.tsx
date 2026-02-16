import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, Download, RefreshCw, Check, Image, MessageSquare, Hash } from "lucide-react";
import { toast } from "sonner";
import { SignUpToSaveBanner } from "@/components/SignUpToSaveBanner";

export interface VibeFitOutput {
  captions: {
    instagram: string[];
    tiktok: string[];
    storytelling: string;
    hashtags: string[];
  };
  coverArt: string[]; // base64 data URLs
}

interface VibeFitResultsProps {
  result: VibeFitOutput;
  songTitle?: string;
  onBack: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      title="Copy"
    >
      {copied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
    </button>
  );
}

function downloadImage(dataUrl: string, index: number) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `vibefit-cover-${index + 1}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function VibeFitResults({ result, songTitle, onBack, onRegenerate, regenerating }: VibeFitResultsProps) {
  return (
    <div className="w-full max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft size={18} />
        </Button>
        <h1 className="text-xl font-semibold">{songTitle || "Your Vibe"}</h1>
      </div>

      {/* Cover Art */}
      {result.coverArt.length > 0 && (
        <motion.section
          className="space-y-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Image size={12} /> Cover Art
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {result.coverArt.map((art, i) => (
              <div key={i} className="glass-card rounded-xl overflow-hidden group relative">
                <img
                  src={art}
                  alt={`Cover art ${i + 1}`}
                  className="w-full aspect-square object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => downloadImage(art, i)}
                    className="gap-1.5"
                  >
                    <Download size={14} /> Download
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={regenerating}
            className="gap-1.5"
          >
            <RefreshCw size={14} className={regenerating ? "animate-spin" : ""} />
            Regenerate
          </Button>
        </motion.section>
      )}

      {/* Instagram Captions */}
      <motion.section
        className="space-y-3"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <MessageSquare size={12} /> Instagram Captions
        </div>
        <div className="space-y-2">
          {result.captions.instagram.map((cap, i) => (
            <div key={i} className="glass-card rounded-lg p-3 flex items-start gap-2">
              <p className="text-sm text-secondary-foreground flex-1 whitespace-pre-wrap">{cap}</p>
              <CopyButton text={cap} />
            </div>
          ))}
        </div>
      </motion.section>

      {/* TikTok Captions */}
      <motion.section
        className="space-y-3"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <MessageSquare size={12} /> TikTok Captions
        </div>
        <div className="space-y-2">
          {result.captions.tiktok.map((cap, i) => (
            <div key={i} className="glass-card rounded-lg p-3 flex items-start gap-2">
              <p className="text-sm text-secondary-foreground flex-1 whitespace-pre-wrap">{cap}</p>
              <CopyButton text={cap} />
            </div>
          ))}
        </div>
      </motion.section>

      {/* Storytelling */}
      <motion.section
        className="space-y-3"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          ✨ Storytelling Caption
        </div>
        <div className="glass-card rounded-lg p-4 border border-primary/10 bg-primary/5">
          <div className="flex items-start gap-2">
            <p className="text-sm text-secondary-foreground flex-1 whitespace-pre-wrap leading-relaxed">
              {result.captions.storytelling}
            </p>
            <CopyButton text={result.captions.storytelling} />
          </div>
        </div>
      </motion.section>

      {/* Hashtags */}
      {result.captions.hashtags.length > 0 && (
        <motion.section
          className="space-y-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Hash size={12} /> Hashtags
          </div>
          <div className="flex flex-wrap gap-1.5">
            {result.captions.hashtags.map((tag) => (
              <Badge key={tag} variant="secondary" className="font-mono text-xs cursor-pointer" onClick={() => {
                navigator.clipboard.writeText(`#${tag}`);
                toast.success(`Copied #${tag}`);
              }}>
                #{tag}
              </Badge>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => {
              const all = result.captions.hashtags.map((t) => `#${t}`).join(" ");
              navigator.clipboard.writeText(all);
              toast.success("All hashtags copied!");
            }}
          >
            <Copy size={12} className="mr-1" /> Copy All
          </Button>
        </motion.section>
      )}

      <SignUpToSaveBanner />
    </div>
  );
}
