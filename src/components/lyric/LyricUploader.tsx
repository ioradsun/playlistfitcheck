import { useState, useRef } from "react";
import { Upload, Music, Loader2, FileAudio, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  onTranscribe: (file: File) => void;
  onLoadSaved?: (lyric: any) => void;
  loading: boolean;
}

const ACCEPTED_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/m4a", "audio/ogg", "audio/flac"];
const MAX_SIZE = 75 * 1024 * 1024;

export function LyricUploader({ onTranscribe, loading }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!ACCEPTED_TYPES.some(t => file.type === t || file.name.match(/\.(mp3|wav|m4a|ogg|flac)$/i))) {
      toast.error("Please upload an audio file (MP3, WAV, M4A, OGG, FLAC)");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("File too large. Maximum size is 75 MB.");
      return;
    }
    setSelectedFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = () => {
    if (!selectedFile) {
      toast.error("Please select an audio file first");
      return;
    }
    onTranscribe(selectedFile);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 text-center">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Get Perfectly Timed Lyrics For Every Drop</h2>
      </div>

      <div className="glass-card rounded-xl p-4 space-y-3 text-left">
        <input
          ref={fileRef}
          type="file"
          accept=".mp3,.wav,.m4a,.ogg,.flac,audio/*"
          className="hidden"
          onChange={handleFileInput}
          disabled={loading}
        />

        {selectedFile ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
            <Music size={14} className="shrink-0 text-primary" />
            <span className="truncate flex-1">{selectedFile.name}</span>
            <span className="text-xs shrink-0">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</span>
            <button
              type="button"
              onClick={() => setSelectedFile(null)}
              className="shrink-0 p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            disabled={loading}
          >
            <Upload size={14} />
            Upload Song · MP3, WAV, M4A · 75 MB max
          </button>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Your audio files aren't saved or stored.
        </p>
      </div>

      <Button
        onClick={handleSubmit}
        className="w-full glow-primary"
        size="lg"
        disabled={loading || !selectedFile}
      >
        {loading ? (
          <Loader2 size={16} className="mr-1 animate-spin" />
        ) : (
          <FileAudio size={16} className="mr-1" />
        )}
        {loading ? "Syncing..." : "Sync Lyrics"}
      </Button>
    </div>
  );
}
