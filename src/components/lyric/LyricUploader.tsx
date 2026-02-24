import { useState } from "react";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { Info, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AudioUploadZone } from "@/components/ui/AudioUploadZone";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { toast } from "sonner";

interface Props {
  onTranscribe: (file: File, referenceLyrics?: string) => void;
  onLoadSaved?: (lyric: any) => void;
  loading: boolean;
  loadingMsg?: string;
  sceneInput?: React.ReactNode;
}

export function LyricUploader({ onTranscribe, loading, loadingMsg, sceneInput }: Props) {
  const siteCopy = useSiteCopy();
  const [files, setFiles] = useState<File[]>([]);
  const [referenceLyrics, setReferenceLyrics] = useState("");
  const [lyricsOpen, setLyricsOpen] = useState(false);

  const handleSubmit = () => {
    if (!files[0]) {
      toast.error("Please select an audio file first");
      return;
    }
    const lyrics = referenceLyrics.trim() || undefined;
    onTranscribe(files[0], lyrics);
  };

  const hasLyrics = referenceLyrics.trim().length > 0;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 text-center">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{siteCopy.tools.lyric?.heading || "Get Perfectly Timed Lyrics For Every Drop"}</h2>
        {siteCopy.tools.lyric?.subheading && <p className="text-sm text-muted-foreground">{siteCopy.tools.lyric.subheading}</p>}
      </div>

      <div className="glass-card rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium">Song</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                <Info size={13} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[220px]">MP3, WAV, M4A · 75 MB max · Large files auto-compressed</TooltipContent>
          </Tooltip>
        </div>
        <AudioUploadZone
          label="Upload"
          files={files}
          onChange={setFiles}
          maxFiles={1}
          disabled={loading}
        />
        {sceneInput}
      </div>

      {/* Optional Lyrics Paste */}
      <Collapsible open={lyricsOpen} onOpenChange={setLyricsOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            {hasLyrics ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="font-medium text-foreground">Editor Mode</span>
                <span>· Lyrics pasted</span>
              </span>
            ) : (
              <span>Have lyrics? Paste for better accuracy</span>
            )}
            {lyricsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="glass-card rounded-xl p-4 space-y-2 text-left mt-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Lyrics <span className="text-muted-foreground font-normal">(optional)</span></span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                    <Info size={13} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[240px]">
                  Paste your lyrics so the AI aligns rather than guesses — dramatically better accuracy
                </TooltipContent>
              </Tooltip>
            </div>
            <Textarea
              value={referenceLyrics}
              onChange={(e) => setReferenceLyrics(e.target.value)}
              placeholder={"Paste your song lyrics here...\n\nOne line per lyric line works best."}
              className="min-h-[140px] resize-y text-sm bg-muted/20 border-border font-mono"
              disabled={loading}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {sceneInput}

      <Button
        onClick={handleSubmit}
        className="w-full glow-primary"
        size="lg"
        disabled={loading || files.length === 0}
      >
        {loading ? (loadingMsg || "Syncing...") : (siteCopy.tools.lyric?.cta || "Sync Lyrics")}
      </Button>
    </div>
  );
}
