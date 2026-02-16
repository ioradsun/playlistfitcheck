import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

const GENRES = ["Hip-Hop", "Pop", "Indie", "R&B", "EDM", "Rock", "Other"];
const MOODS = ["Dark", "Emotional", "Euphoric", "Aggressive", "Romantic", "Dreamy", "Chill", "Energetic", "Sad", "Mysterious"];

export interface VibeFitInput {
  songTitle: string;
  genre: string;
  moods: string[];
  lyrics: string;
  composerNotes: string;
}

interface VibeFitFormProps {
  onSubmit: (data: VibeFitInput) => void;
  loading: boolean;
  disabled?: boolean;
  disabledMessage?: string;
}

export function VibeFitForm({ onSubmit, loading, disabled, disabledMessage }: VibeFitFormProps) {
  const [songTitle, setSongTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [moods, setMoods] = useState<string[]>([]);
  const [lyrics, setLyrics] = useState("");
  const [composerNotes, setComposerNotes] = useState("");

  const toggleMood = (mood: string) => {
    setMoods((prev) =>
      prev.includes(mood) ? prev.filter((m) => m !== mood) : [...prev, mood]
    );
  };

  const canSubmit = songTitle.trim() && genre && moods.length > 0 && !loading && !disabled;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ songTitle, genre, moods, lyrics, composerNotes });
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-5">
      <div className="space-y-3">
        <Input
          placeholder="Song title"
          value={songTitle}
          onChange={(e) => setSongTitle(e.target.value)}
          maxLength={200}
        />
        <Select value={genre} onValueChange={setGenre}>
          <SelectTrigger>
            <SelectValue placeholder="Genre" />
          </SelectTrigger>
          <SelectContent>
            {GENRES.map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mood / Vibe</label>
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map((mood) => (
              <Badge
                key={mood}
                variant={moods.includes(mood) ? "default" : "secondary"}
                className="cursor-pointer select-none transition-colors"
                onClick={() => toggleMood(mood)}
              >
                {mood}
              </Badge>
            ))}
          </div>
        </div>

        <Textarea
          placeholder="Composer notes — any ideas or direction for the art & captions"
          value={composerNotes}
          onChange={(e) => setComposerNotes(e.target.value)}
          maxLength={500}
          className="min-h-[70px]"
        />

        <Textarea
          placeholder="Lyrics (optional — helps match vibe)"
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          maxLength={2000}
          className="min-h-[80px]"
        />
      </div>

      {disabled && disabledMessage && (
        <p className="text-xs text-score-ok text-center">{disabledMessage}</p>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={!canSubmit}
      >
        <span className="flex items-center gap-2">
          <Sparkles size={14} /> Fit My Vibe
        </span>
      </Button>
    </form>
  );
}
