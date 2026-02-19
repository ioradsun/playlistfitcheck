import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, ExternalLink, Instagram, Youtube, Globe,
  Music2, Info, Wifi, ChevronLeft, Pencil, Check, X,
  Loader2, Plus, Trash2, ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { VerifiedBadge } from "@/components/VerifiedBadge";

// --------------- Types ---------------
interface ArtistProfile {
  id: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  spotify_artist_id: string | null;
  spotify_embed_url: string | null;
  is_verified: boolean;
  trailblazer_number: number | null;
}

interface ArtistPage {
  accent_color: string;
  theme: "cinematic" | "modern" | "editorial";
  featured_track_id: string | null;
  featured_track_title: string | null;
  featured_track_art: string | null;
  featured_track_url: string | null;
  hero_content_type: string | null;
  hero_content_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  website_url: string | null;
  merch_url: string | null;
  sonic_identity: string | null;
}

interface SpotifyTrack {
  id: string;
  name: string;
  album: { images: { url: string }[]; name: string };
  artists: { name: string }[];
  preview_url: string | null;
  external_urls: { spotify: string };
  popularity: number;
}

interface CrowdFitPost {
  id: string;
  track_title: string;
  album_art_url: string | null;
  likes_count: number;
  comments_count: number;
  status: string;
  peak_rank: number | null;
  spotify_track_id: string;
  spotify_track_url: string;
}

type Tab = "music" | "about" | "connect";

const ACCENT_COLORS = [
  "#a855f7", "#3b82f6", "#ec4899", "#10b981",
  "#f59e0b", "#ef4444", "#06b6d4", "#ffffff",
];

const THEMES = ["cinematic", "modern", "editorial"] as const;

// --------------- Helpers ---------------
function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function applyAccent(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  document.documentElement.style.setProperty("--artist-accent-r", String(r));
  document.documentElement.style.setProperty("--artist-accent-g", String(g));
  document.documentElement.style.setProperty("--artist-accent-b", String(b));
}

function getYouTubeEmbedId(url: string) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

// --------------- Main Component ---------------
export default function ArtistStage() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  const [page, setPage] = useState<ArtistPage | null>(null);
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [crowdFitPosts, setCrowdFitPosts] = useState<CrowdFitPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("music");

  // Mini player
  const [miniTrack, setMiniTrack] = useState<{ id: string; title: string; artist: string } | null>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<ArtistPage>>({});
  const [saving, setSaving] = useState(false);

  const isOwner = user?.id === profile?.id;

  // --------------- Data loading ---------------
  useEffect(() => {
    if (!username) return;
    setLoading(true);

    // Find user by display_name slug (username = display_name lowercased, no spaces)
    // We look up profiles where is_verified = true
    supabase
      .from("profiles")
      .select("id, display_name, bio, avatar_url, spotify_artist_id, spotify_embed_url, is_verified, trailblazer_number")
      .eq("is_verified", true)
      .then(async ({ data: profiles }) => {
        if (!profiles) { setNotFound(true); setLoading(false); return; }

        // Match by slug: lowercase, replace spaces with dashes
        const matched = profiles.find(p => {
          const slug = (p.display_name ?? "").toLowerCase().replace(/\s+/g, "-");
          return slug === username.toLowerCase();
        });

        if (!matched) { setNotFound(true); setLoading(false); return; }
        setProfile(matched as ArtistProfile);

        // Load artist page config
        const { data: pageData } = await supabase
          .from("artist_pages")
          .select("*")
          .eq("user_id", matched.id)
          .maybeSingle();

        const defaultPage: ArtistPage = {
          accent_color: "#a855f7",
          theme: "cinematic",
          featured_track_id: null,
          featured_track_title: null,
          featured_track_art: null,
          featured_track_url: null,
          hero_content_type: null,
          hero_content_url: null,
          instagram_url: null,
          tiktok_url: null,
          youtube_url: null,
          website_url: null,
          merch_url: null,
          sonic_identity: null,
        };

        const rawTheme = pageData?.theme ?? "cinematic";
        const validTheme: "cinematic" | "modern" | "editorial" =
          rawTheme === "modern" || rawTheme === "editorial" ? rawTheme : "cinematic";
        const loadedPage: ArtistPage = pageData
          ? { ...defaultPage, ...pageData, theme: validTheme }
          : defaultPage;
        setPage(loadedPage);
        setDraft(loadedPage);
        applyAccent(loadedPage.accent_color);

        // Load CrowdFit posts
        supabase
          .from("songfit_posts")
          .select("id, track_title, album_art_url, likes_count, comments_count, status, peak_rank, spotify_track_id, spotify_track_url")
          .eq("user_id", matched.id)
          .order("engagement_score", { ascending: false })
          .limit(10)
          .then(({ data: posts }) => {
            if (posts) setCrowdFitPosts(posts as CrowdFitPost[]);
          });

        setLoading(false);
      });
  }, [username]);

  // Apply accent whenever it changes
  useEffect(() => {
    if (page?.accent_color) applyAccent(page.accent_color);
  }, [page?.accent_color]);

  // --------------- Save handlers ---------------
  const handleSave = useCallback(async () => {
    if (!profile || !user) return;
    setSaving(true);
    const { error } = await supabase
      .from("artist_pages")
      .upsert({ user_id: profile.id, ...draft }, { onConflict: "user_id" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setPage(prev => ({ ...prev!, ...draft }));
    setEditing(false);
    toast.success("Stage updated ✦");
  }, [profile, user, draft]);

  const updateDraft = (key: keyof ArtistPage, value: string | null) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    if (key === "accent_color" && value) applyAccent(value);
  };

  // --------------- Mini player ---------------
  const playTrack = (track: SpotifyTrack | CrowdFitPost) => {
    const isCrowdFit = "spotify_track_id" in track;
    setMiniTrack({
      id: isCrowdFit ? (track as CrowdFitPost).spotify_track_id : (track as SpotifyTrack).id,
      title: isCrowdFit ? (track as CrowdFitPost).track_title : (track as SpotifyTrack).name,
      artist: isCrowdFit ? "" : (track as SpotifyTrack).artists.map(a => a.name).join(", "),
    });
  };

  const accent = page?.accent_color ?? "#a855f7";
  const { r, g, b } = hexToRgb(accent);
  const accentRgb = `${r}, ${g}, ${b}`;
  const heroImage = profile?.avatar_url;
  const featuredArt = page?.featured_track_art ?? crowdFitPosts[0]?.album_art_url ?? heroImage;

  const themeFont = page?.theme === "editorial" ? "font-serif" : page?.theme === "modern" ? "font-mono" : "font-sans";

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" size={28} />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground text-lg">Artist not found.</p>
        <Button variant="ghost" onClick={() => navigate(-1)}>Go back</Button>
      </div>
    );
  }

  const featuredTrackId = page?.featured_track_id ?? crowdFitPosts[0]?.spotify_track_id ?? null;
  const featuredTrackTitle = page?.featured_track_title ?? crowdFitPosts[0]?.track_title ?? "Play";
  const featuredTrackUrl = page?.featured_track_url ?? crowdFitPosts[0]?.spotify_track_url ?? null;

  const heroYtId = page?.hero_content_type === "youtube" && page.hero_content_url
    ? getYouTubeEmbedId(page.hero_content_url)
    : null;

  const hasSocial = !!(page?.instagram_url || page?.tiktok_url);
  const hasVideos = !!page?.youtube_url;
  const tabs: { key: Tab; label: string }[] = [
    { key: "music", label: "Music" },
    { key: "about", label: "About" },
    { key: "connect", label: "Connect" },
  ];

  return (
    <div
      className={`min-h-screen bg-[#0a0a0a] text-white ${themeFont} relative`}
      style={{ "--accent-r": r, "--accent-g": g, "--accent-b": b } as React.CSSProperties}
    >
      {/* Global accent CSS vars injected via style tag */}
      <style>{`
        :root {
          --artist-accent: rgb(${accentRgb});
          --artist-accent-20: rgba(${accentRgb}, 0.2);
          --artist-accent-40: rgba(${accentRgb}, 0.4);
        }
      `}</style>

      {/* ======== HERO ======== */}
      <div className="relative min-h-[60vh] flex flex-col justify-end overflow-hidden">
        {/* Full-bleed background */}
        {featuredArt && (
          <div className="absolute inset-0">
            <img
              src={featuredArt}
              alt=""
              className="w-full h-full object-cover object-center scale-110"
              style={{ filter: "blur(2px) brightness(0.35)" }}
            />
          </div>
        )}
        {/* Gradient tinted by accent */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom,
              rgba(${accentRgb}, 0.08) 0%,
              rgba(10,10,10,0.5) 40%,
              rgba(10,10,10,0.95) 100%)`
          }}
        />

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 z-20 p-2 rounded-full bg-black/40 backdrop-blur-sm text-white/70 hover:text-white transition-colors"
        >
          <ChevronLeft size={20} />
        </button>

        {/* Owner edit toggle */}
        {isOwner && (
          <button
            onClick={() => setEditing(!editing)}
            className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm text-white/70 hover:text-white text-xs font-medium transition-colors"
          >
            {editing ? <><X size={14} /> Cancel</> : <><Pencil size={14} /> Edit Stage</>}
          </button>
        )}

        {/* Hero content area */}
        <div className="relative z-10 px-5 pb-6 pt-16">
          {/* Two-column when hero content selected */}
          <div className={`flex ${heroYtId ? "gap-4 flex-col md:flex-row items-end" : "flex-col"}`}>
            <div className="flex-1 min-w-0">
              {/* Avatar + name */}
              <div className="flex items-end gap-3 mb-3">
                {profile.avatar_url && (
                  <img
                    src={profile.avatar_url}
                    alt={profile.display_name ?? ""}
                    className="w-14 h-14 rounded-full object-cover border-2 shrink-0"
                    style={{ borderColor: `rgba(${accentRgb}, 0.6)` }}
                  />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h1
                      className="text-3xl font-bold leading-none"
                      style={{ textShadow: `0 0 40px rgba(${accentRgb}, 0.4)` }}
                    >
                      {profile.display_name}
                    </h1>
                    {profile.is_verified && <VerifiedBadge size={18} />}
                  </div>
                  {page?.sonic_identity && (
                    <p className="text-sm text-white/50 mt-1 leading-snug italic max-w-xs">
                      {page.sonic_identity}
                    </p>
                  )}
                </div>
              </div>

              {/* Play featured track */}
              {featuredTrackId && (
                <button
                  onClick={() => setMiniTrack({
                    id: featuredTrackId,
                    title: featuredTrackTitle,
                    artist: profile.display_name ?? "",
                  })}
                  className="flex items-center gap-2.5 px-5 py-2.5 rounded-full font-semibold text-sm transition-all active:scale-95"
                  style={{
                    background: `rgba(${accentRgb}, 0.9)`,
                    boxShadow: `0 0 24px rgba(${accentRgb}, 0.35)`,
                    color: "#fff",
                  }}
                >
                  <Play size={16} fill="white" />
                  {featuredTrackTitle.length > 30 ? featuredTrackTitle.slice(0, 28) + "…" : featuredTrackTitle}
                </button>
              )}

              {/* Spotify link */}
              {profile.spotify_artist_id && (
                <a
                  href={`https://open.spotify.com/artist/${profile.spotify_artist_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 text-white/40 hover:text-white/70 text-xs transition-colors"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                  </svg>
                  Open in Spotify
                </a>
              )}
            </div>

            {/* Hero YouTube embed (right side on desktop) */}
            {heroYtId && (
              <div
                className="w-full md:w-80 rounded-xl overflow-hidden border shrink-0"
                style={{ borderColor: `rgba(${accentRgb}, 0.3)` }}
              >
                <div className="aspect-video">
                  <iframe
                    src={`https://www.youtube.com/embed/${heroYtId}?autoplay=0`}
                    className="w-full h-full border-0"
                    allow="encrypted-media; picture-in-picture"
                    title="Featured video"
                    loading="lazy"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ======== STICKY TABS ======== */}
      <div
        className="sticky top-0 z-30 border-b backdrop-blur-xl"
        style={{
          background: "rgba(10,10,10,0.85)",
          borderColor: `rgba(${accentRgb}, 0.15)`,
        }}
      >
        <div className="max-w-2xl mx-auto px-4 flex gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`py-3 px-4 text-sm font-medium relative transition-colors ${
                activeTab === t.key ? "text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              {t.label}
              {activeTab === t.key && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: `rgb(${accentRgb})` }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ======== TAB CONTENT ======== */}
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {/* --- MUSIC TAB --- */}
            {activeTab === "music" && (
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-widest text-white/30 font-semibold">
                  On CrowdFit
                </p>
                {crowdFitPosts.length === 0 ? (
                  <p className="text-white/30 text-sm text-center py-8">No songs on CrowdFit yet.</p>
                ) : (
                  crowdFitPosts.map((post, i) => {
                    const isFeatured = post.spotify_track_id === featuredTrackId;
                    const isPlaying = miniTrack?.id === post.spotify_track_id;
                    return (
                      <button
                        key={post.id}
                        onClick={() => playTrack(post)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left group"
                        style={{
                          background: isFeatured
                            ? `rgba(${accentRgb}, 0.12)`
                            : "rgba(255,255,255,0.04)",
                          border: `1px solid ${isFeatured ? `rgba(${accentRgb}, 0.3)` : "rgba(255,255,255,0.06)"}`,
                        }}
                      >
                        {/* Album art + play indicator */}
                        <div className="relative w-12 h-12 shrink-0">
                          {post.album_art_url ? (
                            <img src={post.album_art_url} alt="" className="w-full h-full rounded-lg object-cover" />
                          ) : (
                            <div className="w-full h-full rounded-lg bg-white/10 flex items-center justify-center">
                              <Music2 size={18} className="text-white/30" />
                            </div>
                          )}
                          <div className="absolute inset-0 rounded-lg flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                            {isPlaying
                              ? <Pause size={16} fill="white" className="text-white" />
                              : <Play size={16} fill="white" className="text-white" />
                            }
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-white">{post.track_title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {isFeatured && (
                              <span
                                className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                                style={{ background: `rgba(${accentRgb}, 0.25)`, color: `rgb(${accentRgb})` }}
                              >
                                Featured
                              </span>
                            )}
                            <span className="text-[10px] text-white/30 capitalize">{post.status}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          {post.peak_rank && (
                            <p className="text-xs font-mono font-bold" style={{ color: `rgb(${accentRgb})` }}>
                              #{post.peak_rank}
                            </p>
                          )}
                          <p className="text-[10px] text-white/30">♥ {post.likes_count}</p>
                        </div>
                      </button>
                    );
                  })
                )}

                {/* Spotify embed for featured track */}
                {featuredTrackId && miniTrack && (
                  <div className="mt-6 rounded-xl overflow-hidden" ref={iframeContainerRef}>
                    <iframe
                      key={miniTrack.id}
                      src={`https://open.spotify.com/embed/track/${miniTrack.id}?utm_source=generator&theme=1`}
                      width="100%"
                      height="152"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="eager"
                      className="border-0 block"
                      title={miniTrack.title}
                    />
                  </div>
                )}
              </div>
            )}

            {/* --- ABOUT TAB --- */}
            {activeTab === "about" && (
              <div className="space-y-6">
                {profile.bio && (
                  <div>
                    <p className="text-xs uppercase tracking-widest text-white/30 font-semibold mb-2">Bio</p>
                    <p className="text-sm text-white/70 leading-relaxed">{profile.bio}</p>
                  </div>
                )}
                {page?.sonic_identity && (
                  <div>
                    <p className="text-xs uppercase tracking-widest text-white/30 font-semibold mb-2">Sonic Identity</p>
                    <p
                      className="text-base italic leading-relaxed font-medium"
                      style={{ color: `rgb(${accentRgb})` }}
                    >
                      "{page.sonic_identity}"
                    </p>
                  </div>
                )}
                {profile.spotify_artist_id && (
                  <div>
                    <p className="text-xs uppercase tracking-widest text-white/30 font-semibold mb-3">Artist Profile</p>
                    <a
                      href={`https://open.spotify.com/artist/${profile.spotify_artist_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white/70 hover:text-white border border-white/10 hover:border-white/20 transition-all"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                      </svg>
                      View on Spotify
                      <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* --- CONNECT TAB --- */}
            {activeTab === "connect" && (
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-widest text-white/30 font-semibold mb-4">Find me everywhere</p>
                <div className="flex flex-wrap gap-3">
                  {profile.spotify_artist_id && (
                    <SocialLink
                      href={`https://open.spotify.com/artist/${profile.spotify_artist_id}`}
                      label="Spotify"
                      accentRgb={accentRgb}
                      icon={
                        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                        </svg>
                      }
                    />
                  )}
                  {page?.instagram_url && (
                    <SocialLink href={page.instagram_url} label="Instagram" accentRgb={accentRgb} icon={<Instagram size={20} />} />
                  )}
                  {page?.youtube_url && (
                    <SocialLink href={page.youtube_url} label="YouTube" accentRgb={accentRgb} icon={<Youtube size={20} />} />
                  )}
                  {page?.website_url && (
                    <SocialLink href={page.website_url} label="Website" accentRgb={accentRgb} icon={<Globe size={20} />} />
                  )}
                  {page?.merch_url && (
                    <SocialLink href={page.merch_url} label="Merch" accentRgb={accentRgb} icon={<ShoppingBag size={20} />} />
                  )}
                  {!profile.spotify_artist_id && !page?.instagram_url && !page?.youtube_url && !page?.website_url && !page?.merch_url && (
                    <p className="text-white/30 text-sm">No links added yet.</p>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ======== EDIT PANEL (OWNER) ======== */}
      <AnimatePresence>
        {editing && isOwner && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t"
            style={{
              background: "rgba(12,12,12,0.97)",
              borderColor: `rgba(${accentRgb}, 0.25)`,
              backdropFilter: "blur(20px)",
            }}
          >
            <div className="max-w-2xl mx-auto px-5 py-5 space-y-6 pb-8">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-widest text-white/60">Stage Settings</h3>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setEditing(false); setDraft(page ?? {}); }}
                    className="text-white/50 hover:text-white h-8"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving}
                    className="h-8 text-white"
                    style={{ background: `rgb(${accentRgb})` }}
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} /> Save</>}
                  </Button>
                </div>
              </div>

              {/* Accent color */}
              <div>
                <Label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Accent Color</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  {ACCENT_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => updateDraft("accent_color", c)}
                      className="w-7 h-7 rounded-full border-2 transition-transform active:scale-90"
                      style={{
                        background: c,
                        borderColor: draft.accent_color === c ? "white" : "transparent",
                        transform: draft.accent_color === c ? "scale(1.15)" : "scale(1)",
                      }}
                    />
                  ))}
                  <input
                    type="color"
                    value={draft.accent_color ?? "#a855f7"}
                    onChange={e => updateDraft("accent_color", e.target.value)}
                    className="w-7 h-7 rounded-full border border-white/20 cursor-pointer bg-transparent"
                    title="Custom color"
                  />
                </div>
              </div>

              {/* Theme */}
              <div>
                <Label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Theme</Label>
                <div className="flex gap-2">
                  {THEMES.map(t => (
                    <button
                      key={t}
                      onClick={() => updateDraft("theme", t)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border capitalize transition-all"
                      style={{
                        background: draft.theme === t ? `rgba(${accentRgb}, 0.2)` : "transparent",
                        borderColor: draft.theme === t ? `rgb(${accentRgb})` : "rgba(255,255,255,0.1)",
                        color: draft.theme === t ? `rgb(${accentRgb})` : "rgba(255,255,255,0.5)",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sonic identity */}
              <div>
                <Label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Sonic Identity Line</Label>
                <Input
                  value={draft.sonic_identity ?? ""}
                  onChange={e => updateDraft("sonic_identity", e.target.value || null)}
                  placeholder='e.g. "Dark, rhythm-driven momentum with emotional tension."'
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-sm"
                />
                <p className="text-[11px] text-white/25 mt-1">One restrained sentence. No hype.</p>
              </div>

              {/* Featured track */}
              <div>
                <Label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Featured Track (Spotify Track ID)</Label>
                <Input
                  value={draft.featured_track_id ?? ""}
                  onChange={e => updateDraft("featured_track_id", e.target.value || null)}
                  placeholder="e.g. 4cOdK2wGLETKBW3PvgPWqT"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-sm"
                />
                <Input
                  value={draft.featured_track_title ?? ""}
                  onChange={e => updateDraft("featured_track_title", e.target.value || null)}
                  placeholder="Track title (shown on play button)"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-sm mt-2"
                />
                <Input
                  value={draft.featured_track_url ?? ""}
                  onChange={e => updateDraft("featured_track_url", e.target.value || null)}
                  placeholder="Spotify track URL (for mini player)"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-sm mt-2"
                />
              </div>

              {/* Hero content */}
              <div>
                <Label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Hero Content (optional)</Label>
                <div className="flex gap-2 mb-2">
                  {(["youtube", "none"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => updateDraft("hero_content_type", t === "none" ? null : t)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border capitalize transition-all"
                      style={{
                        background: (draft.hero_content_type ?? "none") === t ? `rgba(${accentRgb}, 0.2)` : "transparent",
                        borderColor: (draft.hero_content_type ?? "none") === t ? `rgb(${accentRgb})` : "rgba(255,255,255,0.1)",
                        color: (draft.hero_content_type ?? "none") === t ? `rgb(${accentRgb})` : "rgba(255,255,255,0.5)",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {draft.hero_content_type === "youtube" && (
                  <Input
                    value={draft.hero_content_url ?? ""}
                    onChange={e => updateDraft("hero_content_url", e.target.value || null)}
                    placeholder="YouTube URL"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-sm"
                  />
                )}
              </div>

              {/* Social links */}
              <div className="space-y-2">
                <Label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Social Links</Label>
                {(
                  [
                    { key: "instagram_url", label: "Instagram URL" },
                    { key: "youtube_url", label: "YouTube URL" },
                    { key: "website_url", label: "Website URL" },
                    { key: "merch_url", label: "Merch URL" },
                  ] as { key: keyof ArtistPage; label: string }[]
                ).map(({ key, label }) => (
                  <Input
                    key={key}
                    value={(draft[key] as string) ?? ""}
                    onChange={e => updateDraft(key, e.target.value || null)}
                    placeholder={label}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-sm"
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======== MINI PLAYER ======== */}
      <AnimatePresence>
        {miniTrack && !editing && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-4 inset-x-4 z-40 rounded-2xl px-4 py-3 flex items-center gap-3 border"
            style={{
              background: "rgba(12,12,12,0.95)",
              borderColor: `rgba(${accentRgb}, 0.3)`,
              backdropFilter: "blur(20px)",
              boxShadow: `0 0 40px rgba(${accentRgb}, 0.2)`,
            }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: `rgba(${accentRgb}, 0.2)` }}
            >
              <Music2 size={14} style={{ color: `rgb(${accentRgb})` }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{miniTrack.title}</p>
              {miniTrack.artist && <p className="text-[10px] text-white/40 truncate">{miniTrack.artist}</p>}
            </div>
            {/* Progress bar */}
            <div className="w-20 h-0.5 rounded-full overflow-hidden bg-white/10 shrink-0">
              <div
                className="h-full rounded-full"
                style={{ width: "40%", background: `rgb(${accentRgb})` }}
              />
            </div>
            <button
              onClick={() => setMiniTrack(null)}
              className="text-white/30 hover:text-white/70 transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --------------- SocialLink ---------------
function SocialLink({ href, label, icon, accentRgb }: {
  href: string;
  label: string;
  icon: React.ReactNode;
  accentRgb: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border transition-all hover:scale-105 active:scale-95"
      style={{
        background: "rgba(255,255,255,0.04)",
        borderColor: "rgba(255,255,255,0.08)",
        color: "rgba(255,255,255,0.6)",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = `rgba(${accentRgb}, 0.4)`;
        (e.currentTarget as HTMLElement).style.color = `rgb(${accentRgb})`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
        (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)";
      }}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </a>
  );
}
