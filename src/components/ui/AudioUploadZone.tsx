import { useRef } from "react";
import { Upload, Music, X } from "lucide-react";
import { toast } from "sonner";

const ACCEPTED_EXTENSIONS = /\.(mp3|wav|m4a|ogg|flac|aac|aiff|wma)$/i;
const MAX_SIZE = 25 * 1024 * 1024;

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
        toast.error(`${file.name} exceeds 25 MB limit.`);
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
      />

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`} className="flex items-center gap-2 text-sm text-muted-foreground">
              <Music size={14} className="shrink-0 text-primary" />
              <span className="truncate flex-1">{file.name}</span>
              {maxFiles > 1 && (
                <span className="text-xs shrink-0">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
              )}
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

      {files.length < maxFiles && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          disabled={disabled}
        >
          <Upload size={14} />
          {maxFiles > 1 && files.length > 0
            ? `Add more (${files.length}/${maxFiles})`
            : label}
        </button>
      )}
    </div>
  );
}