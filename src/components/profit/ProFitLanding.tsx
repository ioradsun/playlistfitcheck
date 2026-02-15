import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, TrendingUp, DollarSign, BarChart3, Music, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

interface SpotifyArtistResult {
  id: string;
  name: string;
  image: string | null;
  url: string;
  genres?: string[];
}

interface ProFitLandingProps {
  onAnalyze: (url: string) => void;
  onLoadReport?: (report: any) => void;
  loading: boolean;
}

const EXAMPLE_URL = "https://open.spotify.com/artist/6qqNVTkY8uBg9cP3Jd7DAH";

export const ProFitLanding = ({ onAnalyze, loading }: ProFitLandingProps) => {
  const [artistQuery, setArtistQuery] = useState("");
  const [artistResults, setArtistResults] = useState<SpotifyArtistResult[]>([]);
  const [artistSearching, setArtistSearching] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<SpotifyArtistResult | null>(null);
  const [artistFocused, setArtistFocused] = useState(false);
  const artistDebounce = useRef<ReturnType<typeof setTimeout>>();

  // Spotify artist search
  useEffect(() => {
    if (selectedArtist) return;
    if (!artistQuery.trim() || artistQuery.includes("spotify.com")) {
      setArtistResults([]);
      return;
    }
    clearTimeout(artistDebounce.current);
    artistDebounce.current = setTimeout(async () => {
      setArtistSearching(true);
      try {
        const { data, error } = await supabase.functions.invoke("spotify-search", {
          body: { query: artistQuery.trim(), type: "artist" },
        });
        if (!error && data?.results) {
          setArtistResults(data.results.slice(0, 5));
        }
      } catch {}
      setArtistSearching(false);
    }, 350);
    return () => clearTimeout(artistDebounce.current);
  }, [artistQuery, selectedArtist]);

  const handlePasteArtistUrl = useCallback(async (pastedUrl?: string) => {
    const urlToCheck = pastedUrl || artistQuery;
    if (!urlToCheck.includes("spotify.com/artist/")) return;
    const match = urlToCheck.match(/artist\/([a-zA-Z0-9]+)/);
    if (!match) return;
    setArtistSearching(true);
    setArtistQuery("");
    try {
      const { data, error } = await supabase.functions.invoke("spotify-search", {
        body: { query: match[1], type: "artist" },
      });
      if (!error && data?.results?.length > 0) {
        const a = data.results[0];
        setSelectedArtist({ id: a.id, name: a.name, image: a.image, url: a.url, genres: a.genres });
      } else {
        setSelectedArtist({ id: match[1], name: match[1], image: null, url: urlToCheck.trim() });
      }
    } catch {
      setSelectedArtist({ id: match[1], name: match[1], image: null, url: urlToCheck.trim() });
    } finally {
      setArtistSearching(false);
    }
  }, [artistQuery]);

  const handleAnalyze = useCallback(() => {
    if (selectedArtist) {
      onAnalyze(selectedArtist.url || `https://open.spotify.com/artist/${selectedArtist.id}`);
    }
  }, [selectedArtist, onAnalyze]);

  // Auto-analyze when artist is selected
  useEffect(() => {
    if (selectedArtist && !loading) {
      handleAnalyze();
    }
  }, [selectedArtist]);

  const showArtistDropdown = artistFocused && artistResults.length > 0 && !selectedArtist;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center w-full">
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="w-16 h-16 rounded-full border-2 border-primary/30 flex items-center justify-center">
            <Loader2 size={28} className="text-primary animate-spin" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium">Analyzing {selectedArtist?.name || "artist"}...</p>
            <p className="text-xs text-muted-foreground">Fetching Spotify signals & generating your blueprint</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center gap-6">

      {/* Artist Search */}
      <div className="w-full max-w-2xl space-y-3">
        <div className="relative">
          <div className="glass-card rounded-xl p-4">
            <div className="flex gap-2">
              <Input
                placeholder="Search artist or paste Spotify link…"
                value={artistQuery}
                onChange={e => { setArtistQuery(e.target.value); setSelectedArtist(null); }}
                onKeyDown={e => {
                  if (e.key === "Enter" && artistQuery.includes("spotify.com/artist/")) {
                    e.preventDefault();
                    handlePasteArtistUrl();
                  }
                }}
                onPaste={e => {
                  const pasted = e.clipboardData.getData("text");
                  if (pasted.includes("spotify.com/artist/")) {
                    e.preventDefault();
                    setArtistQuery(pasted.trim());
                    handlePasteArtistUrl(pasted.trim());
                  }
                }}
                onFocus={() => setArtistFocused(true)}
                onBlur={() => setTimeout(() => setArtistFocused(false), 200)}
                className="flex-1 h-11 text-base bg-transparent border-0 focus-visible:ring-0"
              />
            </div>
          </div>
          {artistSearching && (
            <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
          {showArtistDropdown && (
            <div className="absolute left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto">
              {artistResults.map(a => (
                <button
                  key={a.id}
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40 transition-colors text-left"
                  onMouseDown={() => { setSelectedArtist(a); setArtistQuery(""); setArtistResults([]); }}
                >
                  {a.image ? (
                    <img src={a.image} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Music size={14} className="text-muted-foreground" />
                    </div>
                  )}
                  <span className="text-sm font-medium truncate">{a.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-center gap-4 text-xs">
          <button
            onClick={() => onAnalyze(EXAMPLE_URL)}
            className="text-primary hover:underline underline-offset-2"
          >
            See Demo Results
          </button>
        </div>
      </div>

      {/* Feature pills */}
      <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
        {[
          { icon: BarChart3, label: "Tier Classification" },
          { icon: TrendingUp, label: "Revenue Scorecard" },
          { icon: DollarSign, label: "90-Day Roadmap" },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/50 bg-card/50">
            <Icon size={12} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
};