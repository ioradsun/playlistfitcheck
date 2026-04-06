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
  filmMode: "song" | "beat";
  onFilmModeChange: (m: "song" | "beat") => void;
}

export function LyricUploader({
  onTranscribe,
  loading,
  loadingMsg,
  sceneInput,
  filmMode,
  onFilmModeChange,
}: Props) {
  const siteCopy = useSiteCopy();
  const [files, setFiles] = useState<File[]>([]);
  const [referenceLyrics, setReferenceLyrics] = useState("");

  const handleSubmit = () => {
    if (!files[0]) {
      toast.error("Please select an audio file first");
      return;
    }
    onTranscribe(files[0], referenceLyrics.trim() || undefined);
  };

  const heading = filmMode === "beat"
    ? "Give your beat a world."
    : (siteCopy.tools.lyric?.heading || "Make your music visible.");

  const cta = loading
    ? (loadingMsg || "Building…")
    : filmMode === "beat"
      ? "Drop it"
      : (siteCopy.tools.lyric?.cta || "Make it Fire");

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 text-center">
      {/* Heading — changes by mode */}
      <h2 className="text-xl font-semibold">{heading}</h2>

      {/* Card with tabs flush to top */}
      <div className="glass-card rounded-xl overflow-hidden text-left">
        {/* Tab strip — top of card */}
        <div className="flex border-b border-border">
          {(["song", "beat"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onFilmModeChange(m)}
              className={[
                "flex-1 py-2.5 text-sm font-medium transition-colors duration-150",
                filmMode === m
                  ? "text-foreground border-b-2 border-primary -mb-px"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Card body */}
        <div className="p-4 space-y-4">
          {/* Upload zone */}
          <AudioUploadZone
            files={files}
            onChange={setFiles}
            maxFiles={1}
            disabled={loading}
            filmMode={filmMode}
          />

          {/* Lyrics textarea — song mode only */}
          {filmMode === "song" && (
            <div className="space-y-1.5">
              <Textarea
                value={referenceLyrics}
                onChange={(e) => setReferenceLyrics(e.target.value)}
                placeholder="Got lyrics? Paste them — your canvas will thank you."
                className="min-h-[80px] resize-y text-sm bg-background border border-border rounded-lg px-3 py-2.5 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                disabled={loading}
                aria-label="Paste your song lyrics"
              />
            </div>
          )}

          {/* Scene input */}
          {sceneInput}
        </div>
      </div>

      <Button
        onClick={handleSubmit}
        className="w-full glow-primary"
        size="lg"
        disabled={loading || files.length === 0}
      >
        {cta}
      </Button>
    </div>
  );
}
