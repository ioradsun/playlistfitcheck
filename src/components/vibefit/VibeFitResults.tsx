import { useState, useEffect } from "react";
import { Copy, Download, RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SignUpToSaveBanner } from "@/components/SignUpToSaveBanner";

export interface VibeFitOutput {
  captions: {
    instagram: string[];
    tiktok: string[];
    storytelling: string;
    hashtags: string[];
  };
  coverArt: string[];
}

interface VibeFitResultsProps {
  result: VibeFitOutput;
  songTitle?: string;
  onBack: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
  onHeaderProject?: (project: { title: string; onBack: () => void } | null) => void;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium tracking-wide uppercase text-muted-foreground/50 mb-3">
      {children}
    </p>
  );
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

export function VibeFitResults({ result, songTitle, onBack, onRegenerate, regenerating, onHeaderProject }: VibeFitResultsProps) {
  useEffect(() => {
    onHeaderProject?.({ title: songTitle || "Your Vibe", onBack });
    return () => onHeaderProject?.(null);
  }, [songTitle, onBack, onHeaderProject]);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-10 pb-24">

      {/* Cover Art */}
      {result.coverArt.length > 0 && (
        <section>
          <Label>Cover Art</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {result.coverArt.map((art, i) => (
              <div key={i} className="rounded-lg overflow-hidden group relative border border-border/20">
                <img src={art} alt={`Cover art ${i + 1}`} className="w-full aspect-square object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button size="sm" variant="secondary" onClick={() => downloadImage(art, i)}>
                    Download
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
            className="mt-3 gap-1.5"
          >
            <RefreshCw size={14} className={regenerating ? "animate-spin" : ""} />
            Regenerate
          </Button>
        </section>
      )}

      {/* Instagram Captions */}
      <section>
        <Label>Instagram Captions</Label>
        <div className="space-y-2">
          {result.captions.instagram.map((cap, i) => (
            <div key={i} className="border border-border/20 rounded-lg p-3 flex items-start gap-2">
              <p className="text-sm text-foreground/80 flex-1 whitespace-pre-wrap">{cap}</p>
              <CopyButton text={cap} />
            </div>
          ))}
        </div>
      </section>

      {/* TikTok Captions */}
      <section>
        <Label>TikTok Captions</Label>
        <div className="space-y-2">
          {result.captions.tiktok.map((cap, i) => (
            <div key={i} className="border border-border/20 rounded-lg p-3 flex items-start gap-2">
              <p className="text-sm text-foreground/80 flex-1 whitespace-pre-wrap">{cap}</p>
              <CopyButton text={cap} />
            </div>
          ))}
        </div>
      </section>

      {/* Storytelling */}
      <section>
        <Label>Storytelling Caption</Label>
        <div className="border border-border/20 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <p className="text-sm text-foreground/80 flex-1 whitespace-pre-wrap leading-relaxed">
              {result.captions.storytelling}
            </p>
            <CopyButton text={result.captions.storytelling} />
          </div>
        </div>
      </section>

      {/* Hashtags */}
      {result.captions.hashtags.length > 0 && (
        <section>
          <Label>Hashtags</Label>
          <div className="flex flex-wrap gap-1.5">
            {result.captions.hashtags.map((tag) => (
              <button
                key={tag}
                className="font-mono text-xs border border-border/30 px-2 py-0.5 rounded-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                onClick={() => {
                  navigator.clipboard.writeText(`#${tag}`);
                  toast.success(`Copied #${tag}`);
                }}
              >
                #{tag}
              </button>
            ))}
          </div>
          <button
            className="text-xs text-muted-foreground hover:text-foreground mt-2 transition-colors"
            onClick={() => {
              const all = result.captions.hashtags.map((t) => `#${t}`).join(" ");
              navigator.clipboard.writeText(all);
              toast.success("All hashtags copied!");
            }}
          >
            Copy All
          </button>
        </section>
      )}

      <SignUpToSaveBanner />
    </div>
  );
}
