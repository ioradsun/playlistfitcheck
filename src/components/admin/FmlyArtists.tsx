import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, Music, Users, Clock, Play, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface ArtistRow {
  id: string;
  spotify_artist_id: string;
  name: string;
  image_url: string | null;
  artist_url: string | null;
  popularity: number | null;
  followers_total: number | null;
  genres_json: any;
  top_tracks_json: any;
  last_synced_at: string | null;
  updated_at: string;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function FmlyArtists() {
  const [artists, setArtists] = useState<ArtistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [profileCount, setProfileCount] = useState<number | null>(null);

  const fetchArtists = useCallback(async () => {
    const { data, error } = await supabase
      .from("profit_artists")
      .select("id, spotify_artist_id, name, image_url, artist_url, popularity, followers_total, genres_json, top_tracks_json, last_synced_at, updated_at")
      .not("last_synced_at", "is", null)
      .order("followers_total", { ascending: false });

    if (error) throw error;
    setArtists((data || []) as ArtistRow[]);
  }, []);

  const fetchProfileCount = useCallback(async () => {
    const { count } = await supabase
      .from("profiles")
      .select("spotify_artist_id", { count: "exact", head: true })
      .not("spotify_artist_id", "is", null);
    setProfileCount(count ?? 0);
  }, []);

  useEffect(() => {
    Promise.all([fetchArtists(), fetchProfileCount()])
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fetchArtists, fetchProfileCount]);

  const handleSync = async () => {
    setSyncing(true);
    toast.info("Syncing artist data from Spotify…");
    try {
      let page = 0;
      let hasMore = true;
      let totalProcessed = 0;

      while (hasMore) {
        const { data, error } = await supabase.functions.invoke("populate-artists", {
          body: { page },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        totalProcessed += data.processed ?? 0;
        hasMore = data.has_more ?? false;
        page++;
        if (hasMore) {
          toast.info(`Page ${page} done (${totalProcessed} synced)…`);
        }
      }

      toast.success(`Synced ${totalProcessed} artists from Spotify`);
      await fetchArtists();
      await fetchProfileCount();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const lastSynced = artists.length > 0
    ? artists.reduce((latest, a) => {
        const t = a.last_synced_at ?? "";
        return t > latest ? t : latest;
      }, "")
    : null;

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={20} /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header stats + sync button */}
      <motion.div className="glass-card rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-primary" />
              <span className="text-sm font-mono">
                <span className="font-bold text-foreground">{profileCount ?? "—"}</span>
                <span className="text-muted-foreground ml-1">artists in platform</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Music size={14} className="text-primary" />
              <span className="text-sm font-mono">
                <span className="font-bold text-foreground">{artists.length}</span>
                <span className="text-muted-foreground ml-1">synced</span>
              </span>
            </div>
            {lastSynced && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                <Clock size={12} />
                <span>Last sync: {new Date(lastSynced).toLocaleString()}</span>
              </div>
            )}
          </div>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {syncing
              ? <><Loader2 size={12} className="animate-spin" /> Syncing…</>
              : <><RefreshCw size={12} /> Sync Spotify Now</>
            }
          </button>
        </div>

        {artists.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Music size={32} className="mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No artists synced yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Sync Spotify Now" to pull all artist data.</p>
          </div>
        ) : (
          <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
            {/* Column headers */}
            <div className="hidden sm:grid grid-cols-[2fr_1fr_80px_80px_1fr] gap-3 px-4 py-2 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              <span>Artist</span>
              <span>Genres</span>
              <span>Followers</span>
              <span>Popularity</span>
              <span>Top Tracks</span>
            </div>

            {artists.map((artist) => {
              const genres: string[] = Array.isArray(artist.genres_json) ? artist.genres_json : [];
              const topTracks: any[] = Array.isArray(artist.top_tracks_json) ? artist.top_tracks_json : [];
              const isExpanded = expanded === artist.id;

              return (
                <div key={artist.id}>
                  <div
                    className="px-4 py-3 grid sm:grid-cols-[2fr_1fr_80px_80px_1fr] gap-3 items-center hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => setExpanded(isExpanded ? null : artist.id)}
                  >
                    {/* Artist */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar className="h-9 w-9 flex-shrink-0">
                        <AvatarImage src={artist.image_url ?? undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                          {artist.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{artist.name}</p>
                        {artist.artist_url && (
                          <a
                            href={artist.artist_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5 transition-colors"
                          >
                            <ExternalLink size={9} /> Spotify
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Genres */}
                    <div className="flex flex-wrap gap-1">
                      {genres.slice(0, 2).map((g) => (
                        <Badge key={g} variant="outline" className="text-[9px] px-1 py-0 capitalize">{g}</Badge>
                      ))}
                      {genres.length > 2 && (
                        <span className="text-[9px] text-muted-foreground">+{genres.length - 2}</span>
                      )}
                    </div>

                    {/* Followers */}
                    <span className="text-sm font-mono">
                      {artist.followers_total ? fmt(artist.followers_total) : "—"}
                    </span>

                    {/* Popularity */}
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 flex-1 bg-muted rounded-full max-w-[40px]">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${artist.popularity ?? 0}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">{artist.popularity ?? 0}</span>
                    </div>

                    {/* Top tracks count */}
                    <span className="text-xs font-mono text-muted-foreground">
                      {topTracks.length > 0 ? `${topTracks.length} tracks` : "—"}
                    </span>
                  </div>

                  {/* Expanded top tracks */}
                  {isExpanded && topTracks.length > 0 && (
                    <div className="px-4 pb-3 bg-muted/10">
                      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Top Tracks (US)</p>
                      <div className="space-y-1.5">
                        {topTracks.map((track, i) => (
                          <div key={track.id} className="flex items-center gap-2.5">
                            <span className="text-[10px] font-mono text-muted-foreground/50 w-4 text-right">{i + 1}</span>
                            {track.album_art && (
                              <img src={track.album_art} alt="" className="h-7 w-7 rounded object-cover flex-shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{track.name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{track.album}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[10px] font-mono text-muted-foreground">{track.popularity}</span>
                              {track.spotify_url && (
                                <a
                                  href={track.spotify_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-primary transition-colors"
                                >
                                  <Play size={11} />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
