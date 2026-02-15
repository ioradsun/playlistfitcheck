import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Upload, X, Music } from "lucide-react";
import { toast } from "sonner";

const MAX_FILE_SIZE = 75 * 1024 * 1024; // 75MB

interface MixProjectFormProps {
  onSubmit: (title: string, notes: string, files: File[]) => void;
}

const MAX_MIXES = 6;

export function MixProjectForm({ onSubmit }: MixProjectFormProps) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = e.target.files;
    if (!newFiles) return;
    const remaining = MAX_MIXES - files.length;
    const toAdd: File[] = [];
    for (const file of Array.from(newFiles).slice(0, remaining)) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} exceeds 75 MB limit.`);
      } else {
        toAdd.push(file);
      }
    }
    setFiles((prev) => [...prev, ...toAdd]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 text-center">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Compare Mix Versions And Choose The Best Fit</h2>
      </div>

      <div className="glass-card rounded-xl p-4 space-y-3 text-left">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Song Title"
          className="h-11 bg-transparent border-0 focus-visible:ring-0"
        />
        <div className="border-t border-border" />
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Session Notes (optional)"
          className="bg-transparent border-0 focus-visible:ring-0 min-h-[80px] resize-none"
        />
        <div className="border-t border-border" />

        {/* File upload area */}
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
            multiple
            className="hidden"
            onChange={handleFiles}
          />

          {files.length > 0 && (
            <div className="space-y-1.5">
              {files.map((file, i) => (
                <div key={`${file.name}-${i}`} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Music size={14} className="shrink-0 text-primary" />
                  <span className="truncate flex-1">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="shrink-0 p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {files.length < MAX_MIXES && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <Upload size={14} />
              {files.length === 0
                ? `Upload Mixes · MP3, WAV, M4A · 75 MB max`
                : `Add more (${files.length}/${MAX_MIXES})`}
            </button>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Your audio files aren't saved or stored.
          </p>
        </div>
      </div>

      <Button
        onClick={() => onSubmit(title.trim(), notes.trim(), files)}
        disabled={!title.trim() || files.length === 0}
        className="w-full glow-primary"
        size="lg"
      >
        Start Comparing
      </Button>
    </div>
  );
}
