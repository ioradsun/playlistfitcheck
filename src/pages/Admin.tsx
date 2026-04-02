import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LyricFitTab } from "@/components/lyric/LyricFitTab";
import ClaimBanner from "@/components/claim/ClaimBanner";
import { preloadEssentia } from "@/hooks/useBeatGrid";
import { Loader2, Users, Trash2, MousePointerClick, Music, Bomb, X, RefreshCw } from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
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
const CopyEditor = lazy(() => import("@/components/admin/CopyEditor").then((m) => ({ default: m.CopyEditor })));
const AiPromptsEditor = lazy(() => import("@/components/admin/AiPromptsEditor").then((m) => ({ default: m.AiPromptsEditor })));
const PendingVerifications = lazy(() => import("@/components/admin/PendingVerifications").then((m) => ({ default: m.PendingVerifications })));
const ToolsEditor = lazy(() => import("@/components/admin/ToolsEditor").then((m) => ({ default: m.ToolsEditor })));
const FmlyArtists = lazy(() => import("@/components/admin/FmlyArtists").then((m) => ({ default: m.FmlyArtists })));
const ReachDashboard = lazy(() =>
  import("@/components/admin/ReachDashboard").then((m) => ({
    default: m.ReachDashboard,
  }))
);

interface AdminUser {
  id: string; email: string; display_name: string | null; avatar_url: string | null;
  role: string; fit_checks: number; created_at: string; last_sign_in_at: string | null; provider: string;
  engagement: { total: number }; is_unlimited: boolean;
}

const ADMIN_EMAILS = ["sunpatel@gmail.com", "spatel@iorad.com"];

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("users");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [nukeOpen, setNukeOpen] = useState(false);
  const [nuking, setNuking] = useState(false);
  const [nukeConfirmText, setNukeConfirmText] = useState("");
  const [, forceAdminRerender] = useState(0);
  const isAdmin = ADMIN_EMAILS.includes(user?.email ?? "");

  useEffect(() => {
    (window as any).__forceAdminRerender = () => forceAdminRerender((v) => v + 1);
    return () => {
      delete (window as any).__forceAdminRerender;
    };
  }, [forceAdminRerender]);

  // ── Reach tab state ──
  const [reachRows, setReachRows] = useState<any[]>([]);
  const [reachActiveSlug, setReachActiveSlug] = useState<string | null>(null);
  const [reachQuery, setReachQuery] = useState("");
  const [reachResults, setReachResults] = useState<any[]>([]);
  const [reachSearching, setReachSearching] = useState(false);
  const [reachSelected, setReachSelected] = useState<any>(null);
  const [reachGenerating, setReachGenerating] = useState(false);
  const [reachStatusMsg, setReachStatusMsg] = useState("");
  const [reachFocused, setReachFocused] = useState(false);
  const reachDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [reachPipelineMeta, setReachPipelineMeta] = useState<{
    slug: string;
    artistName: string;
    trackTitle: string;
    albumArtUrl: string | null;
    profileId: string;
    trackId: string;
  } | null>(null);
  const [reachPipelineFile, setReachPipelineFile] = useState<File | null>(null);

  const fetchUsers = useCallback(async () => {
    const { data: result, error: fnError } = await supabase.functions.invoke("admin-dashboard", { body: { section: "users" } });
    if (fnError) throw fnError;
    if (result?.error) throw new Error(result.error);
    return result.users as AdminUser[];
  }, []);

  const fetchReachRows = useCallback(async () => {
    const [{ data: profiles }, { data: videos }] = await Promise.all([
      (supabase as any)
        .from("ghost_artist_profiles")
        .select("id, display_name, spotify_artist_slug, is_claimed, claimed_at, created_at")
        .order("created_at", { ascending: false }),
      (supabase as any)
        .from("artist_lyric_videos")
        .select("id, ghost_profile_id, track_title, artist_name, album_art_url, spotify_track_url, lyrics_source, preview_url, synced_lyrics_lrc, lyric_dance_url, lyric_dance_id, created_at")
        .order("created_at", { ascending: false }),
    ]);

    const videoByProfile = new Map<string, any>();
    (videos ?? []).forEach((v: any) => {
      if (!videoByProfile.has(v.ghost_profile_id))
        videoByProfile.set(v.ghost_profile_id, v);
    });

    if (profiles) {
      setReachRows(
        profiles.map((p: any) => {
          const vid = videoByProfile.get(p.id);
          return {
            spotify_artist_slug: p.spotify_artist_slug,
            artist_name: p.display_name ?? vid?.artist_name ?? "Unknown",
            track_title: vid?.track_title ?? "—",
            preview_url: vid?.preview_url ?? null,
            lyric_dance_url: vid?.lyric_dance_url ?? null,
            album_art_url: vid?.album_art_url ?? null,
            spotify_track_url: vid?.spotify_track_url ?? null,
            lyrics_source: vid?.lyrics_source ?? null,
            is_claimed: p.is_claimed,
            claimed_at: p.claimed_at ?? null,
            created_at: p.created_at,
          };
        })
      );
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isAdmin) { navigate("/"); return; }
    setLoading(true);
    fetchUsers()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [authLoading, user, isAdmin, fetchUsers, navigate]);

  // Fetch reach rows when tab switches
  useEffect(() => {
    if (tab === "reach" && isAdmin) {
      preloadEssentia();
      fetchReachRows().catch(console.error);
    }
  }, [tab, isAdmin, fetchReachRows]);

  // Reach search debounce
  useEffect(() => {
    if (!reachQuery.trim() || reachQuery.includes("spotify.com") || reachSelected) {
      setReachResults([]);
      return;
    }
    clearTimeout(reachDebounceRef.current);
    reachDebounceRef.current = setTimeout(async () => {
      setReachSearching(true);
      try {
        const { data, error } = await supabase.functions.invoke("spotify-search", {
          body: { query: reachQuery.trim(), type: "track" },
        });
        if (!error && data?.results) setReachResults(data.results.slice(0, 6));
      } catch {}
      setReachSearching(false);
    }, 350);
    return () => clearTimeout(reachDebounceRef.current);
  }, [reachQuery, reachSelected]);

  // Reach generate handler
  const handleReachGenerate = async () => {
    if (!reachSelected) return;
    setReachGenerating(true);
    setReachActiveSlug(null);
    setReachPipelineMeta(null);
    setReachPipelineFile(null);

    const STATUS = [
      "Fetching track from Spotify…",
      "Downloading preview audio…",
      "Preparing pipeline…",
    ];
    let msgIdx = 0;
    setReachStatusMsg(STATUS[0]);
    const interval = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, STATUS.length - 1);
      setReachStatusMsg(STATUS[msgIdx]);
    }, 1500);

    try {
      const { data: trackData } = await supabase.functions.invoke("songfit-track", {
        body: { trackUrl: reachSelected.url },
      });
      const spotifyUrl = trackData?.spotifyUrl ?? reachSelected.url;

      const { data, error } = await supabase.functions.invoke("create-artist-page", {
        body: { spotifyUrl },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (!data?.previewUrl) throw new Error("No preview audio available for this track");

      msgIdx = 1;
      setReachStatusMsg(STATUS[1]);

      // Fetch the preview MP3
      const mp3Res = await fetch(data.previewUrl);
      if (!mp3Res.ok) throw new Error(`Failed to fetch preview audio (${mp3Res.status})`);
      const blob = await mp3Res.blob();
      const file = new File([blob], `${data.trackTitle}.mp3`, { type: "audio/mpeg" });

      clearInterval(interval);

      const slug = data.slug;
      setReachActiveSlug(slug);
      setReachPipelineMeta({
        slug,
        artistName: data.artistName,
        trackTitle: data.trackTitle,
        albumArtUrl: data.albumArtUrl,
        profileId: data.profileId,
        trackId: data.trackId,
      });
      setReachPipelineFile(file);
      setReachSelected(null);
      setReachQuery("");
      setReachGenerating(false);
      setReachStatusMsg("");
    } catch (e: any) {
      clearInterval(interval);
      toast.error(e.message || "Generation failed");
      setReachGenerating(false);
      setReachStatusMsg("");
    }
  };

  const userRows = useMemo(() => {
    return users.map((u) => {
      const initials = (u.display_name ?? u.email ?? "?")
        .split(" ")
        .map((word) => word[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      const joined = new Date(u.created_at);
      const joinedLabel = isNaN(joined.getTime()) ? "—" : joined.toLocaleDateString();
      const lastSeen = u.last_sign_in_at ? new Date(u.last_sign_in_at) : null;
      const lastSeenLabel = lastSeen && !isNaN(lastSeen.getTime()) ? lastSeen.toLocaleDateString() : null;

      return { ...u, initials, joinedLabel, lastSeenLabel };
    });
  }, [users]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (tab === "users") { setUsers(await fetchUsers()); }
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

  const handleNukeAllData = async () => {
    setNuking(true);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke("admin-dashboard", {
        body: { action: "delete_all_data" },
      });
      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);
      toast.success(`All data deleted. ${result.deletedUsers} users removed.${result.errors?.length ? ` ${result.errors.length} warnings.` : ""}`);
      setUsers([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
    finally { setNuking(false); setNukeOpen(false); setNukeConfirmText(""); }
  };

  const refreshButton = (
    <button
      onClick={handleRefresh}
      disabled={refreshing}
      className="text-[13px] font-sans font-bold tracking-[0.15em] uppercase text-muted-foreground/30 hover:text-foreground transition-colors disabled:opacity-50"
    >
      {refreshing ? "Refreshing…" : "Refresh"}
    </button>
  );

  if (authLoading || loading) {
    return <PageLayout subtitle="Admin"><div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={24} /></div></PageLayout>;
  }
  if (error) {
    return <PageLayout subtitle="Admin"><div className="flex-1 flex items-center justify-center px-4"><p className="text-destructive text-sm">{error}</p></div></PageLayout>;
  }

  return (
    <PageLayout subtitle="Admin" headerRight={refreshButton}>
    <div className="px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap gap-x-4 gap-y-1 max-w-3xl mb-2">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="artists">Artists</TabsTrigger>
            <TabsTrigger value="reach">Reach</TabsTrigger>
            <TabsTrigger value="verify">Verify</TabsTrigger>
            <TabsTrigger value="tools">Tools</TabsTrigger>
            <TabsTrigger value="copy">Copy</TabsTrigger>
            <TabsTrigger value="prompts">AI</TabsTrigger>
          </TabsList>

          {/* ── USERS TAB ── */}
          <TabsContent value="users" className="mt-4">
            <div className="glass-card rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-primary" />
                  <span className="text-sm font-mono font-medium">All Users</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setNukeOpen(true)}
                    className="flex items-center gap-1.5 text-[11px] font-mono font-bold tracking-wider uppercase text-destructive/60 hover:text-destructive transition-colors"
                  >
                    <Bomb size={12} />
                    Delete All Data
                  </button>
                  <span className="text-xs font-mono text-muted-foreground">{users.length} total</span>
                </div>
              </div>

              {/* Table header */}
              <div className="hidden sm:grid grid-cols-[1fr_1fr_70px_60px_60px_70px_90px_36px] gap-2 px-4 py-2 border-b border-border text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                <span>User</span>
                <span>Email</span>
                <span>Role</span>
                <span>Tier</span>
                <span>Fits</span>
                <span>Clicks</span>
                <span>Joined</span>
                <span></span>
              </div>

              <div className="divide-y divide-border max-h-[65vh] overflow-y-auto">
                {userRows.map((u) => {
                  const initials = (u.display_name || "?").slice(0, 2).toUpperCase();
                  return (
                    <div key={u.id}>
                      <div className="px-4 py-3 flex flex-col sm:grid sm:grid-cols-[1fr_1fr_70px_60px_60px_70px_90px_36px] gap-2 sm:items-center transition-colors group hover:bg-muted/30">
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

                        {/* Tier (unlimited toggle) */}
                        {u.id !== "__anonymous__" ? (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              const prev = u.is_unlimited;
                              setUsers((p) => p.map((x) => x.id === u.id ? { ...x, is_unlimited: !prev } : x));
                              try {
                                const { data: result, error: fnErr } = await supabase.functions.invoke("admin-dashboard", {
                                  body: { action: "toggle_unlimited", user_id: u.id },
                                });
                                if (fnErr || result?.error) throw fnErr || new Error(result.error);
                                toast.success(result.is_unlimited ? "Set to unlimited" : "Set to limited");
                              } catch {
                                setUsers((p) => p.map((x) => x.id === u.id ? { ...x, is_unlimited: prev } : x));
                                toast.error("Failed to update tier");
                              }
                            }}
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded cursor-pointer transition-colors ${u.is_unlimited ? "bg-primary/20 text-primary font-semibold" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                            title={u.is_unlimited ? "Click to set limited" : "Click to set unlimited"}
                          >
                            {u.is_unlimited ? "∞" : "ltd"}
                          </button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}

                        {/* PlaylistFit checks */}
                        <span className="text-sm font-mono">{u.fit_checks}</span>

                        {/* Clicks */}
                        <div className="flex items-center gap-1">
                          {u.engagement.total > 0 ? (
                            <>
                              <MousePointerClick size={12} className="text-primary flex-shrink-0" />
                              <span className="text-sm font-mono font-medium text-primary">{u.engagement.total}</span>
                            </>
                          ) : (
                            <span className="text-sm font-mono text-muted-foreground/40">0</span>
                          )}
                        </div>

                        {/* Joined */}
                        <div className="text-xs text-muted-foreground font-mono">
                          <div>{u.joinedLabel}</div>
                          {u.lastSeenLabel && <div className="text-[10px] opacity-60" title="Last sign in">seen {u.lastSeenLabel}</div>}
                        </div>

                        {/* Delete */}
                        {u.id !== "__anonymous__" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(u); }}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete user"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* ── ARTISTS TAB ── */}
          <TabsContent value="artists" className="mt-4">
            {tab === "artists" && (
              <Suspense fallback={<div className="py-10 flex justify-center"><Loader2 className="animate-spin text-primary" size={20} /></div>}>
                <FmlyArtists />
              </Suspense>
            )}
          </TabsContent>

          {/* ── REACH TAB ── */}
          <TabsContent value="reach" className="mt-4">
            {tab === "reach" && (
              <>
                {/* ── Track search / generator ── */}
                <div className="glass-card rounded-xl p-4 mb-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <Music size={14} className="text-primary" />
                    <span className="text-sm font-mono font-medium">Generate Artist Page</span>
                  </div>

                  {/* Search input */}
                  <div className="relative">
                    {reachSelected ? (
                      <div className="flex items-center gap-3 bg-muted/40 border border-border/40 rounded-xl px-4 py-2.5">
                        {reachSelected.image ? (
                          <img src={reachSelected.image} className="h-8 w-8 rounded object-cover" alt="" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                            <Music size={14} className="text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{reachSelected.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{reachSelected.artists}</p>
                        </div>
                        <button
                          onClick={() => { setReachSelected(null); setReachQuery(""); }}
                          className="p-1 rounded-full hover:bg-accent/60 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          value={reachQuery}
                          onChange={(e) => setReachQuery(e.target.value)}
                          onFocus={() => setReachFocused(true)}
                          onBlur={() => setTimeout(() => setReachFocused(false), 200)}
                          onPaste={(e) => {
                            const text = e.clipboardData.getData("text");
                            if (text.includes("spotify.com/track/")) {
                              e.preventDefault();
                              setReachQuery(text);
                              supabase.functions.invoke("songfit-track", {
                                body: { trackUrl: text.trim() },
                              }).then(({ data }) => {
                                if (data) setReachSelected({
                                  name: data.title,
                                  artists: data.artists?.map((a: any) => a.name).join(", "),
                                  image: data.albumArt,
                                  url: data.spotifyUrl,
                                });
                              });
                            }
                          }}
                          placeholder="Search artist or song, or paste Spotify link"
                          className="w-full bg-muted/40 border border-border/40 rounded-xl px-4 py-2.5 text-sm placeholder:text-muted-foreground/40 outline-none focus:border-primary/40 transition-colors"
                          disabled={reachGenerating}
                        />
                        {reachSearching && (
                          <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                        {/* Dropdown results */}
                        {reachFocused && reachResults.length > 0 && (
                          <div className="absolute z-20 left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                            {reachResults.map((r: any, i: number) => (
                              <button
                                key={i}
                                onClick={() => { setReachSelected(r); setReachResults([]); setReachQuery(""); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left"
                              >
                                {r.image ? (
                                  <img src={r.image} className="h-8 w-8 rounded object-cover" alt="" />
                                ) : (
                                  <div className="h-8 w-8 rounded bg-muted" />
                                )}
                                <div className="min-w-0">
                                  <p className="text-sm truncate">{r.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">{r.artists}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Generate button + status */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleReachGenerate}
                      disabled={!reachSelected || reachGenerating}
                      className="rounded-xl px-5 py-2.5 text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-40 transition-colors"
                    >
                      {reachGenerating ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {reachStatusMsg}
                        </span>
                      ) : (
                        "Generate page →"
                      )}
                    </button>
                    {reachActiveSlug && reachGenerating && (
                      <span className="text-xs text-muted-foreground font-mono">{reachActiveSlug}</span>
                    )}
                  </div>
                </div>

                {/* ── Active Pipeline (LyricFitTab) ── */}
                {reachPipelineMeta && reachPipelineFile && (
                  <div className="glass-card rounded-xl overflow-hidden mb-6">
                    <ClaimBanner
                      artistSlug={reachPipelineMeta.slug}
                      accent="#a855f7"
                      coverArtUrl={reachPipelineMeta.albumArtUrl}
                      songName={reachPipelineMeta.trackTitle}
                      artistName={reachPipelineMeta.artistName}
                    />
                    <div className="h-[600px] overflow-auto">
                      <LyricFitTab
                        claimMeta={{
                          artistSlug: reachPipelineMeta.slug,
                          songSlug: reachPipelineMeta.trackTitle
                            .toLowerCase()
                            .replace(/\s+/g, "-")
                            .replace(/[^a-z0-9-]/g, "")
                            .slice(0, 50),
                          artistName: reachPipelineMeta.artistName,
                          songName: reachPipelineMeta.trackTitle,
                          albumArtUrl: reachPipelineMeta.albumArtUrl,
                          ghostProfileId: reachPipelineMeta.profileId,
                          spotifyTrackId: reachPipelineMeta.trackId,
                        }}
                        autoSubmitFile={reachPipelineFile}
                        onClaimPublished={(danceUrl) => {
                          toast.success(`Lyric Dance ready → ${danceUrl}`);
                          setReachPipelineMeta(null);
                          setReachPipelineFile(null);
                          setReachActiveSlug(null);
                          fetchReachRows().catch(console.error);
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* ── ReachDashboard table ── */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                    Generated Pages
                  </span>
                  <button
                    onClick={() => fetchReachRows().catch(console.error)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground 
                      hover:text-foreground transition-colors"
                  >
                    <RefreshCw size={12} />
                    Refresh
                  </button>
                </div>
                <Suspense fallback={<div className="py-10 flex justify-center"><Loader2 className="animate-spin text-primary" size={20} /></div>}>
                  <ReachDashboard rows={reachRows} activeJobSlug={reachActiveSlug} onRefresh={fetchReachRows} />
                </Suspense>
              </>
            )}
          </TabsContent>

          {/* ── VERIFY TAB ── */}
          <TabsContent value="verify" className="mt-4">
            {tab === "verify" && (
              <Suspense fallback={<div className="py-10 flex justify-center"><Loader2 className="animate-spin text-primary" size={20} /></div>}>
                <PendingVerifications />
              </Suspense>
            )}
          </TabsContent>

          {/* ── TOOLS TAB ── */}
          <TabsContent value="tools" className="mt-4">
            {tab === "tools" && (
              <Suspense fallback={<div className="py-10 flex justify-center"><Loader2 className="animate-spin text-primary" size={20} /></div>}>
                <ToolsEditor />
              </Suspense>
            )}
          </TabsContent>

          {/* ── COPY TAB ── */}
          <TabsContent value="copy" className="mt-4 space-y-6">
            {tab === "copy" && (
              <Suspense fallback={<div className="py-10 flex justify-center"><Loader2 className="animate-spin text-primary" size={20} /></div>}>
                <CopyEditor />
              </Suspense>
            )}
          </TabsContent>

          {/* ── AI PROMPTS TAB ── */}
          <TabsContent value="prompts" className="mt-4">
            {tab === "prompts" && (
              <Suspense fallback={<div className="py-10 flex justify-center"><Loader2 className="animate-spin text-primary" size={20} /></div>}>
                <AiPromptsEditor />
              </Suspense>
            )}
          </TabsContent>

        </Tabs>
      </div>

      {/* Delete user confirmation */}
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
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Nuke all data confirmation */}
      <AlertDialog open={nukeOpen} onOpenChange={(open) => { if (!open) { setNukeOpen(false); setNukeConfirmText(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <Bomb size={18} /> Delete ALL data?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">This will permanently delete <strong>all rows from every table</strong> and <strong>all users except you</strong>. This cannot be undone.</span>
              <span className="block text-destructive font-medium">Type "DELETE" to confirm:</span>
              <input
                type="text"
                value={nukeConfirmText}
                onChange={(e) => setNukeConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full bg-background border border-destructive/30 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-destructive"
                autoFocus
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={nuking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleNukeAllData}
              disabled={nuking || nukeConfirmText !== "DELETE"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
            >
              {nuking ? "Deleting everything…" : "Delete All Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </PageLayout>
  );
}
