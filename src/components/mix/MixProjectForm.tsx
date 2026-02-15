import { useState } from "react";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AudioUploadZone } from "@/components/ui/AudioUploadZone";

interface MixProjectFormProps {
  onSubmit: (title: string, notes: string, files: File[]) => void;
}

const MAX_MIXES = 6;

export function MixProjectForm({ onSubmit }: MixProjectFormProps) {
  const siteCopy = useSiteCopy();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 text-center">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{siteCopy.tools.mix?.heading || "Compare Mix Versions And Choose The Best Fit"}</h2>
        {siteCopy.tools.mix?.subheading && <p className="text-sm text-muted-foreground">{siteCopy.tools.mix.subheading}</p>}
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

        <AudioUploadZone
          label="Upload Up to 6 Mixes"
          files={files}
          onChange={setFiles}
          maxFiles={MAX_MIXES}
        />
      </div>

      <Button
        onClick={() => onSubmit(title.trim(), notes.trim(), files)}
        disabled={!title.trim() || files.length === 0}
        className="w-full glow-primary"
        size="lg"
      >
        {siteCopy.tools.mix?.cta || "Start Comparing"}
      </Button>
    </div>
  );
}
