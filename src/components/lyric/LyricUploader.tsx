import { useState } from "react";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { Button } from "@/components/ui/button";
import { AudioSlot } from "@/components/ui/AudioSlot";
import { toast } from "sonner";

interface Props {
  onTranscribe: (file: File) => void;
  onLoadSaved?: (lyric: any) => void;
  loading: boolean;
  loadingMsg?: string;
}

export function LyricUploader({ onTranscribe, loading, loadingMsg }: Props) {
  const siteCopy = useSiteCopy();
  const [files, setFiles] = useState<File[]>([]);

  const handleSubmit = () => {
    if (!files[0]) {
      toast.error("Please select an audio file first");
      return;
    }
    onTranscribe(files[0]);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 text-center">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{siteCopy.tools.lyric?.heading || "Get Perfectly Timed Lyrics For Every Drop"}</h2>
        {siteCopy.tools.lyric?.subheading && <p className="text-sm text-muted-foreground">{siteCopy.tools.lyric.subheading}</p>}
      </div>

      <AudioSlot
        label="Song"
        hint="MP3, WAV, M4A · 75 MB max · Large files auto-compressed"
        files={files}
        onChange={setFiles}
        maxFiles={1}
        disabled={loading}
        active={files.length > 0}
      />

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
