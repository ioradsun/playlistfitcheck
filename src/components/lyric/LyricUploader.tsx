import { useState } from "react";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { Loader2, FileAudio, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AudioUploadZone } from "@/components/ui/AudioUploadZone";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
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
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium">Song</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                <Info size={13} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[220px]">MP3, WAV, M4A · 25 MB max · Not saved or stored</TooltipContent>
          </Tooltip>
        </div>
        <AudioUploadZone
          label="Upload"
          files={files}
          onChange={setFiles}
          maxFiles={1}
          disabled={loading}
        />
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
