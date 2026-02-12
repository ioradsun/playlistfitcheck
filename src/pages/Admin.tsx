import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, BarChart3, Play, ExternalLink, Search, Music, ChevronDown, RefreshCw } from "lucide-react";
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
}

interface ClickedTrack {
  track_name: string;
  artist_name: string;
  action: string;
}

interface CheckFit {
  playlist_name: string | null;
  playlist_url: string | null;
  song_name: string | null;
  song_url: string | null;
  session_id: string | null;
  created_at: string;
  tracksClicked: ClickedTrack[];
}

interface DashboardData {
  trackStats: TrackStat[];
  totalEngagements: number;
  totalSearches: number;
  checkFits: CheckFit[];
}

export default function Admin() {
  const stored = sessionStorage.getItem("admin_pw") || "";
  const [password, setPassword] = useState(stored);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [expandedFit, setExpandedFit] = useState<number | null>(null);

  const fetchData = async (pw: string) => {
    const { data: result, error: fnError } = await supabase.functions.invoke("admin-dashboard", {
      body: { password: pw },
    });
    if (fnError) throw fnError;
    if (result?.error) throw new Error(result.error);
    return result as DashboardData;
  };

  const handleLogin = async () => {
    if (!password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchData(password.trim());
      sessionStorage.setItem("admin_pw", password.trim());
      setData(result);
      setAuthenticated(true);
    } catch (e) {
      sessionStorage.removeItem("admin_pw");
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const pw = sessionStorage.getItem("admin_pw") || "";
      const result = await fetchData(pw);
      setData(result);
    } catch (e) {
      console.error("Refresh failed", e);
    } finally {
      setRefreshing(false);
    }
  };

  // Auto-login on mount if password is stored
  useState(() => {
    if (stored) {
      setLoading(true);
      fetchData(stored)
        .then((result) => { setData(result); setAuthenticated(true); })
        .catch(() => sessionStorage.removeItem("admin_pw"))
        .finally(() => setLoading(false));
    }
  });

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
          <div className="ml-auto flex items-center gap-3 text-xs font-mono text-muted-foreground">
            <span>{data?.totalEngagements ?? 0} clicks</span>
            <span>·</span>
            <span>{data?.totalSearches ?? 0} fits checked</span>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="ml-2 p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            </button>
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
                <div key={track.trackId} className="px-4 py-3 flex items-center gap-3">
                  <span className="text-xs text-muted-foreground font-mono w-6 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{track.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="flex items-center gap-1 text-xs font-mono" title="In-page plays">
                      <Play size={12} className="text-primary" />
                      <span>{track.plays}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs font-mono" title="Opened in Spotify">
                      <ExternalLink size={12} className="text-primary" />
                      <span>{track.spotifyClicks}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No track engagement data yet.
            </div>
          )}
        </motion.div>

        {/* Check Fits */}
        <motion.div
          className="glass-card rounded-xl overflow-hidden"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Search size={14} className="text-primary" />
            <span className="text-sm font-mono font-medium">Check Fits</span>
          </div>

          {data?.checkFits && data.checkFits.length > 0 ? (
            <div className="divide-y divide-border">
              {data.checkFits.map((fit, i) => {
                const isExpanded = expandedFit === i;
                const hasClicks = fit.tracksClicked.length > 0;

                return (
                  <div key={i}>
                    <button
                      className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors ${
                        hasClicks ? "hover:bg-muted/50 cursor-pointer" : "cursor-default"
                      } ${isExpanded ? "bg-muted/30" : ""}`}
                      onClick={() => hasClicks && setExpandedFit(isExpanded ? null : i)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">
                          {fit.playlist_name || fit.playlist_url || "—"}
                        </p>
                        {fit.song_name && (
                          <p className="text-xs text-muted-foreground truncate">× {fit.song_name}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                        {new Date(fit.created_at).toLocaleDateString()}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={`text-xs font-mono ${hasClicks ? "text-primary" : "text-muted-foreground/50"}`}>
                          {fit.tracksClicked.length} click{fit.tracksClicked.length !== 1 ? "s" : ""}
                        </span>
                        {hasClicks && (
                          <ChevronDown
                            size={14}
                            className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        )}
                      </div>
                    </button>

                    <AnimatePresence>
                      {isExpanded && hasClicks && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-3 pt-1 space-y-1 ml-4 border-l-2 border-primary/20">
                            {fit.tracksClicked.map((t, j) => (
                              <div key={j} className="flex items-center gap-2 text-xs text-muted-foreground">
                                {t.action === "play" ? (
                                  <Play size={10} className="text-primary flex-shrink-0" />
                                ) : (
                                  <ExternalLink size={10} className="text-primary flex-shrink-0" />
                                )}
                                <span className="truncate">
                                  {t.track_name} — {t.artist_name}
                                </span>
                                <span className="text-[10px] ml-auto flex-shrink-0 opacity-60">
                                  {t.action === "play" ? "played" : "opened"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No fit checks yet.
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
