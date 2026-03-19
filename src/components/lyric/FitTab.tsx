/* cache-bust: 2026-03-05-V1 */
/**
 * FitTab — Displays analysis results with waveform + beat markers.
 * Centered single-column layout for readability.
 * Pipeline runs in LyricFitTab parent.
 * v2: removed lyrics column, single-column report.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Loader2, RefreshCw, Music, Sparkles, Eye, Zap, Image, ExternalLink, Download, Link, Users, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { slugify } from "@/lib/slugify";
import { getAudioStoragePath } from "@/lib/audioStoragePath";
import { computeAutoPalettesFromUrls } from "@/lib/autoPalette";
import { Button } from "@/components/ui/button";
import { LyricWaveform } from "./LyricWaveform";
import { CustomHookSelector } from "./CustomHookSelector";
import { LyricDanceEmbed } from "@/components/lyric/LyricDanceEmbed";
import { FitExportModal } from "./FitExportModal";

import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import type { WaveformData } from "@/hooks/useAudioEngine";
import type { LyricLine, LyricData, LyricHook, SavedCustomHook } from "./LyricDisplay";
import type { BeatGridData } from "@/hooks/useBeatGrid";
// FrameRenderState import removed — V3 derives from cinematicDirection
import type { HeaderProjectSetter } from "./LyricsTab";
import type { GenerationStatus, PipelineStages } from "./LyricFitTab";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";

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
  parentWaveform?: WaveformData | null;
  hasRealAudio: boolean;
  savedId: string | null;
  renderData: any | null;
  setRenderData: (d: any) => void;
  beatGrid: BeatGridData | null;
  setBeatGrid: (g: BeatGridData | null) => void;
  cinematicDirection: any | null;
  setCinematicDirection: (d: any) => void;
  generationStatus: GenerationStatus;
  words?: Array<{ word: string; start: number; end: number }> | null;
  onRetry?: () => void;
  onHeaderProject?: HeaderProjectSetter;
  onBack?: () => void;
  onImageGenerationStatusChange?: (status: "idle" | "running" | "done" | "error") => void;
  pipelineStages?: PipelineStages;
  initialDanceId?: string | null;
  initialDanceUrl?: string | null;
}

export function FitTab({
  lyricData,
  audioFile,
  parentWaveform,
  hasRealAudio,
  savedId,
  renderData,
  setRenderData,
  beatGrid,
  setBeatGrid,
  cinematicDirection,
  setCinematicDirection,
  generationStatus,
  words,
  onRetry,
  onHeaderProject,
  onBack,
  onImageGenerationStatusChange,
  pipelineStages: pipelineStagesProp,
  initialDanceId,
  initialDanceUrl,
}: Props) {
  const { user } = useAuth();
  
  const defaultStages: PipelineStages = { rhythm: "pending", sections: "pending", cinematic: "pending", transcript: "pending" };
  const pipelineStages = pipelineStagesProp ?? defaultStages;
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState("");
  const [publishedUrl, setPublishedUrl] = useState<string | null>(initialDanceUrl ?? null);
  const [publishedDanceId, setPublishedDanceId] = useState<string | null>(initialDanceId ?? null);

  // Sync dance ID/URL from parent when pipeline resolves after mount.
  // useState only reads initialDanceId on mount — this effect picks up later updates.
  useEffect(() => {
    if (initialDanceId && initialDanceId !== publishedDanceId) {
      setPublishedDanceId(initialDanceId);
    }
  }, [initialDanceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialDanceUrl && initialDanceUrl !== publishedUrl) {
      setPublishedUrl(initialDanceUrl);
    }
  }, [initialDanceUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const [publishedLyricsHash, setPublishedLyricsHash] = useState<string | null>(null);
  const [prefetchedDanceData, setPrefetchedDanceData] = useState<LyricDanceData | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const dancePlayerRef = useRef<any>(null);
  const siteCopy = useSiteCopy();
  const hottestHooksEnabled = siteCopy.features?.hookfit_hottest_hooks !== false;

  const [sectionImages, setSectionImages] = useState<(string | null)[]>([]);
  const [sectionImagesError, setSectionImagesError] = useState<string | null>(null);
  const [sectionImagesGenerating, setSectionImagesGenerating] = useState(false);
  const [sectionImagesProgress, setSectionImagesProgress] = useState<{ done: number; total: number } | null>(null);


  // Prefetch dance data as soon as we know the ID — so the player is instant

  useEffect(() => {
    if (!publishedDanceId) { setPrefetchedDanceData(null); return; }
    supabase
      .from("shareable_lyric_dances" as any)
      .select(LYRIC_DANCE_COLUMNS)
      .eq("id", publishedDanceId)
      .maybeSingle()
      .then(({ data: row }) => {
        if (row) setPrefetchedDanceData(row as any as LyricDanceData);
      });
  }, [publishedDanceId]);

  // ── CrowdFit publish state ─────────────────────────────────────────
  const [crowdfitPostId, setCrowdfitPostId] = useState<string | null>(null);
  const [crowdfitToggling, setCrowdfitToggling] = useState(false);

  // ── Battle publish state ──────────────────────────────────────────────
  const [battlePublishing, setBattlePublishing] = useState(false);
  const [battlePublishedUrl, setBattlePublishedUrl] = useState<string | null>(null);
  // Which hook slot is in "editing" mode: null | 0 | 1
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  // User overrides per slot — null means "use AI hook"
  const [customHooks, setCustomHooks] = useState<[SavedCustomHook | null, SavedCustomHook | null]>([null, null]);
  const [hookClipProgress, setHookClipProgress] = useState(0);
  const hookClipProgressRafRef = useRef<number | null>(null);
  const hookLoopRegionRef = useRef<{ start: number; end: number } | null>(null);
  const [activeCustomHookIndex, setActiveCustomHookIndex] = useState<number | null>(null);

  const hookAudioRef = useRef<HTMLAudioElement>(null);
  const hookAudioUrl = useMemo(
    () => (audioFile ? URL.createObjectURL(audioFile) : ""),
    [audioFile],
  );
  useEffect(() => {
    return () => {
      if (hookAudioUrl) URL.revokeObjectURL(hookAudioUrl);
    };
  }, [hookAudioUrl]);

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
      .select("id, artist_slug, song_slug, lyrics")
      .eq("user_id", user.id)
      .eq("song_slug", songSlug)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          setPublishedUrl(`/${data.artist_slug}/${data.song_slug}/lyric-dance`);
          setPublishedDanceId(data.id);
          const pubLines = Array.isArray(data.lyrics) ? data.lyrics : [];
          setPublishedLyricsHash(computeLyricsHash(pubLines));
        }
      });
  }, [user, lyricData, computeLyricsHash]);

  // Check for existing battle when we know user + song
  useEffect(() => {
    if (!user || !lyricData) return;
    const songSlug = slugify(lyricData.title || "untitled");
    if (!songSlug) return;

    supabase
      .from("shareable_hooks" as any)
      .select("artist_slug, song_slug, hook_slug, battle_id")
      .eq("user_id", user.id)
      .eq("song_slug", songSlug)
      .eq("battle_position", 1)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.battle_id && data.hook_slug) {
          setBattlePublishedUrl(`/${data.artist_slug}/${data.song_slug}/${data.hook_slug}`);
        }
      });
  }, [user, lyricData]);

  // Check for existing CrowdFit post when we know the dance ID
  useEffect(() => {
    if (!publishedDanceId || !user) { setCrowdfitPostId(null); return; }
    supabase
      .from("songfit_posts" as any)
      .select("id, status")
      .eq("user_id", user.id)
      .eq("lyric_dance_id", publishedDanceId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data && data.status !== "removed") {
          setCrowdfitPostId(data.id);
        } else {
          setCrowdfitPostId(null);
        }
      });
  }, [publishedDanceId, user]);

  // CrowdFit toggle handler
  const handleCrowdfitToggle = useCallback(async () => {
    if (!user || !publishedDanceId || !publishedUrl || crowdfitToggling) return;
    setCrowdfitToggling(true);
    try {
      if (crowdfitPostId) {
        // Remove from CrowdFit
        await supabase
          .from("songfit_posts" as any)
          .update({ status: "removed" })
          .eq("id", crowdfitPostId);
        setCrowdfitPostId(null);
        toast.success("Removed from CrowdFit");
      } else {
        // Check for existing removed post to reactivate
        const { data: existing }: any = await supabase
          .from("songfit_posts" as any)
          .select("id")
          .eq("user_id", user.id)
          .eq("lyric_dance_id", publishedDanceId)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("songfit_posts" as any)
            .update({ status: "live" })
            .eq("id", existing.id);
          setCrowdfitPostId(existing.id);
        } else {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 21);
          const { data: inserted }: any = await supabase
            .from("songfit_posts" as any)
            .insert({
              user_id: user.id,
              track_title: lyricData.title || "Untitled",
              caption: "",
              lyric_dance_url: publishedUrl,
              lyric_dance_id: publishedDanceId,
              spotify_track_url: null,
              spotify_track_id: null,
              album_art_url: null,
              tags_json: [],
              track_artists_json: [],
              status: "live",
              submitted_at: new Date().toISOString(),
              expires_at: expiresAt.toISOString(),
            })
            .select("id")
            .single();
          if (inserted) setCrowdfitPostId(inserted.id);
        }
        window.dispatchEvent(new Event("songfit:dance-published"));
        toast.success("Published to CrowdFit!");
      }
    } catch (e: any) {
      toast.error(e.message || "CrowdFit toggle failed");
    } finally {
      setCrowdfitToggling(false);
    }
  }, [user, publishedDanceId, publishedUrl, crowdfitPostId, crowdfitToggling, lyricData.title]);

  // ── Audio playback + waveform ─────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [waveform, setWaveform] = useState<WaveformData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const parentWaveformRef = useRef(parentWaveform);
  parentWaveformRef.current = parentWaveform;

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

    // Only decode locally if parent didn't provide waveform
    if (!parentWaveformRef.current) {
      const ctx = new AudioContext();
      audioFile.arrayBuffer().then((ab) => {
        ctx.decodeAudioData(ab).then((buf) => {
          setWaveform({ peaks: extractPeaks(buf, PEAK_SAMPLES), duration: buf.duration });
          ctx.close();
        });
      }).catch(() => {});
    }

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      URL.revokeObjectURL(url);
      audioRef.current = null;
    };
    // parentWaveform intentionally read from ref — avoids re-creating Audio + blob on waveform updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const rightContent = onRetry ? (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            onRetry();
          }}
          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
        >
          <RefreshCw size={12} />
          Regenerate
        </button>
      </div>
    ) : undefined;
    onHeaderProject({ title, onBack: onBack ?? (() => {}), rightContent });
    return () => onHeaderProject(null);
  }, [lyricData.title, audioFile.name, onHeaderProject, onBack, onRetry]);
// CinematicDirectionCard extracted to top-level — see below FitTab

  // ── Live transcript sync ──────────────────────────────────────────────
  // FitTab stays mounted (hidden) while the user edits in LyricsTab.
  // lyricData.lines is live shared state — just watch it and push to the
  // player whenever it changes. No DB comparison needed.
  const transcriptSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linesRef = useRef(lyricData?.lines);
  const wordsRef = useRef(words);
  linesRef.current = lyricData?.lines;
  wordsRef.current = words;

  const transcriptInitRef = useRef(false);
  useEffect(() => {
    if (!lyricData?.lines) {
      
      return;
    }

    // Skip first fire — player initializes from prefetchedData already containing these lines
    if (!transcriptInitRef.current) {
      transcriptInitRef.current = true;
      
      return;
    }

    

    if (transcriptSyncTimerRef.current) clearTimeout(transcriptSyncTimerRef.current);
    transcriptSyncTimerRef.current = setTimeout(() => {
      const handle = dancePlayerRef.current;
      if (!handle) {
        return;
      }
      const mainLines = (linesRef.current || []).filter((l: any) => l.tag !== "adlib");
      void handle.reloadTranscript?.(mainLines, wordsRef.current ?? undefined);
    }, 300);

    return () => { if (transcriptSyncTimerRef.current) clearTimeout(transcriptSyncTimerRef.current); };
  }, [lyricData?.lines, words]);

  // ── Auto-save lyrics edits back to DB ────────────────────────────────
  // The canvas preview now updates live, but `shareable_lyric_dances` still
  // holds the old lyrics. Without writing back, page reload and the shareable
  // link always show the original Whisper transcription.
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveInitRef = useRef(false);
  const publishedDanceIdRef = useRef(publishedDanceId);
  publishedDanceIdRef.current = publishedDanceId;

  useEffect(() => {
    if (!lyricData?.lines) return;
    // Skip first fire (same pattern as transcript sync — these are the lines we loaded from)
    if (!autoSaveInitRef.current) { autoSaveInitRef.current = true; return; }
    // Nothing to save to if no dance is published yet
    if (!publishedDanceIdRef.current) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      const danceId = publishedDanceIdRef.current;
      if (!danceId) return;
      const mainLines = (linesRef.current || []).filter((l: any) => l.tag !== 'adlib');

      // Use the reconciled words from the player engine — updateTranscript() maps
      // edited line text back onto word timestamp slots. Those reconciled words
      // are what compileScene actually renders on the shareable page.
      // Fall back to raw Whisper words if player isn't ready yet.
      const reconciledWords = wordsRef.current ?? null;

      const { error } = await supabase
        .from('shareable_lyric_dances' as any)
        .update({ lyrics: mainLines, words: reconciledWords })
        .eq('id', danceId);
      if (error) {
        // auto-save failed silently
      }
    }, 1500); // 1.5s debounce — wait for user to stop typing

    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [lyricData?.lines, words]);

  const handleDance = useCallback(async () => {
    
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
          // auto palette precompute failed (non-blocking)
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
          beat_grid: beatGrid ? { bpm: beatGrid.bpm, beats: beatGrid.beats, confidence: beatGrid.confidence } : { bpm: 0, beats: [], confidence: 0 },
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
      setPublishedDanceId(danceRow?.id ?? null);
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
        } catch (e: any) {
          // CrowdFit auto-post failed (non-blocking)
        }
      })();
    } catch (e: any) {
      
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
    const activeHook0 = customHooks[0] ?? renderData?.hook;
    const activeHook1 = customHooks[1] ?? renderData?.secondHook;
    if (!activeHook0 || !activeHook1 || !audioFile || !lyricData) return;
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

      const hookSlug = deriveHookSlug(activeHook0);

      if (!artistSlug || !songSlug || !hookSlug) {
        toast.error("Couldn't generate a valid URL — check song/artist name");
        setBattlePublishing(false);
        return;
      }

      // Check for existing hook to reuse audio_url and battle_id
      const { data: existingHook }: any = await supabase
        .from("shareable_hooks" as any)
        .select("audio_url, battle_id")
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

      // Reuse existing battle_id if hooks were previously published (prevents orphaned hookfit_posts)
      const battleId = existingHook?.battle_id || crypto.randomUUID();
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
        .upsert(buildHookPayload(activeHook0, hookSlug, 1, renderData.hookLabel || null), { onConflict: "artist_slug,song_slug,hook_slug" });
      if (e1) throw e1;

      // Upsert hook 2
      const secondHookSlug = deriveHookSlug(activeHook1);
      const { error: e2 } = await supabase
        .from("shareable_hooks" as any)
        .upsert(buildHookPayload(activeHook1, secondHookSlug || `${hookSlug}-2`, 2, renderData.secondHookLabel || null), { onConflict: "artist_slug,song_slug,hook_slug" });
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
  }, [user, battlePublishing, customHooks, renderData, audioFile, lyricData, beatGrid]);

  const allReady =
    generationStatus.beatGrid === "done" &&
    generationStatus.renderData === "done" &&
    generationStatus.cinematicDirection === "done";
  const hasErrors = Object.values(generationStatus).includes("error");
  const danceDisabled = !cinematicDirection || publishing || !allReady;
  // Republish only needs auth + not currently publishing (data already exists on server)
  const republishDisabled = publishing;

  // ── Sections derived from renderData ─────────────────────────────────────
  const meaning = renderData?.meaning;

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <audio ref={hookAudioRef} src={hookAudioUrl} style={{ display: "none" }} />
      <div className="flex-1 px-4 py-6 space-y-4 max-w-2xl mx-auto">
      {/* Dance preview or waveform fallback */}
      {publishedUrl && publishedDanceId ? (
        <div className="space-y-3">
          <div className="rounded-xl overflow-hidden w-full aspect-video">
            <LyricDanceEmbed
              lyricDanceId={publishedDanceId}
              lyricDanceUrl={publishedUrl}
              songTitle={lyricData.title || "Untitled"}
              artistName=""
              prefetchedData={prefetchedDanceData}
            />
          </div>
          {/* Action toolbar — single row of icon buttons */}
          <div className="flex items-center justify-center gap-1">
            <a
              href={publishedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase transition-colors border rounded-lg px-3 py-2.5 text-foreground hover:text-primary border-border/40 hover:border-primary/40"
              title="Watch Dance"
            >
              Watch
            </a>
            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase transition-colors border rounded-lg px-3 py-2.5 text-foreground hover:text-primary border-border/40 hover:border-primary/40"
              title="Download"
            >
              Download
            </button>
            <button
              onClick={() => {
                const url = `${window.location.origin}${publishedUrl}`;
                navigator.clipboard.writeText(url).then(() => toast.success("Link copied!"));
              }}
              className="flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase transition-colors border rounded-lg px-3 py-2.5 text-foreground hover:text-primary border-border/40 hover:border-primary/40"
              title="Copy Link"
            >
              Link
            </button>
            <button
              onClick={handleCrowdfitToggle}
              disabled={crowdfitToggling}
              className={`flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase transition-colors border rounded-lg px-3 py-2.5 ${
                crowdfitPostId
                  ? "text-primary border-primary/40 bg-primary/5"
                  : "text-foreground hover:text-primary border-border/40 hover:border-primary/40"
              } disabled:opacity-50`}
              title={crowdfitPostId ? "Remove from CrowdFit" : "Publish to CrowdFit"}
            >
              {crowdfitToggling ? (
                <Loader2 size={14} className="animate-spin" />
              ) : null}
              {crowdfitPostId ? "Live" : "CrowdFit"}
            </button>
          </div>
          <FitExportModal
            isOpen={showExportModal}
            onClose={() => setShowExportModal(false)}
            getPlayer={dancePlayerRef.current ? () => dancePlayerRef.current?.getPlayer() ?? null : null}
            songTitle={lyricData.title || "Untitled"}
            artistName=""
          />
        </div>
      ) : hasRealAudio ? (
        <div className="glass-card rounded-xl p-3">
          <LyricWaveform
            waveform={waveform || parentWaveform || null}
            isPlaying={isPlaying}
            currentTime={currentTime}
            onSeek={handleSeek}
            onTogglePlay={handleTogglePlay}
            beats={beatGrid?.beats ?? null}
            beatGridLoading={false}
          />
        </div>
      ) : null}

      {/* ── Hottest Hooks ── */}
      {(() => {
        if (!hottestHooksEnabled) return null;
        const aiHooks = [renderData?.hook, renderData?.secondHook].filter(Boolean) as LyricHook[];
        if (aiHooks.length === 0) return null;

        const rawLabels = [renderData?.hookLabel, renderData?.secondHookLabel];
        const labelMap: Record<string, string> = { "Main Chorus": "Left Hook", "Outro Hook": "Right Hook" };
        const labels = rawLabels.map(l => (l && labelMap[l]) ? labelMap[l] : l);

        return (
          <div className="glass-card rounded-xl p-4 border border-border/30 space-y-3">
            <div className="flex items-center gap-1.5">
              <Zap size={11} className="text-primary" />
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                HOTTEST HOOKS
              </span>
            </div>

            {aiHooks.map((aiHook, idx) => {
              const activeHook = customHooks[idx] ?? aiHook;
              const isUserHook = customHooks[idx] !== null;
              const isEditing = editingSlot === idx;

              return (
                <div
                  key={idx}
                  className={idx > 0 ? "pt-3 border-t border-border/20 space-y-2" : "space-y-2"}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/15 text-primary font-semibold">
                        {isUserHook ? "Your Hook" : labels[idx] || `Hook ${idx + 1}`}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {activeHook.start?.toFixed(1)}s – {activeHook.end?.toFixed(1)}s
                      </span>
                    </div>
                    <button
                      onClick={() => setEditingSlot(isEditing ? null : idx)}
                      className="text-[10px] font-mono text-primary/70 hover:text-primary underline underline-offset-2 transition-colors"
                    >
                      {isEditing ? "Cancel" : "Change"}
                    </button>
                  </div>

                  {!isUserHook && activeHook.previewText && (
                    <p className="text-xs text-muted-foreground leading-relaxed italic">
                      &ldquo;{activeHook.previewText}&rdquo;
                    </p>
                  )}

                  {isUserHook && customHooks[idx]?.previewText && (
                    <p className="text-xs text-muted-foreground leading-relaxed italic">
                      "{customHooks[idx]!.previewText}"
                    </p>
                  )}

                  {isEditing && (
                    <div className="mt-2 rounded-lg border border-border/40 bg-background/20 p-2">
                      <CustomHookSelector
                        lines={lyricData.lines}
                        aiHooks={aiHooks}
                        audioRef={hookAudioRef}
                        loopRegionRef={hookLoopRegionRef}
                        activeHookIndex={
                          activeCustomHookIndex !== null ? activeCustomHookIndex + 100 : null
                        }
                        setActiveHookIndex={(i) => {
                          setActiveCustomHookIndex(i === null ? null : i - 100);
                        }}
                        clipProgress={hookClipProgress}
                        setClipProgress={setHookClipProgress}
                        clipProgressRafRef={hookClipProgressRafRef}
                        setIsPlaying={() => {}}
                        onSaveHook={(hook) => {
                          const colors = ["#f59e0b", "#10b981", "#8b5cf6"];
                          const saved: SavedCustomHook = {
                            ...hook,
                            color: colors[idx] ?? "#f59e0b",
                          };
                          setCustomHooks((prev) => {
                            const next: [SavedCustomHook | null, SavedCustomHook | null] = [...prev] as [SavedCustomHook | null, SavedCustomHook | null];
                            next[idx] = saved;
                            return next;
                          });
                          setEditingSlot(null);
                        }}
                        savedCustomHooks={customHooks.filter(Boolean) as SavedCustomHook[]}
                        onRemoveHook={() => {}}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {aiHooks.length === 2 && (
              <div className="pt-1">
                {battlePublishedUrl ? (
                  <a
                    href={battlePublishedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors border rounded-lg py-2 text-foreground hover:text-primary border-border/40 hover:border-primary/40"
                  >
                    <Zap size={10} /> VIEW BATTLE
                  </a>
                ) : (
                  <button
                    onClick={handleStartBattle}
                    disabled={!allReady || battlePublishing || aiHooks.length !== 2}
                    className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors border rounded-lg py-2 text-foreground hover:text-primary border-border/40 hover:border-primary/40 disabled:opacity-50"
                  >
                    <Zap size={10} />
                    {battlePublishing ? "Publishing..." : "START HOOK BATTLE"}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}

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
                  {(meaning.summary || meaning.narrative) && <p className="text-xs text-muted-foreground leading-relaxed">{meaning.summary || meaning.narrative}</p>}
                  {Array.isArray(meaning.imagery || meaning.emotions) && (meaning.imagery || meaning.emotions).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(meaning.imagery || meaning.emotions).map((e: string, i: number) => (
                        <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{e}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}



              {cinematicDirection?.sections && Array.isArray(cinematicDirection.sections) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                      <Eye size={10} />
                      Scenes
                    </div>
                    {Array.isArray(cinematicDirection.sections) && cinematicDirection.sections.length > 0 && (
                      <button
                        onClick={() => void window.dispatchEvent(new Event("fittab:regenerate-images"))}
                        disabled={sectionImagesGenerating}
                        className="text-[9px] font-mono text-primary hover:text-primary/80 transition-colors flex items-center gap-1 disabled:opacity-40"
                      >
                        {sectionImagesGenerating ? (
                          <>
                            <Loader2 size={9} className="animate-spin" />
                            {sectionImagesProgress ? `${sectionImagesProgress.done}/${sectionImagesProgress.total}` : "Generating…"}
                          </>
                        ) : sectionImagesError ? (
                          <>
                            <RefreshCw size={9} />
                            Retry Images
                          </>
                        ) : sectionImages.length > 0 ? (
                          <>
                            <Image size={9} />
                            Regenerate Images
                          </>
                        ) : (
                          <>
                            <Image size={9} />
                            Generate Images
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {cinematicDirection.sections.map((section: any, i: number) => {
                    const imageUrl = sectionImages[i] || null;
                    return (
                      <div key={section.sectionIndex ?? i} className="glass-card rounded-lg p-2.5 flex gap-3 items-start">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={section.structuralLabel || `Section ${i + 1}`}
                            className="w-16 h-16 rounded-md object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-md bg-white/5 shrink-0 flex items-center justify-center">
                            <Image size={14} className="text-muted-foreground/30" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">
                              {section.structuralLabel || `Section ${i + 1}`}
                            </span>
                            {section.visualMood && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                {section.visualMood}
                              </span>
                            )}
                          </div>
                          {section.description && (
                            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                              {section.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {cinematicDirection && (
                <CinematicDirectionCard
                  cinematicDirection={cinematicDirection}
                  songTitle={lyricData.title}
                  userId={user?.id || ""}
                  projectId={savedId}
                  onImageGenerationStatusChange={onImageGenerationStatusChange}
                  audioFile={audioFile}
                  beatGrid={beatGrid}
                  words={words ?? null}
                  lyricData={lyricData}
                  sectionImages={sectionImages}
                  setSectionImages={setSectionImages}
                  setSectionImagesError={setSectionImagesError}
                  setSectionImagesGenerating={setSectionImagesGenerating}
                  setSectionImagesProgress={setSectionImagesProgress}
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

            </div>
          )}

          {/* Dance button — only shown when no dance exists yet (buttons moved to top when dance exists) */}
          {!publishedDanceId && (
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
    </>
  );
}

// ── Cinematic Direction Card with Section Images ─────────────────────
// Extracted to top-level to prevent remount on every FitTab render.
function CinematicDirectionCard({
  cinematicDirection,
  songTitle,
  userId,
  projectId,
  onImageGenerationStatusChange,
  audioFile,
  beatGrid,
  words,
  lyricData,
  sectionImages,
  setSectionImages,
  setSectionImagesError,
  setSectionImagesGenerating,
  setSectionImagesProgress,
}: {
  cinematicDirection: any;
  songTitle: string;
  userId: string;
  projectId: string | null;
  onImageGenerationStatusChange?: (status: "idle" | "running" | "done" | "error") => void;
  audioFile: File;
  beatGrid: BeatGridData | null;
  words: Array<{ word: string; start: number; end: number }> | null;
  lyricData: LyricData;
  sectionImages: (string | null)[];
  setSectionImages: (images: (string | null)[]) => void;
  setSectionImagesError: (error: string | null) => void;
  setSectionImagesGenerating: (generating: boolean) => void;
  setSectionImagesProgress: (progress: { done: number; total: number } | null) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState<{ done: number; total: number } | null>(null);
  const [imageTimestamps, setImageTimestamps] = useState<(string | null)[]>([]);
  const [danceId, setDanceId] = useState<string | null>(null);
  const [imagesHydrated, setImagesHydrated] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // autoImageTriggered ref removed — auto-trigger now lives in LyricFitTab pipeline

  useEffect(() => {
    setSectionImagesGenerating(generating);
  }, [generating, setSectionImagesGenerating]);

  useEffect(() => {
    setSectionImagesError(generationError);
  }, [generationError, setSectionImagesError]);

  useEffect(() => {
    setSectionImagesProgress(genProgress);
  }, [genProgress, setSectionImagesProgress]);

  const sections: any[] = cinematicDirection.sections && Array.isArray(cinematicDirection.sections)
    ? cinematicDirection.sections
    : [];

  const formatImageTimestamp = useCallback((raw: unknown): string | null => {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      if (raw <= 0) return "just now";
      return `${raw.toFixed(1)}s`;
    }
    if (typeof raw === "string") {
      const normalized = raw.trim();
      if (!normalized) return null;
      if (normalized === "0" || normalized === "0.0" || normalized === "0s") return "just now";
      if (/^\d+(\.\d+)?$/.test(normalized)) return `${normalized}s`;
      return normalized;
    }
    return null;
  }, []);

  const songSlug = slugify(songTitle || "untitled");

  // Auto-load existing section images — first from saved_lyrics (projectId),
  // then fall back to shareable_lyric_dances (published dance row)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId || cancelled) return;

      // 1. Try saved_lyrics first (project-level persistence)
      if (projectId) {
        const { data: lyricRow }: any = await supabase
          .from("saved_lyrics")
          .select("section_images")
          .eq("id", projectId)
          .maybeSingle();
        if (cancelled) return;
        const savedImgs = lyricRow?.section_images;
        if (Array.isArray(savedImgs) && savedImgs.length > 0 && savedImgs.some(Boolean)) {
          setSectionImages(savedImgs);
          setImageTimestamps(Array.from({ length: savedImgs.length }, () => null));
          setImagesHydrated(true);
          return;
        }
      }

      // 2. Fallback: shareable_lyric_dances (published dance)
      const { data: dances }: any = await supabase
        .from("shareable_lyric_dances" as any)
        .select("id, section_images")
        .eq("user_id", userId)
        .eq("song_slug", songSlug)
        .order("created_at", { ascending: false })
        .limit(1);

      if (cancelled) return;
      if (!dances?.[0]) {
        setImagesHydrated(true);
        return;
      }
      setDanceId(dances[0].id);

      const imgs = dances[0].section_images;
      if (Array.isArray(imgs) && imgs.length > 0 && imgs.some(Boolean)) {
        setSectionImages(imgs);
        setImageTimestamps(Array.from({ length: imgs.length }, () => null));
      }
      setImagesHydrated(true);
    })();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [songSlug, sections.length, userId, projectId]);

  // Listen for dance-published event to refresh images
  useEffect(() => {
    const handler = () => {
      setSectionImages([]);
      setGenerating(true);
      setGenProgress({ done: 0, total: sections.length });
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        if (!userId) return;
        const { data: dances }: any = await supabase
          .from("shareable_lyric_dances" as any)
          .select("id, section_images")
          .eq("user_id", userId)
          .eq("song_slug", songSlug)
          .limit(1);
        if (!dances?.[0]) return;
        setDanceId(dances[0].id);
        const imgs = dances[0].section_images;
        if (Array.isArray(imgs) && imgs.some(Boolean)) {
          setSectionImages(imgs);
          setImageTimestamps(Array.from({ length: imgs.length }, () => null));
          setGenProgress({ done: imgs.filter(Boolean).length, total: sections.length });
          setGenerating(false);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 3000);
      setTimeout(() => {
        if (pollRef.current) { clearInterval(pollRef.current); setGenerating(false); }
      }, 120_000);
    };
    window.addEventListener("songfit:dance-published", handler);
    return () => {
      window.removeEventListener("songfit:dance-published", handler);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sections.length, userId, songSlug]);

  // Ensure or create a draft dance row for image generation
  const ensureDanceId = useCallback(async (): Promise<string | null> => {
    if (danceId) return danceId;
    if (!userId) return null;

    // Try to find existing
    const { data: existing }: any = await supabase
      .from("shareable_lyric_dances" as any)
      .select("id")
      .eq("user_id", userId)
      .eq("song_slug", songSlug)
      .maybeSingle();
    if (existing?.id) {
      setDanceId(existing.id);
      return existing.id;
    }

    // Create a draft row with minimal data so edge function can read cinematic_direction
    const displayName = "artist";
    const artistSlug = slugify(displayName);

    // Upload audio for the draft row
    const storagePath = projectId
      ? getAudioStoragePath(userId, projectId, audioFile.name)
      : `${userId}/${artistSlug}/${songSlug}/lyric-dance.${audioFile.name.split(".").pop() || "webm"}`;
    await supabase.storage
      .from("audio-clips")
      .upload(storagePath, audioFile, { upsert: true, contentType: audioFile.type || undefined });
    const { data: urlData } = supabase.storage.from("audio-clips").getPublicUrl(storagePath);
    const audioUrl = urlData.publicUrl;

    const mainLines = lyricData.lines.filter((l) => l.tag !== "adlib");
    const { error: insertError } = await supabase
      .from("shareable_lyric_dances" as any)
      .upsert({
        user_id: userId,
        artist_slug: artistSlug,
        song_slug: songSlug,
        artist_name: displayName,
        song_name: lyricData.title || "Untitled",
        audio_url: audioUrl,
        lyrics: mainLines,
        cinematic_direction: cinematicDirection || null,
        words: words ?? null,
        beat_grid: beatGrid ? { bpm: beatGrid.bpm, beats: beatGrid.beats, confidence: beatGrid.confidence } : {},
        palette: cinematicDirection?.palette || ["#ffffff", "#a855f7", "#ec4899"],
        section_images: null,
      }, { onConflict: "artist_slug,song_slug" });

    if (insertError) {
      console.error("[FitTab Debug] draft dance row creation failed:", insertError.message);
      return null;
    }

    const { data: newRow }: any = await supabase
      .from("shareable_lyric_dances" as any)
      .select("id")
      .eq("user_id", userId)
      .eq("song_slug", songSlug)
      .maybeSingle();

    if (newRow?.id) {
      setDanceId(newRow.id);
      return newRow.id;
    }
    return null;
  }, [danceId, userId, songSlug, audioFile, beatGrid, cinematicDirection, lyricData, projectId, words]);

  const handleGenerateImages = useCallback(async () => {
    if (generating || !sections.length) return;

    const resolvedDanceId = await ensureDanceId();
    if (!resolvedDanceId) {
      toast.error("Could not create dance row for image generation");
      onImageGenerationStatusChange?.("error");
      return;
    }

    setGenerationError(null);
    setGenerating(true);
    onImageGenerationStatusChange?.("running");
    setGenProgress({ done: 0, total: sections.length });
    try {
      const { data: result, error } = await supabase.functions.invoke("generate-section-images", {
        body: { lyric_dance_id: resolvedDanceId, force: true },
      });
      if (error) throw error;
      const urls = result?.urls || result?.section_images || [];
      const timingCandidates = result?.image_timestamps || result?.timings || result?.durations || [];
      const normalizedTimestamps = Array.from({ length: urls.length }, (_, idx) => formatImageTimestamp(timingCandidates[idx]));
      setSectionImages(urls);
      setImageTimestamps(normalizedTimestamps);
      setGenProgress({ done: urls.filter(Boolean).length, total: sections.length });
      onImageGenerationStatusChange?.("done");

      // Persist to saved_lyrics so images survive tab switches / remounts
      if (projectId && urls.length > 0) {
        void supabase
          .from("saved_lyrics")
          .update({ section_images: urls as any })
          .eq("id", projectId);
      }

      toast.success(`Generated ${urls.filter(Boolean).length}/${sections.length} section images`);
    } catch (e: any) {
      console.error("[SectionImages] Error:", e);
      setGenerationError(e?.message || "Failed to generate section images");
      onImageGenerationStatusChange?.("error");
      toast.error(e?.message || "Failed to generate section images");
    } finally {
      setGenerating(false);
    }
  }, [ensureDanceId, formatImageTimestamp, generating, onImageGenerationStatusChange, projectId, sections]);

  useEffect(() => {
    const handler = () => {
      void handleGenerateImages();
    };
    window.addEventListener("fittab:regenerate-images", handler);
    return () => window.removeEventListener("fittab:regenerate-images", handler);
  }, [handleGenerateImages]);

  // Image generation is now auto-triggered by the pipeline in LyricFitTab.
  // CinematicDirectionCard only provides the manual "Regenerate" button.

  return null;
}
