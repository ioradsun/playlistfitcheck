import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, Music, Loader2, FileAudio, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  onTranscribe: (file: File) => void;
  onLoadSaved?: (lyric: any) => void;
  loading: boolean;
}

const ACCEPTED_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/m4a", "audio/ogg", "audio/flac"];
const MAX_SIZE = 75 * 1024 * 1024;

interface TrackResult {
  id: string;
  name: string;
  artists: string;
  image: string | null;
  url: string;
  preview_url?: string | null;
}

function useSpotifyTrackSearch(query: string) {
  const [results, setResults] = useState<TrackResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!query || query.length < 2 || query.includes("spotify.com")) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("spotify-search", {
          body: { query, type: "track" },
        });
        if (!error && data?.results) setResults(data.results as TrackResult[]);
      } catch {} finally {
        setLoading(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const clear = useCallback(() => setResults([]), []);
  return { results, loading, clear };
}

export function LyricUploader({ onTranscribe, loading }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [spotifyQuery, setSpotifyQuery] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<TrackResult | null>(null);
  const [trackFetching, setTrackFetching] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { results: trackResults, loading: searching, clear: clearResults } =
    useSpotifyTrackSearch(spotifyQuery);

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
    // Clear Spotify selection when file is picked
    setSelectedTrack(null);
    setSpotifyQuery("");
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const fetchTrackMeta = useCallback(async (pastedUrl: string) => {
    const match = pastedUrl.match(/track\/([a-zA-Z0-9]+)/);
    if (!match) return;
    setTrackFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke("spotify-search", {
        body: { query: match[1], type: "track" },
      });
      if (!error && data?.results?.length > 0) {
        setSelectedTrack(data.results[0]);
        setSelectedFile(null);
      }
    } catch {} finally {
      setTrackFetching(false);
    }
  }, []);

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text");
    if (pasted.includes("spotify.com/track/")) {
      e.preventDefault();
      setSpotifyQuery(pasted.trim());
      clearResults();
      setFocused(false);
      fetchTrackMeta(pasted.trim());
    }
  };

  const selectTrack = (t: TrackResult) => {
    setSelectedTrack(t);
    setSpotifyQuery("");
    setSelectedFile(null);
    clearResults();
    setFocused(false);
  };

  const clearTrack = () => {
    setSelectedTrack(null);
    setSpotifyQuery("");
  };

  const removeFile = () => {
    setSelectedFile(null);
  };

  const handleSubmit = async () => {
    if (selectedFile) {
      onTranscribe(selectedFile);
      return;
    }

    if (selectedTrack) {
      // Fetch preview audio from Spotify
      if (!selectedTrack.preview_url) {
        toast.error("No preview available for this track. Try uploading the audio file instead.");
        return;
      }
      try {
        const res = await fetch(selectedTrack.preview_url);
        const blob = await res.blob();
        const file = new File([blob], `${selectedTrack.name}.mp3`, { type: "audio/mpeg" });
        onTranscribe(file);
      } catch {
        toast.error("Failed to fetch track preview. Try uploading the audio file instead.");
      }
      return;
    }

    toast.error("Upload a song or select a Spotify track.");
  };

  const hasInput = !!selectedFile || !!selectedTrack;
  const showDropdown = focused && trackResults.length > 0 && !selectedTrack;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 text-center">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Transcribe Lyrics</h2>
        <p className="text-sm text-muted-foreground">
          Upload a song or link a Spotify track to get synced lyrics.
        </p>
      </div>

      <div className="glass-card rounded-xl p-4 space-y-3 text-left relative z-50" style={{ overflow: 'visible' }}>
        {/* Spotify track search */}
        {selectedTrack ? (
          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-muted/60 border border-border/50">
            {selectedTrack.image ? (
              <img src={selectedTrack.image} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded bg-muted flex items-center justify-center shrink-0">
                <Music size={14} className="text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{selectedTrack.name}</p>
              <p className="text-xs text-muted-foreground truncate">{selectedTrack.artists}</p>
            </div>
            <button
              type="button"
              onClick={clearTrack}
              className="p-1 rounded-full hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-colors"
              disabled={loading}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" size={18} />
            <Input
              ref={inputRef}
              value={spotifyQuery}
              onChange={(e) => { setSpotifyQuery(e.target.value); setSelectedTrack(null); }}
              placeholder="Search or paste Spotify track URL..."
              className="pl-10 h-11 bg-transparent border-0 focus-visible:ring-0 text-foreground placeholder:text-muted-foreground"
              onPaste={handlePaste}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 200)}
              disabled={loading}
            />
            {(searching || trackFetching) && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" size={16} />
            )}
            {showDropdown && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-xl z-[100] overflow-hidden max-h-80 overflow-y-auto">
                {trackResults.map((t) => (
                  <button
                    key={t.id}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent/50 transition-colors text-left"
                    onMouseDown={() => selectTrack(t)}
                  >
                    {t.image ? (
                      <img src={t.image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <Music size={12} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{t.artists}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 border-t border-border" />
        </div>

        {/* File upload */}
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept=".mp3,.wav,.m4a,.ogg,.flac,audio/*"
            className="hidden"
            onChange={handleFileInput}
            disabled={loading}
          />

          {selectedFile ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Music size={14} className="shrink-0 text-primary" />
              <span className="truncate flex-1">{selectedFile.name}</span>
              <span className="text-xs shrink-0">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</span>
              <button
                type="button"
                onClick={removeFile}
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
      </div>

      <Button
        onClick={handleSubmit}
        className="w-full glow-primary"
        size="lg"
        disabled={loading || !hasInput}
      >
        {loading ? (
          <Loader2 size={16} className="mr-1 animate-spin" />
        ) : (
          <FileAudio size={16} className="mr-1" />
        )}
        {loading ? "Transcribing..." : "Transcribe Lyrics"}
      </Button>
    </div>
  );
}
