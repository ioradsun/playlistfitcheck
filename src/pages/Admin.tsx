import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, Play, ExternalLink, Search, Music, ChevronDown, RefreshCw, Loader2, Users, Database, Trash2, Headphones } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface TrackStat { trackId: string; name: string; artist: string; plays: number; spotifyClicks: number; totalInteractions: number; }
interface ClickedTrack { track_name: string; artist_name: string; action: string; }
interface CheckFit { playlist_name: string | null; playlist_url: string | null; song_name: string | null; song_url: string | null; count: number; last_checked: string; tracksClicked: ClickedTrack[]; }
interface DashboardData { trackStats: TrackStat[]; totalEngagements: number; totalSearches: number; checkFits: CheckFit[]; }

interface UserTrack { track_id: string; track_name: string; artist_name: string; plays: number; spotify_clicks: number; total: number; }
interface AdminUser {
  id: string; email: string; display_name: string | null; avatar_url: string | null;
  role: string; fit_checks: number; created_at: string; last_sign_in_at: string | null; provider: string;
  engagement: { total: number; tracks: UserTrack[] };
}

const ADMIN_EMAILS = ["sunpatel@gmail.com", "spatel@iorad.com"];

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("users");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFit, setExpandedFit] = useState<number | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = ADMIN_EMAILS.includes(user?.email ?? "");

  const fetchUsers = async () => {
    const { data: result, error: fnError } = await supabase.functions.invoke("admin-dashboard", { body: { section: "users" } });
    if (fnError) throw fnError;
    if (result?.error) throw new Error(result.error);
    return result.users as AdminUser[];
  };

  const fetchData = async () => {
    const { data: result, error: fnError } = await supabase.functions.invoke("admin-dashboard", { body: { section: "data" } });
    if (fnError) throw fnError;
    if (result?.error) throw new Error(result.error);
    return result as DashboardData;
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isAdmin) { navigate("/"); return; }
    setLoading(true);
    fetchUsers()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [authLoading, user, isAdmin]);

  useEffect(() => {
    if (tab === "data" && !dataLoaded && isAdmin) {
      setRefreshing(true);
      fetchData().then((d) => { setData(d); setDataLoaded(true); }).catch(console.error).finally(() => setRefreshing(false));
    }
  }, [tab, dataLoaded, isAdmin]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (tab === "users") { setUsers(await fetchUsers()); }
      else { setData(await fetchData()); }
    } catch (e) { console.error("Refresh failed", e); }
    finally { setRefreshing(false); }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke("admin-dashboard", {
        body: { action: "delete_user", user_id: deleteTarget.id },
      });
      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      toast.success(`Deleted ${deleteTarget.email}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
    finally { setDeleting(false); setDeleteTarget(null); }
  };

  if (authLoading || loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={24} /></div>;
  }
  if (error) {
    return <div className="min-h-screen bg-background flex items-center justify-center px-4"><p className="text-destructive text-sm">{error}</p></div>;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <BarChart3 size={20} className="text-primary" />
          <h1 className="text-xl font-bold">Admin Dashboard</h1>
          <button onClick={handleRefresh} disabled={refreshing} className="ml-auto p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-50" title="Refresh">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="users" className="gap-1.5"><Users size={14} /> Users</TabsTrigger>
            <TabsTrigger value="data" className="gap-1.5"><Database size={14} /> Data</TabsTrigger>
          </TabsList>

          {/* ── USERS TAB ── */}
          <TabsContent value="users" className="mt-4">
            <div className="glass-card rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-primary" />
                  <span className="text-sm font-mono font-medium">All Users</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{users.length} total</span>
              </div>

              {/* Table header */}
              <div className="hidden sm:grid grid-cols-[1fr_1fr_70px_60px_70px_90px_36px] gap-2 px-4 py-2 border-b border-border text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                <span>User</span>
                <span>Email</span>
                <span>Role</span>
                <span>Fits</span>
                <span>Listens</span>
                <span>Joined</span>
                <span></span>
              </div>

              <div className="divide-y divide-border max-h-[65vh] overflow-y-auto">
                {users.map((u) => {
                  const initials = (u.display_name ?? u.email ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                  const joined = new Date(u.created_at);
                  const lastSeen = u.last_sign_in_at ? new Date(u.last_sign_in_at) : null;
                  const isExpanded = expandedUser === u.id;
                  const hasEngagement = u.engagement.total > 0;

                  return (
                    <div key={u.id}>
                      <div
                        className={`px-4 py-3 flex flex-col sm:grid sm:grid-cols-[1fr_1fr_70px_60px_70px_90px_36px] gap-2 sm:items-center transition-colors group ${hasEngagement ? "cursor-pointer hover:bg-muted/30" : ""} ${isExpanded ? "bg-muted/20" : ""}`}
                        onClick={() => hasEngagement && setExpandedUser(isExpanded ? null : u.id)}
                      >
                        {/* User */}
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-7 w-7 flex-shrink-0">
                            <AvatarImage src={u.avatar_url ?? undefined} />
                            <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">{initials}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{u.display_name || "—"}</p>
                            {u.provider !== "email" && <span className="text-[10px] text-muted-foreground capitalize">{u.provider}</span>}
                          </div>
                        </div>

                        {/* Email */}
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>

                        {/* Role */}
                        <Badge variant={u.role === "artist" ? "default" : u.role === "curator" ? "secondary" : "outline"} className="text-[10px] w-fit capitalize">
                          {u.role}
                        </Badge>

                        {/* Fit checks */}
                        <span className="text-sm font-mono">{u.fit_checks}</span>

                        {/* Engagement / Listens */}
                        <div className="flex items-center gap-1">
                          {hasEngagement ? (
                            <>
                              <Headphones size={12} className="text-primary flex-shrink-0" />
                              <span className="text-sm font-mono font-medium text-primary">{u.engagement.total}</span>
                              <ChevronDown size={12} className={`text-muted-foreground transition-transform ml-0.5 ${isExpanded ? "rotate-180" : ""}`} />
                            </>
                          ) : (
                            <span className="text-sm font-mono text-muted-foreground/40">0</span>
                          )}
                        </div>

                        {/* Joined */}
                        <div className="text-xs text-muted-foreground font-mono">
                          <div>{joined.toLocaleDateString()}</div>
                          {lastSeen && <div className="text-[10px] opacity-60" title="Last sign in">seen {lastSeen.toLocaleDateString()}</div>}
                        </div>

                        {/* Delete */}
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(u); }}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete user"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Expanded: per-user track engagement */}
                      <AnimatePresence>
                        {isExpanded && hasEngagement && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-3 pt-1 ml-5 sm:ml-9 border-l-2 border-primary/20 space-y-1">
                              <div className="grid grid-cols-[1fr_50px_50px] gap-2 text-[10px] font-mono text-muted-foreground uppercase tracking-wider pb-1">
                                <span>Song</span>
                                <span className="text-center">Plays</span>
                                <span className="text-center">Opens</span>
                              </div>
                              {u.engagement.tracks.map((t) => (
                                <div key={t.track_id} className="grid grid-cols-[1fr_50px_50px] gap-2 items-center text-xs">
                                  <div className="min-w-0">
                                    <span className="truncate block">{t.track_name}</span>
                                    <span className="text-[10px] text-muted-foreground truncate block">{t.artist_name}</span>
                                  </div>
                                  <div className="flex items-center justify-center gap-1 font-mono">
                                    <Play size={10} className="text-primary" />
                                    <span>{t.plays}</span>
                                  </div>
                                  <div className="flex items-center justify-center gap-1 font-mono">
                                    <ExternalLink size={10} className="text-primary" />
                                    <span>{t.spotify_clicks}</span>
                                  </div>
                                </div>
                              ))}
                              {u.engagement.tracks.length > 1 && (
                                <div className="pt-1 border-t border-border/50 text-[10px] font-mono text-muted-foreground">
                                  {u.engagement.tracks.length} songs · {u.engagement.total} total interactions
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* ── DATA TAB ── */}
          <TabsContent value="data" className="mt-4 space-y-6">
            {refreshing && !data ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-primary" size={20} /></div>
            ) : (
              <>
                <div className="flex gap-3 text-xs font-mono text-muted-foreground">
                  <span>{data?.totalEngagements ?? 0} clicks</span>
                  <span>·</span>
                  <span>{data?.totalSearches ?? 0} fits checked</span>
                </div>

                {/* Tracklist Clicks */}
                <motion.div className="glass-card rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
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
                            <div className="flex items-center gap-1 text-xs font-mono" title="In-page plays"><Play size={12} className="text-primary" /><span>{track.plays}</span></div>
                            <div className="flex items-center gap-1 text-xs font-mono" title="Opened in Spotify"><ExternalLink size={12} className="text-primary" /><span>{track.spotifyClicks}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">No track engagement data yet.</div>
                  )}
                </motion.div>

                {/* Check Fits */}
                <motion.div className="glass-card rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
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
                              className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors ${hasClicks ? "hover:bg-muted/50 cursor-pointer" : "cursor-default"} ${isExpanded ? "bg-muted/30" : ""}`}
                              onClick={() => hasClicks && setExpandedFit(isExpanded ? null : i)}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm truncate">{fit.playlist_name || fit.playlist_url || "—"}</p>
                                {fit.song_name && <p className="text-xs text-muted-foreground truncate">× {fit.song_name}</p>}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {fit.count > 1 && <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">×{fit.count}</span>}
                                <span className="text-xs text-muted-foreground font-mono">
                                  {(() => { const d = new Date(fit.last_checked || (fit as any).created_at); return isNaN(d.getTime()) ? "—" : d.toLocaleDateString(); })()}
                                </span>
                                <span className={`text-xs font-mono ${hasClicks ? "text-primary" : "text-muted-foreground/50"}`}>
                                  {fit.tracksClicked.length} click{fit.tracksClicked.length !== 1 ? "s" : ""}
                                </span>
                                {hasClicks && <ChevronDown size={14} className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />}
                              </div>
                            </button>
                            <AnimatePresence>
                              {isExpanded && hasClicks && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                  <div className="px-4 pb-3 pt-1 space-y-1 ml-4 border-l-2 border-primary/20">
                                    {fit.tracksClicked.map((t, j) => (
                                      <div key={j} className="flex items-center gap-2 text-xs text-muted-foreground">
                                        {t.action === "play" ? <Play size={10} className="text-primary flex-shrink-0" /> : <ExternalLink size={10} className="text-primary flex-shrink-0" />}
                                        <span className="truncate">{t.track_name} — {t.artist_name}</span>
                                        <span className="text-[10px] ml-auto flex-shrink-0 opacity-60">{t.action === "play" ? "played" : "opened"}</span>
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
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">No fit checks yet.</div>
                  )}
                </motion.div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.email}</strong> and all their data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 size={14} className="animate-spin mr-1" /> : <Trash2 size={14} className="mr-1" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
