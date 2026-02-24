import { useState } from "react";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { Button } from "@/components/ui/button";
import { AudioUploadZone } from "@/components/ui/AudioUploadZone";
import { Textarea } from "@/components/ui/textarea";
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

  const handleSubmit = () => {
    if (!files[0]) {
      toast.error("Please select an audio file first");
      return;
    }
    const lyrics = referenceLyrics.trim() || undefined;
    onTranscribe(files[0], lyrics);
  };

  const hasLyrics = referenceLyrics.length > 0;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 text-center">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{siteCopy.tools.lyric?.heading || "Get Perfectly Timed Lyrics For Every Drop"}</h2>
        {siteCopy.tools.lyric?.subheading && <p className="text-sm text-muted-foreground">{siteCopy.tools.lyric.subheading}</p>}
      </div>

      <div className="glass-card rounded-xl p-4 space-y-4 text-left">
        {/* Upload — no label */}
        <AudioUploadZone
          label="Upload"
          files={files}
          onChange={setFiles}
          maxFiles={1}
          disabled={loading}
        />

        {/* Lyrics — no label, contextual helper */}
        <div>
          {hasLyrics && (
            <span className="text-xs text-muted-foreground mb-1 block">Lyrics (optional)</span>
          )}
          <Textarea
            value={referenceLyrics}
            onChange={(e) => setReferenceLyrics(e.target.value)}
            placeholder="Add lyrics (optional)"
            className="min-h-[80px] resize-y text-sm bg-muted/20 border-border font-mono"
            disabled={loading}
            aria-label="Paste your song lyrics"
          />
        </div>

        {/* Scene — no label */}
        {sceneInput}
      </div>

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
