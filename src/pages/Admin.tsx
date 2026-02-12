import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, BarChart3, Play, ExternalLink, Search, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

interface TrackStat {
  trackId: string;
  name: string;
  artist: string;
  plays: number;
  spotifyClicks: number;
  totalInteractions: number;
  correlatedSearches: { playlist_name: string | null; song_name: string | null }[] | null;
}

interface SearchLog {
  playlist_name: string | null;
  playlist_url: string | null;
  song_name: string | null;
  song_url: string | null;
  session_id: string | null;
  created_at: string;
}

interface DashboardData {
  trackStats: TrackStat[];
  totalEngagements: number;
  totalSearches: number;
  recentSearches: SearchLog[];
}

export default function Admin() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  const handleLogin = async () => {
    if (!password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke("admin-dashboard", {
        body: { password: password.trim() },
      });
      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);
      setData(result as DashboardData);
      setAuthenticated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <motion.div
          className="w-full max-w-sm glass-card rounded-xl p-6 space-y-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Lock size={16} />
            <span className="text-sm font-mono">Admin Access</span>
          </div>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button onClick={handleLogin} disabled={loading} className="w-full">
            {loading ? "Verifying..." : "Enter"}
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <BarChart3 size={20} className="text-primary" />
          <h1 className="text-xl font-bold">Admin Dashboard</h1>
          <div className="ml-auto flex gap-3 text-xs font-mono text-muted-foreground">
            <span>{data?.totalEngagements ?? 0} clicks</span>
            <span>·</span>
            <span>{data?.totalSearches ?? 0} searches</span>
          </div>
        </div>

        {/* Tracklist Clicks */}
        <motion.div
          className="glass-card rounded-xl overflow-hidden"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Music size={14} className="text-primary" />
            <span className="text-sm font-mono font-medium">Tracklist Clicks</span>
          </div>

          {data?.trackStats && data.trackStats.length > 0 ? (
            <div className="divide-y divide-border">
              {data.trackStats.map((track, i) => (
                <div key={track.trackId} className="px-4 py-3 flex flex-col gap-1.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground font-mono w-6 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{track.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="flex items-center gap-1 text-xs font-mono">
                        <Play size={12} className="text-primary" />
                        <span>{track.plays}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs font-mono">
                        <ExternalLink size={12} className="text-primary" />
                        <span>{track.spotifyClicks}</span>
                      </div>
                    </div>
                  </div>

                  {/* Correlated searches */}
                  {track.correlatedSearches && track.correlatedSearches.length > 0 && (
                    <div className="ml-9 space-y-1">
                      {track.correlatedSearches.map((s, j) => (
                        <div key={j} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Search size={10} />
                          <span className="truncate">
                            {s.playlist_name || "—"}
                            {s.song_name ? ` × ${s.song_name}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No track engagement data yet.
            </div>
          )}
        </motion.div>

        {/* Recent Searches */}
        <motion.div
          className="glass-card rounded-xl overflow-hidden"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Search size={14} className="text-primary" />
            <span className="text-sm font-mono font-medium">Recent Searches</span>
          </div>

          {data?.recentSearches && data.recentSearches.length > 0 ? (
            <div className="divide-y divide-border">
              {data.recentSearches.map((s, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{s.playlist_name || s.playlist_url || "—"}</p>
                    {s.song_name && (
                      <p className="text-xs text-muted-foreground truncate">× {s.song_name}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No search data yet.
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
