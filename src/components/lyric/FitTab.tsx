/**
 * FitTab — Displays analysis results with waveform + beat markers.
 * Centered single-column layout for readability.
 * Pipeline runs in LyricFitTab parent.
 * v2: removed lyrics column, single-column report.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, RefreshCw, Music, Sparkles, Eye, Palette, Zap, Image, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { slugify } from "@/lib/slugify";
import { getAudioStoragePath } from "@/lib/audioStoragePath";
import { computeAutoPalettesFromUrls } from "@/lib/autoPalette";
import { LyricWaveform } from "./LyricWaveform";
import type { WaveformData } from "@/hooks/useAudioEngine";
import type { LyricLine, LyricData } from "./LyricDisplay";
import type { BeatGridData } from "@/hooks/useBeatGrid";
import type { SongSignature } from "@/lib/songSignatureAnalyzer";
// FrameRenderState import removed — V3 derives from cinematicDirection
import type { AudioSection } from "@/engine/sectionDetector";
import type { HeaderProjectSetter } from "./LyricsTab";
import type { GenerationStatus } from "./LyricFitTab";

const PEAK_SAMPLES = 200;

function extractPeaks(buffer: AudioBuffer, samples: number): number[] {
  const channel = buffer.getChannelData(0);
  const blockSize = Math.floor(channel.length / samples);
  const peaks: number[] = [];
  for (let i = 0; i < samples; i++) {
    let max = 0;
    const start = i * blockSize;
    for (let j = 0; j < blockSize; j++) {
      const v = Math.abs(channel[start + j]);
      if (v > max) max = v;
    }
    peaks.push(max);
  }
  const maxPeak = Math.max(...peaks, 0.01);
  return peaks.map((p) => p / maxPeak);
}

interface Props {
  lyricData: LyricData;
  audioFile: File;
  hasRealAudio: boolean;
  savedId: string | null;
  renderData: any | null;
  setRenderData: (d: any) => void;
  beatGrid: BeatGridData | null;
  setBeatGrid: (g: BeatGridData | null) => void;
  songSignature: SongSignature | null;
  setSongSignature: (s: SongSignature | null) => void;
  cinematicDirection: any | null;
  setCinematicDirection: (d: any) => void;
  generationStatus: GenerationStatus;
  audioSections?: AudioSection[];
  words?: Array<{ word: string; start: number; end: number }> | null;
  onRetry?: () => void;
  onHeaderProject?: HeaderProjectSetter;
  onBack?: () => void;
  onImageGenerationStatusChange?: (status: "idle" | "running" | "done" | "error") => void;
}

export function FitTab({
  lyricData,
  audioFile,
  hasRealAudio,
  savedId,
  renderData,
  setRenderData,
  beatGrid,
  setBeatGrid,
  songSignature,
  setSongSignature,
  cinematicDirection,
  setCinematicDirection,
  generationStatus,
  audioSections,
  words,
  onRetry,
  onHeaderProject,
  onBack,
  onImageGenerationStatusChange,
}: Props) {
  const { user } = useAuth();
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState("");
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishedLyricsHash, setPublishedLyricsHash] = useState<string | null>(null);

  // ── Battle publish state ──────────────────────────────────────────────
  const [battlePublishing, setBattlePublishing] = useState(false);
  const [battlePublishedUrl, setBattlePublishedUrl] = useState<string | null>(null);

  // Simple hash of lyrics to detect transcript changes
  const computeLyricsHash = useCallback((lns: LyricLine[]) => {
    const text = lns.filter(l => l.tag !== "adlib").map(l => `${l.text}|${l.start}|${l.end}`).join("\n");
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return String(hash);
  }, []);

  const currentLyricsHash = lyricData?.lines ? computeLyricsHash(lyricData.lines) : null;
  const danceNeedsRegeneration = !publishedUrl || (publishedLyricsHash !== null && currentLyricsHash !== publishedLyricsHash);

  // Check for existing published dance on load
  useEffect(() => {
    if (!user || !lyricData) return;
    const songSlug = slugify(lyricData.title || "untitled");
    if (!songSlug) return;

    // Look up by user_id + song_slug (artist_slug may differ between artist name and display_name)
    supabase
      .from("shareable_lyric_dances" as any)
      .select("artist_slug, song_slug, lyrics")
      .eq("user_id", user.id)
      .eq("song_slug", songSlug)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          setPublishedUrl(`/${data.artist_slug}/${data.song_slug}/lyric-dance`);
          const pubLines = Array.isArray(data.lyrics) ? data.lyrics : [];
          setPublishedLyricsHash(computeLyricsHash(pubLines));
        }
      });
  }, [user, lyricData, computeLyricsHash]);

  // ── Audio playback + waveform ─────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [waveform, setWaveform] = useState<WaveformData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!audioFile || audioFile.size === 0) return;

    const url = URL.createObjectURL(audioFile);
    const audio = new Audio(url);
    audio.preload = "auto";
    audioRef.current = audio;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    const ctx = new AudioContext();
    audioFile.arrayBuffer().then((ab) => {
      ctx.decodeAudioData(ab).then((buf) => {
        setWaveform({ peaks: extractPeaks(buf, PEAK_SAMPLES), duration: buf.duration });
        ctx.close();
      });
    }).catch(() => {});

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      URL.revokeObjectURL(url);
      audioRef.current = null;
    };
  }, [audioFile]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying]);

  const handleSeek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) audioRef.current.play().catch(() => {});
    else audioRef.current.pause();
  }, []);

  // ── Header project ────────────────────────────────────────────────────
  useEffect(() => {
    if (!onHeaderProject) return;
    const title =
      lyricData.title && lyricData.title !== "Unknown" && lyricData.title !== "Untitled"
        ? lyricData.title
        : audioFile.name.replace(/\.[^.]+$/, "");
    onHeaderProject({ title, onBack: onBack ?? (() => {}) });
    return () => onHeaderProject(null);
  }, [lyricData.title, audioFile.name, onHeaderProject, onBack]);
// CinematicDirectionCard extracted to top-level — see below FitTab


  const handleDance = useCallback(async () => {
    console.log("[FitTab] handleDance called", { user: !!user, lyricData: !!lyricData, audioFile: !!audioFile, publishing });
    if (!user) { toast.error("Sign in to publish your Dance"); return; }
    if (!cinematicDirection || !lyricData || !audioFile || publishing) return;
    setPublishing(true);
    setPublishStatus("Preparing…");

    // Show a slow-publish warning after 30s but do NOT abort — storage uploads
    // can legitimately take longer and calling setPublishing(false) here would
    // trigger a React re-render that aborts the in-flight Supabase request.
    const slowWarningId = setTimeout(() => {
      setPublishStatus("Still working — large files take longer…");
    }, 30_000);

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      const displayName = profile?.display_name || "artist";
      const artistSlug = slugify(displayName);
      const songSlug = slugify(lyricData.title || "untitled");

      if (!artistSlug || !songSlug) {
        toast.error("Couldn't generate a valid URL — check song/artist name");
        setPublishing(false);
        return;
      }

      // Check for existing dance to reuse audio_url and palettes
      const { data: existingDance }: any = await supabase
        .from("shareable_lyric_dances" as any)
        .select("audio_url, section_images, auto_palettes")
        .eq("user_id", user.id)
        .eq("artist_slug", artistSlug)
        .eq("song_slug", songSlug)
        .maybeSingle();

      let audioUrl: string;
      if (existingDance?.audio_url) {
        setPublishStatus("Using existing audio…");
        audioUrl = existingDance.audio_url;
      } else {
        setPublishStatus("Uploading audio…");
        const storagePath = savedId
          ? getAudioStoragePath(user.id, savedId, audioFile.name)
          : `${user.id}/${artistSlug}/${songSlug}/lyric-dance.${audioFile.name.split(".").pop() || "webm"}`;
        const { error: uploadError } = await supabase.storage
          .from("audio-clips")
          .upload(storagePath, audioFile, { upsert: true, contentType: audioFile.type || undefined });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("audio-clips").getPublicUrl(storagePath);
        audioUrl = urlData.publicUrl;
      }

      setPublishStatus("Publishing…");
      const mainLines = lyricData.lines.filter((l) => l.tag !== "adlib");

      // Compute auto palettes from existing section images (non-blocking)
      let publishAutoPalettes: string[][] | null = null;
      if (!danceNeedsRegeneration) {
        try {
          if (Array.isArray(existingDance?.auto_palettes) && existingDance.auto_palettes.length > 0) {
            publishAutoPalettes = existingDance.auto_palettes;
          } else {
            const urls = (existingDance?.section_images ?? []).filter((u: unknown): u is string => typeof u === "string" && Boolean(u));
            if (urls.length > 0) {
              publishAutoPalettes = await computeAutoPalettesFromUrls(urls);
            }
          }
        } catch (paletteError) {
          console.warn("[FitTab] failed to precompute auto palettes (non-blocking):", paletteError);
        }
      }
      // When regenerating, both section_images and auto_palettes are nullified
      // so fresh images + palettes are generated post-publish

      // Upsert fields:
      // user_id            — from auth (required)
      // artist_slug        — from profile slug (required)
      // song_slug          — from title slug (required)
      // artist_name        — from profile (required)
      // song_name          — from state (required)
      // audio_url          — from existing or fresh upload (required)
      // lyrics             — from state, adlibs filtered (required)
      // cinematic_direction — from state (nullable)
      // words              — from state (nullable)
      // auto_palettes      — null if regenerating, preserved if not
      // beat_grid          — from state with fallback (required, NOT NULL)
      // palette            — from direction with fallback (required, NOT NULL)
      // section_images     — null if regenerating, preserved if not
      const { error: insertError } = await supabase
        .from("shareable_lyric_dances" as any)
        .upsert({
          user_id: user.id,
          artist_slug: artistSlug,
          song_slug: songSlug,
          artist_name: displayName,
          song_name: lyricData.title || "Untitled",
          audio_url: audioUrl,
          lyrics: mainLines,
          cinematic_direction: cinematicDirection || null,
          words: words ?? null,
          auto_palettes: danceNeedsRegeneration ? null : (publishAutoPalettes ?? null),
          beat_grid: beatGrid ? { bpm: beatGrid.bpm, beats: beatGrid.beats, confidence: beatGrid.confidence } : {},
          palette: cinematicDirection?.palette || ["#ffffff", "#a855f7", "#ec4899"],
          section_images: danceNeedsRegeneration ? null : (existingDance?.section_images ?? null),
        }, { onConflict: "artist_slug,song_slug" });

      if (insertError) throw insertError;

      const { data: danceRow }: any = await supabase
        .from("shareable_lyric_dances" as any)
        .select("id")
        .eq("artist_slug", artistSlug)
        .eq("song_slug", songSlug)
        .single();

      const url = `/${artistSlug}/${songSlug}/lyric-dance`;
      setPublishedUrl(url);
      setPublishedLyricsHash(currentLyricsHash);
      toast.success("Lyric Dance page published!");

      // ── Auto-post to CrowdFit (fire-and-forget) ──
      (async () => {
        try {
          if (!danceRow?.id) return;
          const danceId = danceRow.id;

          const { data: existing }: any = await supabase
            .from("songfit_posts" as any)
            .select("id")
            .eq("user_id", user.id)
            .eq("lyric_dance_id", danceId)
            .maybeSingle();

          if (existing) {
            await supabase
              .from("songfit_posts" as any)
              .update({ lyric_dance_url: url })
              .eq("id", existing.id);
          } else {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 21);

            await supabase
              .from("songfit_posts" as any)
              .insert({
                user_id: user.id,
                track_title: lyricData.title || "Untitled",
                caption: "",
                lyric_dance_url: url,
                lyric_dance_id: danceId,
                spotify_track_url: null,
                spotify_track_id: null,
                album_art_url: null,
                tags_json: [],
                track_artists_json: [],
                status: "live",
                submitted_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString(),
              });
          }

          window.dispatchEvent(new Event("songfit:dance-published"));
          console.log("[FitTab] CrowdFit post created for lyric dance");
        } catch (e: any) {
          console.warn("[FitTab] CrowdFit auto-post failed (non-blocking):", e?.message);
        }
      })();
    } catch (e: any) {
      console.error("Dance publish error:", e);
      toast.error(e.message || "Failed to publish lyric dance");
    } finally {
      clearTimeout(slowWarningId);
      setPublishing(false);
      setPublishStatus("");
    }
  }, [user, lyricData, audioFile, publishing, renderData, beatGrid, cinematicDirection, words, danceNeedsRegeneration, currentLyricsHash]);

  // ── Battle publish handler ──────────────────────────────────────────
  const handleStartBattle = useCallback(async () => {
    if (!user || battlePublishing) return;
    if (!renderData?.hook || !renderData?.secondHook || !audioFile || !lyricData) return;
    setBattlePublishing(true);

    const slowWarningId2 = setTimeout(() => {
      toast("Still uploading — large files take longer…");
    }, 30_000);

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      const displayName = profile?.display_name || "artist";
      const artistSlug = slugify(displayName);
      const songSlug = slugify(lyricData.title || "untitled");

      const deriveHookSlug = (h: any): string => {
        const hookLines = lyricData.lines.filter(l => l.start < h.end && l.end > h.start);
        const lastLine = hookLines[hookLines.length - 1];
        const hookPhrase = lastLine?.text || h.previewText || "hook";
        return slugify(hookPhrase);
      };

      const hookSlug = deriveHookSlug(renderData.hook);

      if (!artistSlug || !songSlug || !hookSlug) {
        toast.error("Couldn't generate a valid URL — check song/artist name");
        setBattlePublishing(false);
        return;
      }

      // Check for existing hook to reuse audio_url
      const { data: existingHook }: any = await supabase
        .from("shareable_hooks" as any)
        .select("audio_url")
        .eq("artist_slug", artistSlug)
        .eq("song_slug", songSlug)
        .eq("hook_slug", hookSlug)
        .maybeSingle();

      let audioUrl: string;
      if (existingHook?.audio_url) {
        audioUrl = existingHook.audio_url;
      } else {
        const fileExt = audioFile.name.split(".").pop() || "webm";
        const storagePath = `${user.id}/${artistSlug}/${songSlug}/${hookSlug}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("audio-clips")
          .upload(storagePath, audioFile, { upsert: true });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("audio-clips").getPublicUrl(storagePath);
        audioUrl = urlData.publicUrl;
      }

      const battleId = crypto.randomUUID();
      const pSpec = renderData?.motionProfileSpec || {};
      const bg = beatGrid ? { bpm: beatGrid.bpm, beats: beatGrid.beats, confidence: beatGrid.confidence } : {};
      const palette = pSpec.palette || ["#ffffff", "#a855f7", "#ec4899"];
      const system = pSpec.system || "fracture";

      // Helper to build hook payload — all values explicitly non-undefined
      const buildHookPayload = (h: any, slug: string, position: number, label: string | null) => {
        const hookLines = lyricData.lines.filter(l => l.start < h.end && l.end > h.start);
        const lastLine = hookLines[hookLines.length - 1];
        const hookPhrase = lastLine?.text || h.previewText || "hook";
        return {
          user_id: user.id,
          artist_slug: artistSlug,
          song_slug: songSlug,
          hook_slug: slug,
          artist_name: displayName,
          song_name: lyricData.title || "Untitled",
          hook_phrase: hookPhrase,
          artist_dna: null,
          motion_profile_spec: pSpec,
          beat_grid: bg,
          hook_start: h.start,
          hook_end: h.end,
          lyrics: hookLines,
          audio_url: audioUrl,
          system_type: system,
          palette,
          signature_line: null,
          battle_id: battleId,
          battle_position: position,
          hook_label: label,
        };
      };

      // Upsert hook 1
      const { error: e1 } = await supabase
        .from("shareable_hooks" as any)
        .upsert(buildHookPayload(renderData.hook, hookSlug, 1, renderData.hookLabel || null), { onConflict: "artist_slug,song_slug,hook_slug" });
      if (e1) throw e1;

      // Upsert hook 2
      const secondHookSlug = deriveHookSlug(renderData.secondHook);
      const { error: e2 } = await supabase
        .from("shareable_hooks" as any)
        .upsert(buildHookPayload(renderData.secondHook, secondHookSlug || `${hookSlug}-2`, 2, renderData.secondHookLabel || null), { onConflict: "artist_slug,song_slug,hook_slug" });
      if (e2) throw e2;

      // Upsert hookfit_posts
      const { data: primaryHook } = await supabase
        .from("shareable_hooks" as any)
        .select("id")
        .eq("artist_slug", artistSlug)
        .eq("song_slug", songSlug)
        .eq("hook_slug", hookSlug)
        .maybeSingle();

      if (primaryHook) {
        await supabase
          .from("hookfit_posts" as any)
          .upsert({
            user_id: user.id,
            battle_id: battleId,
            hook_id: (primaryHook as any).id,
            status: "live",
          }, { onConflict: "battle_id" });
      }

      const battleUrl = `/${artistSlug}/${songSlug}/${hookSlug}`;
      setBattlePublishedUrl(battleUrl);

      // Auto-post to CrowdFit (fire-and-forget)
      (async () => {
        try {
          const { data: existing }: any = await supabase
            .from("songfit_posts" as any)
            .select("id")
            .eq("user_id", user.id)
            .eq("lyric_dance_url", battleUrl)
            .maybeSingle();

          if (!existing) {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 21);
            await supabase
              .from("songfit_posts" as any)
              .insert({
                user_id: user.id,
                track_title: lyricData.title || "Untitled",
                caption: "",
                lyric_dance_url: battleUrl,
                lyric_dance_id: null,
                spotify_track_url: null,
                spotify_track_id: null,
                album_art_url: null,
                tags_json: [],
                track_artists_json: [],
                status: "live",
                submitted_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString(),
              });
          }
          window.dispatchEvent(new Event("songfit:dance-published"));
        } catch (e: any) {
          console.warn("[FitTab] CrowdFit battle auto-post failed:", e?.message);
        }
      })();

      window.dispatchEvent(new Event("hookfit:battle-published"));
      toast.success("Hook Battle published to CrowdFit!");
    } catch (e: any) {
      console.error("Battle publish error:", e);
      toast.error(e.message || "Failed to publish battle");
    } finally {
      clearTimeout(slowWarningId2);
      setBattlePublishing(false);
    }
  }, [user, battlePublishing, renderData, audioFile, lyricData, beatGrid]);

  const allReady =
    generationStatus.beatGrid === "done" &&
    generationStatus.renderData === "done" &&
    generationStatus.cinematicDirection === "done";
  const hasErrors = Object.values(generationStatus).includes("error");
  const danceDisabled = !cinematicDirection || publishing || !allReady;
  // Republish only needs auth + not currently publishing (data already exists on server)
  const republishDisabled = publishing;
  const hasBattle = !!(renderData?.hook && renderData?.secondHook);
  const battleDisabled = !allReady || battlePublishing || !hasBattle;

  

  // ── Sections derived from renderData ─────────────────────────────────────
  const meaning = renderData?.meaning;

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex-1 px-4 py-6 space-y-4 max-w-2xl mx-auto">
      {/* Waveform — full width */}
      {hasRealAudio && (
        <div className="glass-card rounded-xl p-3">
          <LyricWaveform
            waveform={waveform}
            isPlaying={isPlaying}
            currentTime={currentTime}
            onSeek={handleSeek}
            onTogglePlay={handleTogglePlay}
            beats={beatGrid?.beats ?? null}
            beatGridLoading={false}
          />
        </div>
      )}

      {/* Single-column report */}
      <div className="space-y-3">
        {!allReady && (
            <div className="glass-card rounded-xl p-4 space-y-2">
              <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                {hasErrors ? "Some steps failed" : Object.values(generationStatus).some(v => v === "running") ? "Generating Fit in background" : "Analysis not yet complete"}
              </p>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div>Rhythm: {generationStatus.beatGrid}</div>
                <div>Song DNA: {generationStatus.renderData}</div>
                <div>Cinematic direction: {generationStatus.cinematicDirection}</div>
              </div>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="text-[11px] font-mono text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                >
                  <RefreshCw size={10} />
                  {hasErrors ? "Retry failed steps" : "Re-analyze"}
                </button>
              )}
            </div>
          )}

          {renderData?.description && (
            <div className="glass-card rounded-xl p-4 space-y-2">
              <p className="text-sm text-muted-foreground italic leading-relaxed">{renderData.description}</p>
              {renderData.mood && (
                <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {renderData.mood}
                </span>
              )}
            </div>
          )}

          {renderData && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Song DNA</span>
                {onRetry && hasErrors && (
                  <button
                    onClick={onRetry}
                    className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-primary transition-colors"
                  >
                    <RefreshCw size={10} />
                    Test Again
                  </button>
                )}
              </div>

              {meaning && (
                <div className="glass-card rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    <Sparkles size={10} />
                    Meaning
                  </div>
                  {meaning.theme && <p className="text-sm font-semibold text-foreground">{meaning.theme}</p>}
                  {meaning.narrative && <p className="text-xs text-muted-foreground leading-relaxed">{meaning.narrative}</p>}
                  {meaning.emotions && Array.isArray(meaning.emotions) && (
                    <div className="flex flex-wrap gap-1">
                      {meaning.emotions.map((e: string, i: number) => (
                        <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{e}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(renderData.hook || renderData.secondHook) && (
                <div className="glass-card rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    <Zap size={10} />
                    Hottest Hooks
                  </div>
                  {renderData.hook && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">{renderData.hookLabel || "Hook 1"}</span>
                        <span className="text-[9px] text-muted-foreground">{renderData.hook.start?.toFixed(1)}s – {renderData.hook.end?.toFixed(1)}s</span>
                        {renderData.hook.score && <span className="text-[9px] font-mono text-primary">{renderData.hook.score}%</span>}
                      </div>
                      {renderData.hookJustification && <p className="text-xs text-muted-foreground leading-relaxed">{renderData.hookJustification}</p>}
                </div>
              )}
              {renderData.secondHook && (
                <div className="space-y-1 pt-1 border-t border-border/20">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-accent/50 text-accent-foreground">{renderData.secondHookLabel || "Hook 2"}</span>
                    <span className="text-[9px] text-muted-foreground">{renderData.secondHook.start?.toFixed(1)}s – {renderData.secondHook.end?.toFixed(1)}s</span>
                  </div>
                  {renderData.secondHookJustification && <p className="text-xs text-muted-foreground leading-relaxed">{renderData.secondHookJustification}</p>}
                </div>
              )}

              {/* CrowdFit Battle button */}
              {hasBattle && (
                battlePublishedUrl ? (
                  <a
                    href={battlePublishedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors border rounded-lg py-2 text-foreground hover:text-primary border-border/40 hover:border-primary/40 mt-2"
                  >
                    <Zap size={10} />
                    VIEW BATTLE
                  </a>
                ) : (
                  <button
                    onClick={handleStartBattle}
                    disabled={battleDisabled}
                    className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors border rounded-lg py-2 disabled:opacity-50 text-foreground hover:text-primary border-border/40 hover:border-primary/40 mt-2"
                  >
                    {battlePublishing ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 size={10} className="animate-spin" />
                        PUBLISHING…
                      </span>
                    ) : (
                      <>
                        <Zap size={10} />
                        START CROWDFIT BATTLE
                      </>
                    )}
                  </button>
                )
              )}
                </div>
              )}

              {/* Visual system info now shown via Cinematic Direction card below */}

              {cinematicDirection && (
                <CinematicDirectionCard
                  cinematicDirection={cinematicDirection}
                  songTitle={lyricData.title}
                  userId={user?.id || ""}
                  projectId={savedId}
                  onImageGenerationStatusChange={onImageGenerationStatusChange}
                />
              )}

              {beatGrid && (
                <div className="glass-card rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    <Music size={10} />
                    Rhythm
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">{beatGrid.bpm.toFixed(0)} BPM</span>
                    <span className="text-[10px] text-muted-foreground">{Math.round((beatGrid.confidence ?? 0) * 100)}% confidence</span>
                    <span className="text-[10px] text-muted-foreground">{beatGrid.beats?.length ?? 0} beats</span>
                  </div>
                </div>
              )}

              {audioSections && audioSections.length > 0 && (
                <div className="glass-card rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    <Zap size={10} />
                    Sections · {audioSections.length}
                  </div>
                  <div className="space-y-1.5">
                    {audioSections.map((s) => (
                      <div key={s.index} className="flex items-start gap-2">
                        <span className="text-[9px] font-mono text-primary/70 mt-0.5 whitespace-nowrap w-16 shrink-0">
                          {formatTime(s.startSec)}–{formatTime(s.endSec)}
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                          {s.role}
                        </span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="w-12 h-1.5 rounded-full bg-secondary overflow-hidden shrink-0" title={`Energy: ${Math.round(s.avgEnergy * 100)}%`}>
                            <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.round(s.avgEnergy * 100)}%` }} />
                          </div>
                          <span className="text-[8px] text-muted-foreground/60 truncate">
                            {s.spectralCharacter} · {s.beatDensity.toFixed(1)}b/s
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dance buttons */}
          {publishedUrl && !danceNeedsRegeneration ? (
            <div className="flex gap-2">
              <a
                href={publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center text-sm font-semibold tracking-wide uppercase transition-colors border rounded-xl py-3 text-foreground hover:text-primary border-border/40 hover:border-primary/40"
              >
                Watch Dance
              </a>
              <button
                onClick={handleDance}
                disabled={republishDisabled || !danceNeedsRegeneration}
                className="flex-1 flex items-center justify-center text-sm font-semibold tracking-wide uppercase transition-colors border rounded-xl py-3 disabled:opacity-40 disabled:cursor-not-allowed text-foreground hover:text-primary border-border/40 hover:border-primary/40"
              >
                {publishing ? <Loader2 size={14} className="animate-spin" /> : "Republish"}
              </button>
            </div>
          ) : (
            <button
              onClick={handleDance}
              disabled={danceDisabled}
              className="w-full flex items-center justify-center text-sm font-semibold tracking-wide uppercase transition-colors border rounded-xl py-3 disabled:opacity-40 disabled:cursor-not-allowed text-foreground hover:text-primary border-border/40 hover:border-primary/40"
            >
              {publishing ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  <span>{publishStatus || "Publishing…"}</span>
                </span>
              ) : (
                publishedUrl ? "Regenerate Dance" : "Dance"
              )}
            </button>
          )}
        </div>
    </div>
  );
}
