import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface MixProjectFormProps {
  onSubmit: (title: string, notes: string) => void;
}

export function MixProjectForm({ onSubmit }: MixProjectFormProps) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="w-full space-y-4 text-center">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">New Song Project</h2>
        <p className="text-sm text-muted-foreground">
          Create a project to compare mix versions side by side
        </p>
      </div>

      <div className="glass-card rounded-xl p-4 space-y-3 text-left">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Song Title *"
          className="h-11 bg-transparent border-0 focus-visible:ring-0"
        />
        <div className="border-t border-border" />
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Session notes (optional)"
          className="bg-transparent border-0 focus-visible:ring-0 min-h-[80px] resize-none"
        />
      </div>

      <Button
        onClick={() => onSubmit(title.trim(), notes.trim())}
        disabled={!title.trim()}
        className="w-full glow-primary"
        size="lg"
      >
        Create Project
      </Button>
    </div>
  );
}
