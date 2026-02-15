import { useState } from "react";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { Loader2, FileAudio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AudioUploadZone } from "@/components/ui/AudioUploadZone";
import { toast } from "sonner";

interface Props {
  onTranscribe: (file: File) => void;
  onLoadSaved?: (lyric: any) => void;
  loading: boolean;
}

export function LyricUploader({ onTranscribe, loading }: Props) {
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

      <div className="glass-card rounded-xl p-4 space-y-2">
        <AudioUploadZone
          label="Upload Song"
          files={files}
          onChange={setFiles}
          maxFiles={1}
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground text-center">MP3, WAV, M4A · 75 MB max · Not saved or stored</p>
      </div>

      <Button
        onClick={handleSubmit}
        className="w-full glow-primary"
        size="lg"
        disabled={loading || files.length === 0}
      >
        {loading ? (
          <Loader2 size={16} className="mr-1 animate-spin" />
        ) : (
          <FileAudio size={16} className="mr-1" />
        )}
        {loading ? "Syncing..." : (siteCopy.tools.lyric?.cta || "Sync Lyrics")}
      </Button>
    </div>
  );
}
