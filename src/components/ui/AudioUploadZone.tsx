import { useRef } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

const ACCEPTED_EXTENSIONS = /\.(mp3|wav|m4a|ogg|flac|aac|aiff|wma)$/i;
const MAX_SIZE = 75 * 1024 * 1024;

interface AudioUploadZoneProps {
  label: string;
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
  disabled?: boolean;
}

export function AudioUploadZone({
  label,
  files,
  onChange,
  maxFiles = 1,
  disabled = false,
}: AudioUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndAdd = (incoming: FileList | null) => {
    if (!incoming) return;
    const remaining = maxFiles - files.length;
    const toAdd: File[] = [];

    for (const file of Array.from(incoming).slice(0, remaining)) {
      if (!ACCEPTED_EXTENSIONS.test(file.name)) {
        toast.error(`${file.name}: unsupported format`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        toast.error(`${file.name} exceeds 75 MB limit.`);
        continue;
      }
      toAdd.push(file);
    }

    if (toAdd.length > 0) {
      onChange([...files, ...toAdd]);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) validateAndAdd(e.dataTransfer.files);
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.wav,.m4a,.ogg,.flac,.aac,.aiff,.wma,audio/*"
        multiple={maxFiles > 1}
        className="hidden"
        onChange={(e) => validateAndAdd(e.target.files)}
        disabled={disabled}
        aria-label="Upload audio file"
      />

      {files.length > 0 ? (
        <div className="flex flex-col items-center gap-1 py-4">
          <span className="text-sm font-medium text-foreground truncate max-w-[80%]">{files[0].name}</span>
          <button
            type="button"
            onClick={() => { removeFile(0); inputRef.current?.click(); }}
            className="text-xs text-primary hover:text-primary/80 transition-colors"
          >
            Change song
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="w-full flex flex-col items-center justify-center gap-1.5 py-8 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          disabled={disabled}
          aria-label="Upload your song"
        >
          <span className="text-base font-medium text-foreground">Upload your song</span>
          <span className="text-xs text-muted-foreground">MP3 or WAV</span>
        </button>
      )}
    </div>
  );
}
