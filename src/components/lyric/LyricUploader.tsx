import { useState, useRef } from "react";

import { Upload, Music, Loader2, FileAudio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  onTranscribe: (file: File) => void;
  onLoadSaved?: (lyric: any) => void;
  loading: boolean;
}

export function LyricUploader({ onTranscribe, loading }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ACCEPTED_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/m4a", "audio/ogg", "audio/flac"];
  const MAX_SIZE = 75 * 1024 * 1024;

  const handleFile = (file: File) => {
    if (!ACCEPTED_TYPES.some(t => file.type === t || file.name.match(/\.(mp3|wav|m4a|ogg|flac)$/i))) {
      toast.error("Please upload an audio file (MP3, WAV, M4A, OGG, FLAC)");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("File too large. Maximum size is 75MB.");
      return;
    }
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = () => {
    if (!selectedFile) {
      toast.error("Please select an audio file first");
      return;
    }
    onTranscribe(selectedFile);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <div className="space-y-4">
        <div
          className={`glass-card rounded-xl p-8 transition-colors cursor-pointer ${
            dragOver ? "border-primary/60 bg-primary/5" : ""
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !loading && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".mp3,.wav,.m4a,.ogg,.flac,audio/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            disabled={loading}
          />

          <div className="flex flex-col items-center gap-4 text-center">
            {selectedFile ? (
              <>
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Music size={28} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium truncate max-w-xs">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <Upload size={28} className="text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Drop your song here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    MP3, WAV, M4A, OGG, FLAC · Max 75MB
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex justify-center">
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
            {loading ? "Transcribing..." : "Transcribe Lyrics"}
          </Button>
        </div>
      </div>
    </div>
  );
}