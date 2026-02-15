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
  artistName: string;
  genre: string;
  moods: string[];
  lyrics: string;
  description: string;
}

interface VibeFitFormProps {
  onSubmit: (data: VibeFitInput) => void;
  loading: boolean;
  disabled?: boolean;
  disabledMessage?: string;
}

export function VibeFitForm({ onSubmit, loading, disabled, disabledMessage }: VibeFitFormProps) {
  const [songTitle, setSongTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [genre, setGenre] = useState("");
  const [moods, setMoods] = useState<string[]>([]);
  const [lyrics, setLyrics] = useState("");
  const [description, setDescription] = useState("");

  const toggleMood = (mood: string) => {
    setMoods((prev) =>
      prev.includes(mood) ? prev.filter((m) => m !== mood) : [...prev, mood]
    );
  };

  const canSubmit = songTitle.trim() && artistName.trim() && genre && moods.length > 0 && !loading && !disabled;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ songTitle, artistName, genre, moods, lyrics, description });
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">VibeFit</h1>
        <p className="text-sm text-muted-foreground">Art & captions that fit your song.</p>
      </div>

      <div className="space-y-3">
        <Input
          placeholder="Song title"
          value={songTitle}
          onChange={(e) => setSongTitle(e.target.value)}
          maxLength={200}
        />
        <Input
          placeholder="Artist name"
          value={artistName}
          onChange={(e) => setArtistName(e.target.value)}
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
          placeholder="Lyrics (optional — helps match vibe)"
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          maxLength={2000}
          className="min-h-[80px]"
        />
        <Textarea
          placeholder="Short description of the song (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          className="min-h-[60px]"
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
        {loading ? (
          <span className="flex items-center gap-2">
            <Sparkles size={14} className="animate-pulse" /> Generating Your Vibe…
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Sparkles size={14} /> Fit My Vibe
          </span>
        )}
      </Button>
    </form>
  );
}
