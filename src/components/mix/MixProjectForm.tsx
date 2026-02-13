import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Music } from "lucide-react";

interface MixProjectFormProps {
  onSubmit: (title: string, notes: string) => void;
}

export function MixProjectForm({ onSubmit }: MixProjectFormProps) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="w-full max-w-md mx-auto space-y-6 text-center">
      <div className="space-y-2">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Music size={24} className="text-primary" />
        </div>
        <h2 className="text-xl font-semibold">New Song Project</h2>
        <p className="text-sm text-muted-foreground">
          Create a project to compare mix versions side by side
        </p>
      </div>

      <div className="space-y-3 text-left">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Song Title *"
          className="bg-transparent"
        />
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Session notes (optional)"
          className="bg-transparent min-h-[80px] resize-none"
        />
      </div>

      <Button
        onClick={() => onSubmit(title.trim(), notes.trim())}
        disabled={!title.trim()}
        className="w-full"
      >
        Create Project
      </Button>
    </div>
  );
}
