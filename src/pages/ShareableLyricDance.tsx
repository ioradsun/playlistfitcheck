/**
 * ShareableLyricDance — Public page for a full-song lyric dance.
 * Route: /:artistSlug/:songSlug/lyric-dance
 *
 * Thin React shell — all rendering is delegated to LyricDancePlayer.
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Download } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { mulberry32, hashSeed } from "@/engine/PhysicsIntegrator";
import { RIVER_ROWS, type ConstellationNode } from "@/hooks/useHookCanvas";
import { getSessionId } from "@/lib/sessionId";
import { computeAutoPalettesFromUrls } from "@/lib/autoPalette";
import { LyricDanceDebugPanel } from "@/components/lyric/LyricDanceDebugPanel";
import { LyricDancePlayer, DEFAULT_DEBUG_STATE, type LyricDanceData, type LiveDebugState } from "@/engine/LyricDancePlayer";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { ArtistDNA } from "@/components/lyric/ArtistFingerprintTypes";
import type { CinematicDirection } from "@/types/CinematicDirection";

// ─── Helpers ────────────────────────────────────────────────────────

/** Reconstruct audioSections from existing cinematic direction for regeneration calls */
function extractAudioSectionsFromDirection(
  cinematicDirection: any,
  lyrics: any[],
): any[] | undefined {
  const sections = cinematicDirection?.sections;
  if (!Array.isArray(sections) || sections.length === 0) return undefined;
  const lastLine = lyrics[lyrics.length - 1];
  const totalDur = lastLine?.end ?? lastLine?.start ?? 1;
  return sections.map((s: any, i: number) => ({
    index: s.sectionIndex ?? i,
    startSec: (s.startRatio ?? i / sections.length) * totalDur,
    endSec: (s.endRatio ?? (i + 1) / sections.length) * totalDur,
    role: s.mood ?? "verse",
    avgEnergy: 0.5,
    beatDensity: 1,
    lyrics: lyrics
      .filter((l: any) => {
        const secStart = (s.startRatio ?? i / sections.length) * totalDur;
        const secEnd = (s.endRatio ?? (i + 1) / sections.length) * totalDur;
        return (l.start ?? 0) >= secStart && (l.start ?? 0) < secEnd;
      })
      .map((l: any, li: number) => ({ text: l.text, lineIndex: li })),
  }));
}

// ─── Types ──────────────────────────────────────────────────────────

interface ProfileInfo { display_name: string | null; avatar_url: string | null; }
interface DanceComment { id: string; text: string; submitted_at: string; }

const PHASE1_COLUMNS = "id,user_id,artist_slug,song_slug,artist_name,song_name,audio_url,lyrics,words,section_images,cinematic_direction,auto_palettes,beat_grid,palette,system_type,seed,artist_dna,physics_spec";
const DIRECTION_COLUMNS = "cinematic_direction";

// ─── Progress Bar ───────────────────────────────────────────────────

const ProgressBar = React.forwardRef<HTMLDivElement, {
  player: LyricDancePlayer | null;
  data: LyricDanceData;
  onSeekStart: () => void;
  onSeekEnd: () => void;
  palette: string[];
}>(function ProgressBar({ player, data, onSeekStart, onSeekEnd, palette }, _ref) {
  const [progress, setProgress] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const wasPlaying = useRef(false);
  const lastProgressRef = useRef(0);

  useEffect(() => {
    if (!player) return;
    const audio = player.audio;
    const lines = data.lyrics;
    const songStart = lines.length > 0 ? Math.max(0, lines[0].start - 0.5) : 0;
    const songEnd = lines.length > 0 ? lines[lines.length - 1].end + 1 : 0;
    const duration = songEnd - songStart;
    let rafId = 0;
    const stop = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };
    const update = () => {
      const p = duration > 0 ? (audio.currentTime - songStart) / duration : 0;
      const clamped = Math.max(0, Math.min(1, p));
      if (Math.abs(clamped - lastProgressRef.current) > 0.005) {
        lastProgressRef.current = clamped;
        setProgress(clamped);
      }
      if (audio.paused || document.hidden) {
        rafId = 0;
        return;
      }
      rafId = requestAnimationFrame(update);
    };

    const start = () => {
      if (!rafId && !audio.paused && !document.hidden) {
        rafId = requestAnimationFrame(update);
      }
    };

    if (!audio.paused && !document.hidden) start();

    const handlePlay = () => start();
    const handlePause = () => stop();
    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [player, data]);

  const seekTo = useCallback((clientX: number) => {
    if (!barRef.current || !player) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const lines = data.lyrics;
    const songStart = lines.length > 0 ? Math.max(0, lines[0].start - 0.5) : 0;
    const songEnd = lines.length > 0 ? lines[lines.length - 1].end + 1 : 0;
    player.seek(songStart + ratio * (songEnd - songStart));
  }, [player, data]);

  const handleDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!player) return;
    e.stopPropagation();
    dragging.current = true;
    wasPlaying.current = !player.audio.paused;
    player.pause();
    onSeekStart();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    seekTo(clientX);

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const cx = "touches" in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;
      seekTo(cx);
    };
    const onUp = () => {
      dragging.current = false;
      onSeekEnd();
      if (wasPlaying.current) player.play();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
  }, [player, seekTo, onSeekStart, onSeekEnd]);

  return (
    <div
      ref={barRef}
      onMouseDown={handleDown}
      onTouchStart={handleDown}
      onClick={e => e.stopPropagation()}
      className="absolute bottom-0 left-0 right-0 z-10 h-3 cursor-pointer group"
      style={{ touchAction: "none" }}
    >
      <div className="absolute inset-0 bg-white/5" />
      <div className="absolute left-0 top-0 h-full transition-none" style={{ width: `${progress * 100}%`, background: palette?.[1] ?? "#a855f7", opacity: 0.6 }} />
      <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `calc(${progress * 100}% - 6px)` }} />
    </div>
  );
});

// ─── Live Debug HUD ─────────────────────────────────────────────────

function LiveDebugHUD({ player }: { player: LyricDancePlayer | null }) {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<LiveDebugState>(DEFAULT_DEBUG_STATE);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "d" || e.key === "D") {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        setOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!open || !player) return;
    const id = setInterval(() => setSnap({ ...player.debugState }), 100);
    return () => clearInterval(id);
  }, [open, player]);

  if (!open) return null;

  const f = (v: number, d = 2) => v.toFixed(d);
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: "#4ade80" }}>{label}:</span>
      <span style={{ color: "#d1fae5" }}>{value}</span>
    </div>
  );
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 6 }}>
      <div style={{ color: "#22c55e", fontWeight: 700, marginBottom: 2, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{
      position: "fixed", top: 12, left: 12, zIndex: 200,
      background: "rgba(0,0,0,0.88)", backdropFilter: "blur(4px)",
      border: "1px solid rgba(74,222,128,0.15)", borderRadius: 6,
      padding: 12, maxWidth: 280, minWidth: 240,
      fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
      fontSize: 11, lineHeight: "1.55", color: "#4ade80",
      pointerEvents: "auto", overflowY: "auto", maxHeight: "90vh",
    }}>
      <Section title="BEAT"><Row label="intensity" value={f(snap.beatIntensity)} /><Row label="pulse" value={f(snap.bgBeatPulse)} /><Row label="phase" value={f(snap.bgBeatPhase)} /><Row label="physGlow" value={f(snap.physGlow)} /></Section>
      <Section title="PHYSICS"><Row label="heat" value={f(snap.heat)} /><Row label="velocity" value={f(snap.velocity)} /><Row label="words" value={String(snap.wordCount)} /></Section>
      <Section title="ANIMATION"><Row label="effect" value={snap.effectKey} /><Row label="entry" value={f(snap.entryProgress)} /><Row label="exit" value={f(snap.exitProgress)} /><Row label="mod" value={snap.activeMod ?? "none"} /></Section>
      <Section title="PARTICLES"><Row label="system" value={snap.particleSystem} /><Row label="count" value={String(snap.particleCount)} /></Section>
      <Section title="DIRECTION"><Row label="section" value={`${snap.secIndex}/${snap.secTotal}`} /><Row label="line" value={String(snap.lineIndex)} /><Row label="chapter" value={snap.dirChapter} /><Row label="hero" value={snap.lineHeroWord || "—"} /><Row label="active" value={snap.activeWord} /><Row label="line style" value={snap.resolvedLineStyle} /><Row label="word style" value={snap.resolvedWordStyle} /><Row label="layout" value={snap.layoutStable ? "stable" : "unstable"} /><Row label="tension" value={snap.tensionStage} /></Section>
      <Section title="PERFORMANCE"><Row label="fps" value={String(Math.round(snap.fps))} /><Row label="total" value={snap.perfTotal.toFixed(2)} /><Row label="text" value={snap.perfText.toFixed(2)} /><Row label="bg" value={snap.perfBg.toFixed(2)} /></Section>
      <div style={{ marginTop: 6, fontSize: 9, color: "rgba(74,222,128,0.4)", textAlign: "center" as const }}>{f(snap.time, 2)}s · press D to close</div>
    </div>
  );
}

// DebugPanel removed — merged into LyricDanceDebugPanel with HUD + DATA tabs

// ─── Main Component ─────────────────────────────────────────────────

export default function ShareableLyricDance() {
  const { artistSlug, songSlug } = useParams<{ artistSlug: string; songSlug: string }>();
  const navigate = useNavigate();


  const [data, setData] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [muted, setMuted] = useState(true);
  const [showCover, setShowCover] = useState(true);
  const [badgeVisible, setBadgeVisible] = useState(false);
  const [inputText, setInputText] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [exporting, setExporting] = useState<"16:9" | "9:16" | null>(null);

  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<LyricDancePlayer | null>(null);
  const [playerInstance, setPlayerInstance] = useState<LyricDancePlayer | null>(null);
  const playerInitializedRef = useRef(false);

  const handleExport = useCallback((ratio: "16:9" | "9:16") => {
    if (!playerRef.current) return;
    setExporting(ratio);

    playerRef.current.onExportComplete = () => {
      setExporting(null);
    };

    playerRef.current.startExport(ratio).catch(() => {
      setExporting(null);
    });
  }, []);

  // ── Data fetch ──────────────────────────────────────────────────────


  useEffect(() => {
    if (!artistSlug || !songSlug) return;
    setLoading(true);

    supabase
      .from("shareable_lyric_dances" as any)
      .select(PHASE1_COLUMNS)
      .eq("artist_slug", artistSlug)
      .eq("song_slug", songSlug)
      .maybeSingle()
      .then(async ({ data: row, error }) => {
        if (error || !row) { setNotFound(true); setLoading(false); return; }
        const d = row as any as LyricDanceData;
        setData({ ...d, cinematic_direction: null });
        setLoading(false);

        // Phase 2: cinematic direction
        Promise.resolve(
          supabase.from("shareable_lyric_dances" as any).select(DIRECTION_COLUMNS).eq("id", d.id).maybeSingle()
        ).then(({ data: dirRow }) => {
          const rawDir = (dirRow as any)?.cinematic_direction;
          const dir = rawDir && !Array.isArray(rawDir) ? rawDir : null;
          if (dir) setData(prev => prev ? { ...prev, cinematic_direction: dir } : prev);
        }).catch(() => {}).finally(async () => {
          // Check if cinematic_direction already exists in DB
          const { data: existingRow } = await supabase
            .from("shareable_lyric_dances" as any)
            .select("cinematic_direction, section_images")
            .eq("id", d.id)
            .maybeSingle();
          const existingDir = (existingRow as any)?.cinematic_direction;
          const existingImages = (existingRow as any)?.section_images;

          if (existingDir && !Array.isArray(existingDir) && existingDir.sections?.length > 0) {
            // Use cached direction — skip generation
            setData(prev => prev ? { ...prev, cinematic_direction: existingDir } : prev);

            // Check if section images also already exist
            const imagesAlreadyExist =
              Array.isArray(existingImages) &&
              existingImages.length >= 3 &&
              existingImages.every((url: string) => !!url);

            if (imagesAlreadyExist) {
              setData(prev => prev ? { ...prev, section_images: existingImages } : prev);
            } else {
              // Generate section images from existing direction
              const sections = existingDir.sections;
              if (Array.isArray(sections) && sections.length > 0) {
                supabase.functions.invoke("generate-section-images", {
                  body: {
                    lyric_dance_id: d.id,
                  },
                }).then(({ data: imgResult }) => {
                  const nextImages = imgResult?.section_images ?? imgResult?.urls;
                  if (nextImages) {
                      setData(prev => prev ? { ...prev, section_images: nextImages } : prev);
                  }
                }).catch(() => {});
              }
            }
            return;
          }

          // No cached direction — generate fresh
          if (d.lyrics?.length > 0) {
            const linesForDir = (d.lyrics as any[]).filter((l: any) => l.tag !== "adlib").map((l: any) => ({ text: l.text, start: l.start, end: l.end }));
            supabase.functions.invoke("cinematic-direction", {
              body: { title: d.song_name, artist: d.artist_name, lines: linesForDir, beatGrid: d.beat_grid ? { bpm: (d.beat_grid as any).bpm } : undefined, lyricId: d.id },
            }).then(({ data: dirResult }) => {
              if (dirResult?.cinematicDirection) {
                setData(prev => prev ? { ...prev, cinematic_direction: dirResult.cinematicDirection } : prev);

                // Fire-and-forget: generate section background images
                const sections = dirResult.cinematicDirection?.sections;
                if (Array.isArray(sections) && sections.length > 0) {
                  supabase.functions.invoke("generate-section-images", {
                    body: {
                      lyric_dance_id: d.id,
                    },
                  }).then(({ data: imgResult }) => {
                    const nextImages = imgResult?.section_images ?? imgResult?.urls;
                    if (nextImages) {
                      setData(prev => prev ? { ...prev, section_images: nextImages } : prev);
                    }
                  }).catch(() => {});
                }
              }
            }).catch(() => {});
          }
        });
        const [profileResult, commentsResult] = await Promise.all([
          supabase.from("profiles").select("display_name, avatar_url").eq("id", d.user_id).maybeSingle(),
          supabase.from("lyric_dance_comments" as any).select("id, text, submitted_at").eq("dance_id", d.id).order("submitted_at", { ascending: true }).limit(100),
        ]);
        if (profileResult.data) setProfile(profileResult.data as ProfileInfo);
      });
  }, [artistSlug, songSlug]);

  useEffect(() => {
    if (!data) return;
    console.log('[Player Data] cinematic_direction keys:', Object.keys(data.cinematic_direction ?? {}));
    console.log('[Player Data] beat_grid:', data.beat_grid ? `BPM=${data.beat_grid.bpm}` : 'null');
    console.log('[Player Data] wordDirectives count:', data.cinematic_direction?.wordDirectives?.length ?? 0);
    console.log('[Player Data] texture:', data.cinematic_direction?.texture);
  }, [data]);

  // ── Player lifecycle (init ONCE) ─────────────────────────────────────

  const playerKey = data?.id;

  useEffect(() => {
    if (playerInitializedRef.current) return;
    if (!data || !data.cinematic_direction) return;
    // words are optional — player falls back to line-level timing if absent
    if (!bgCanvasRef.current || !textCanvasRef.current || !containerRef.current) return;

    playerInitializedRef.current = true;
    let destroyed = false;
    const container = containerRef.current;
    const player = new LyricDancePlayer(data, bgCanvasRef.current, textCanvasRef.current, container, { bootMode: "minimal" });
    playerRef.current = player;
    setPlayerInstance(player);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        player.resize(width, height);
      }
    });
    ro.observe(container);

    player.init()
      .then(() => {
        if (!destroyed) {
          player.play();
          console.info("[LyricDance boot]", player.getBootMetrics());
        }
      })
      .catch((err) => {
        console.error("LyricDancePlayer init failed:", err);
      });

    return () => {
      destroyed = true;
      ro.disconnect();
      player.destroy();
      playerRef.current = null;
      setPlayerInstance(null);
      playerInitializedRef.current = false;
    };
  }, [playerKey, !!data?.cinematic_direction]);

  // ── Hot-patch section images without restart ───────────────────────
  useEffect(() => {
    if (!playerRef.current || !data?.section_images?.length) return;
    playerRef.current.updateSectionImages(data.section_images);
  }, [data?.section_images]);


  // ── Auto-palette from section images (client-side sampler) ───────────────
  useEffect(() => {
    if (!data?.id) return;

    if (Array.isArray(data.auto_palettes) && data.auto_palettes.length > 0) {
      return;
    }

    const urls = (data.section_images ?? []).filter((u): u is string => Boolean(u));
    if (urls.length === 0) return;

    const savePalettesToDb = async (id: string, palettes: string[][]) => {
      try {
        await supabase
          .from("shareable_lyric_dances" as any)
          .update({ auto_palettes: palettes, updated_at: new Date().toISOString() } as any)
          .eq("id", id);
      } catch (error) {
        console.warn("[auto-palette] failed to cache:", error);
      }
    };

    let cancelled = false;
    computeAutoPalettesFromUrls(urls)
      .then((autoPalettes) => {
        if (cancelled || autoPalettes.length === 0) return;
        setData(prev => (prev ? { ...prev, auto_palettes: autoPalettes } : prev));
        if (playerRef.current) {
          playerRef.current.updateAutoPalettes(autoPalettes);
        }
        void savePalettesToDb(data.id, autoPalettes);
      })
      .catch((error) => {
        console.error('[auto-palette] failed to compute from section images', error);
      });

    return () => {
      cancelled = true;
    };
  }, [data?.id, data?.section_images, data?.auto_palettes]);

  // ── Hot-patch scene context without restart ────────────────────────
  useEffect(() => {
    if (!playerRef.current || !data?.scene_context) return;
    playerRef.current.updateSceneContext(data.scene_context);
  }, [data?.scene_context]);

  // ── Realtime comment comets ─────────────────────────────────────────
  useEffect(() => {
    if (!data?.id) return;
    const channel = supabase
      .channel(`dance-comments-${data.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lyric_dance_comments',
          filter: `dance_id=eq.${data.id}`,
        },
        (payload: any) => {
          const text = payload.new?.text;
          if (text && playerRef.current) {
            playerRef.current.fireComment(text);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [data?.id]);

  // ── Mute toggle ─────────────────────────────────────────────────────

  const handleMuteToggle = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    const newMuted = !muted;
    player.setMuted(newMuted);
    setMuted(newMuted);
  }, [muted]);

  // ── Comment submit ──────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!inputText.trim() || !data || hasSubmitted) return;
    const text = inputText.trim().slice(0, 200);
    const sessionId = getSessionId();

    const { data: inserted } = await supabase
      .from("lyric_dance_comments" as any)
      .insert({ dance_id: data.id, text, session_id: sessionId })
      .select("id, text, submitted_at")
      .single();

    if (inserted) {
      const newComment = inserted as any as DanceComment;
      setHasSubmitted(true);
      setInputText("");

      // Fire comet on canvas
      playerRef.current?.fireComment(newComment.text);

      // Push to player constellation
      const player = playerRef.current;
      if (player) {
        const rng = mulberry32(hashSeed(newComment.id));
        const angle = rng() * Math.PI * 2;
        const radius = rng() * 0.2;
        player.constellationNodes.push({
          id: newComment.id, text: newComment.text,
          submittedAt: Date.now(),
          seedX: 0.5 + Math.cos(angle) * radius,
          seedY: 0.5 + Math.sin(angle) * radius,
          x: 0.5, y: 0.5,
          driftSpeed: 0.008 + rng() * 0.012,
          driftAngle: rng() * Math.PI * 2,
          phase: "center",
          phaseStartTime: Date.now(),
          riverRowIndex: Math.floor(rng() * RIVER_ROWS.length),
          currentSize: 16,
          baseOpacity: 0.06,
        });
      }
    }
  }, [inputText, data, hasSubmitted]);

  // Badge timer + hide Lovable widget
  useEffect(() => { const t = setTimeout(() => setBadgeVisible(true), 1000); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "hide-lovable-badge-ld";
    style.textContent = `[data-lovable-badge], .lovable-badge, iframe[src*="lovable"] { display: none !important; }`;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  // ── Loading / Not Found ─────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center z-50">
        <div className="text-center space-y-3">
          <div className="h-4 w-48 rounded bg-white/[0.06] animate-pulse mx-auto" />
          <div className="h-3 w-32 rounded bg-white/[0.04] animate-pulse mx-auto" />
        </div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center gap-4 z-50">
        <p className="text-white/40 text-lg font-mono">Lyric Dance not found.</p>
        <button onClick={() => navigate("/")} className="text-white/30 text-sm hover:text-white/60 transition-colors">tools.fm</button>
      </div>
    );
  }

  // Gate: don't render player until cinematic_direction is a real object (not null, not [])
  if (!data.cinematic_direction || Array.isArray(data.cinematic_direction)) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center z-50">
        <div className="text-center space-y-3">
          <div className="h-4 w-48 rounded bg-white/[0.06] animate-pulse mx-auto" />
          <div className="h-3 w-32 rounded bg-white/[0.04] animate-pulse mx-auto" />
          <p className="text-white/20 text-xs font-mono mt-4">loading cinematic direction…</p>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0a0a0a" }}>
      {/* Close button */}
      <button
        onClick={() => navigate(-1)}
        className="fixed top-4 right-4 z-[70] w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm border border-white/10 hover:border-white/25 hover:bg-black/70 transition-all text-white/60 hover:text-white/90"
        aria-label="Close"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
        </svg>
      </button>

      {/* Badge */}
      <AnimatePresence>
        {badgeVisible && (
          <motion.button
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            onClick={() => navigate(`/?from=lyric-dance&song=${encodeURIComponent(data.song_name)}`)}
            className="fixed bottom-4 right-4 z-[60] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-sm border border-white/10 hover:border-white/25 hover:bg-black/80 transition-all group"
          >
            <span className="text-[10px] font-mono text-white/50 group-hover:text-white/80 tracking-wider transition-colors">Fit by toolsFM</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="relative w-full flex-1 min-h-[60vh] md:min-h-[70vh] cursor-pointer overflow-hidden"
        onClick={() => { if (!showCover) handleMuteToggle(); }}
      >
        <canvas id="bg-canvas" ref={bgCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        <canvas id="text-canvas" ref={textCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Cover overlay */}
        <AnimatePresence>
          {showCover && (
            <motion.div
              initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center"
              style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(2px)" }}
            >
              <div className="mb-5">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.display_name || data.artist_name} className="w-20 h-20 rounded-full object-cover border border-white/10" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
                    <span className="text-2xl font-mono text-white/40">{(data.artist_name || "?")[0].toUpperCase()}</span>
                  </div>
                )}
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white text-center leading-tight max-w-[80%] mb-1">{data.song_name}</h2>
              <p className="text-[11px] font-mono uppercase tracking-[0.25em] text-white/40 mb-8">{profile?.display_name || data.artist_name}</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCover(false);
                  playerRef.current?.setMuted(false);
                  playerRef.current?.play();
                  setMuted(false);
                }}
                className="px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white border border-white/20 rounded-lg hover:bg-white/5 transition-colors"
              >
                Listen Now
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Identity label */}
        {!showCover && (
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2.5">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name || data.artist_name} className="w-8 h-8 rounded-full object-cover border border-white/10" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <span className="text-xs font-mono text-white/40">{(data.artist_name || "?")[0].toUpperCase()}</span>
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-white/70 leading-tight truncate max-w-[180px]">{data.song_name}</span>
              <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-white/30 leading-tight">{profile?.display_name || data.artist_name}</span>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {!showCover && (
          <ProgressBar
            player={playerRef.current}
            data={data}
            onSeekStart={() => {}}
            onSeekEnd={() => {}}
            palette={Array.isArray(data.palette) ? data.palette : ["#ffffff", "#a855f7", "#ec4899"]}
          />
        )}

        {/* Export buttons removed from canvas — moved to bottom bar */}
      </div>

      {/* Bottom action bar */}
      <div className="w-full" style={{ background: "#0a0a0a" }}>
        <div className="max-w-[480px] mx-auto px-5 py-4 space-y-3">
          <div className="flex items-center gap-3">
            {/* Download button */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  disabled={!!exporting}
                  className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/10 text-white/40 hover:text-white/70 hover:border-white/25 hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  aria-label="Download video"
                >
                  {exporting ? (
                    <span className="text-[9px] font-mono animate-pulse text-white/50">REC</span>
                  ) : (
                    <Download size={16} />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-auto min-w-[180px] p-1 bg-[#1a1a1a] border-white/10">
                <button
                  onClick={() => handleExport("9:16")}
                  disabled={!!exporting}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded text-left text-sm font-mono text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
                >
                  <span className="text-white/30">9:16</span>
                  <span className="text-white/50">·</span>
                  <span>TikTok / Reels</span>
                </button>
                <button
                  onClick={() => handleExport("16:9")}
                  disabled={!!exporting}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded text-left text-sm font-mono text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
                >
                  <span className="text-white/30">16:9</span>
                  <span className="text-white/50">·</span>
                  <span>YouTube</span>
                </button>
              </PopoverContent>
            </Popover>

            {/* Comment input */}
            <div className="flex-1">
              <AnimatePresence mode="wait">
                {hasSubmitted ? (
                  <motion.p key="notified" initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}
                    onAnimationComplete={() => { setTimeout(() => setHasSubmitted(false), 2500); }}
                    className="text-center text-sm text-white/30">FMLY Notified</motion.p>
                ) : (
                  <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="relative">
                    <input
                      type="text" value={inputText} onChange={e => setInputText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
                      placeholder="DROP YOUR TAKE LIVE" maxLength={200}
                      className="w-full bg-transparent border border-white/10 rounded-lg px-4 py-3 pr-20 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-mono text-white/20 pointer-events-none">Press Enter</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Debug */}
      <LiveDebugHUD player={playerInstance} />
      <LyricDanceDebugPanel
        player={playerInstance}
        onRegenerateSong={() => {
          toast.info("Re-generating cinematic direction…");
          if (!data) return;
          const lyricsForDirection = (data.lyrics as any[])
            .filter((l: any) => l.tag !== "adlib")
            .map((l: any) => ({ text: l.text, start: l.start, end: l.end }));
          const existingAudioSections = extractAudioSectionsFromDirection(data.cinematic_direction, lyricsForDirection);
          supabase.functions.invoke("cinematic-direction", {
            body: {
              title: data.song_name,
              artist: data.artist_name,
              lines: lyricsForDirection,
              lyricId: data.id,
              audioSections: existingAudioSections,
            },
          }).then(({ data: dirResult, error }) => {
            if (error) { toast.error("Cinematic direction failed"); return; }
            supabase.from("shareable_lyric_dances" as any)
              .update({ cinematic_direction: dirResult?.cinematicDirection ?? null, updated_at: new Date().toISOString() } as any)
              .eq("id", data.id)
              .then(() => {
                toast.success("Cinematic direction updated — reloading…");
                setTimeout(() => window.location.reload(), 1000);
              });
          });
        }}
        onRegenerateDance={async () => {
          if (!data) return;
          toast.info("Syncing words from saved project…");
          try {
            const { data: result, error } = await supabase.functions.invoke("sync-dance-words", {
              body: { dance_id: data.id },
            });
            if (error) throw error;
            if (result?.error) {
              toast.error(result.error);
              return;
            }
            toast.success(`Synced ${result.count} words — reloading…`);
            setTimeout(() => window.location.reload(), 800);
          } catch (e: any) {
            console.error("[DEBUG] Dance sync error:", e);
            toast.error(e.message || "Failed to sync words");
          }
        }}
        onRegenerateDirector={async () => {
          if (!data) return;
          toast.info("Refreshing cinematic direction…");
          try {
            const lyricsForDirection = (data.lyrics as any[])
              .filter((l: any) => l.tag !== "adlib")
              .map((l: any) => ({ text: l.text, start: l.start, end: l.end }));
            const existingAudioSections2 = extractAudioSectionsFromDirection(data.cinematic_direction, lyricsForDirection);
            const { data: result, error } = await supabase.functions.invoke("cinematic-direction", {
              body: {
                title: data.song_name,
                artist: data.artist_name,
                lines: lyricsForDirection,
                lyricId: data.id,
                audioSections: existingAudioSections2,
              },
            });
            if (error) throw error;
            if (result?.cinematicDirection) {
              toast.success("Cinematic direction updated — reloading…");
              setTimeout(() => window.location.reload(), 800);
            } else {
              toast.error("No cinematic direction returned");
            }
          } catch (e: any) {
            console.error("[DEBUG] Director error:", e);
            toast.error(e.message || "Failed to generate cinematic direction");
          }
        }}
        onRunCustomPrompt={async (systemPrompt: string) => {
          if (!data) return;
          toast.info("Running cinematic-direction with custom prompt…");
          try {
            const lyricsForDirection = (data.lyrics as any[])
              .filter((l: any) => l.tag !== "adlib")
              .map((l: any) => ({ text: l.text, start: l.start, end: l.end }));
            const existingAudioSections3 = extractAudioSectionsFromDirection(data.cinematic_direction, lyricsForDirection);
            const { data: dirResult, error } = await supabase.functions.invoke("cinematic-direction", {
              body: {
                title: data.song_name,
                artist: data.artist_name,
                lines: lyricsForDirection,
                beatGrid: data.beat_grid ? { bpm: (data.beat_grid as any).bpm } : undefined,
                lyricId: data.id,
                scene_context: data.scene_context ?? null,
                systemPromptOverride: systemPrompt,
                audioSections: existingAudioSections3,
              },
            });
            if (error) throw error;
            if (dirResult?.cinematicDirection) {
              toast.success("Custom prompt result received — reloading…");
              setTimeout(() => window.location.reload(), 800);
            } else {
              toast.error("No cinematic direction returned");
            }
          } catch (e: any) {
            console.error("[DEBUG] Custom prompt error:", e);
            toast.error(e.message || "Failed to run custom prompt");
          }
        }}
        data={{
          renderData: {
            cinematic_direction: data.cinematic_direction as any,
          },
          beatGrid: data.beat_grid ? { bpm: (data.beat_grid as any).bpm ?? 0, beats: (data.beat_grid as any).beats ?? [], confidence: (data.beat_grid as any).confidence ?? 0 } : null, lines: data.lyrics,
          title: data.song_name, artist: data.artist_name,
          overrides: {},  fingerprint: null,
          section_images: data.section_images,
          words: data.words,
        }}
      />
    </div>
  );
}
