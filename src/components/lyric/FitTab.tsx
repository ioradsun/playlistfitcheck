/* cache-bust: 2026-03-05-V1 */
/**
 * FitTab — Displays analysis results with waveform + beat markers.
 * Centered single-column layout for readability.
 * Pipeline runs in LyricFitTab parent.
 * v2: removed lyrics column, single-column report.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Loader2,
  RefreshCw,
  Music,
  Sparkles,
  Eye,
  Zap,
  Image,
  ExternalLink,
  Download,
  Link,
  Users,
  Check,
  Circle,
  Copy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { slugify } from "@/lib/slugify";
import { getAudioStoragePath } from "@/lib/audioStoragePath";
import { computeAutoPalettesFromUrls } from "@/lib/autoPalette";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { LyricWaveform } from "./LyricWaveform";
import { HookWaveformPicker } from "./HookWaveformPicker";
import { LyricDanceEmbed } from "@/components/lyric/LyricDanceEmbed";
import { FitExportModal } from "./FitExportModal";

import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import type { WaveformData } from "@/hooks/useAudioEngine";
import type {
  LyricLine,
  LyricData,
  LyricHook,
  SavedCustomHook,
} from "./LyricDisplay";
import type { BeatGridData } from "@/hooks/useBeatGrid";
// FrameRenderState import removed — V3 derives from cinematicDirection
import type { HeaderProjectSetter } from "./LyricsTab";
import type { GenerationStatus, PipelineStages } from "./LyricFitTab";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import { buildShareUrl, parseLyricDanceUrl } from "@/lib/shareUrl";
import { useVoteGate } from "@/hooks/useVoteGate";
import { derivePaletteFromDirection } from "@/lib/lyricPalette";
import { invokeWithTimeout } from "@/lib/invokeWithTimeout";
import type { UseLyricPipelineReturn } from "@/hooks/useLyricPipeline";

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
  pipeline: UseLyricPipelineReturn;
  lyricData: LyricData;
  audioFile: File;
  parentWaveform?: WaveformData | null;
  hasRealAudio: boolean;
  savedId: string | null;
  renderData: any | null;
  beatGrid: BeatGridData | null;
  cinematicDirection: any | null;
  generationStatus: GenerationStatus;
  words?: Array<{ word: string; start: number; end: number }> | null;
  onHeaderProject?: HeaderProjectSetter;
  onBack?: () => void;
  pipelineStages?: PipelineStages;
  initialDanceId?: string | null;
  initialDanceUrl?: string | null;
  sectionImageUrls?: (string | null)[];
  sectionImageProgress?: { done: number; total: number } | null;
  sectionImageError?: string | null;
  onTitleChange?: (newTitle: string) => void;
}

export function FitTab({
  pipeline,
  lyricData,
  audioFile,
  parentWaveform,
  hasRealAudio,
  savedId,
  renderData,
  beatGrid,
  cinematicDirection,
  generationStatus,
  words,
  onHeaderProject,
  onBack,
  pipelineStages: pipelineStagesProp,
  initialDanceId,
  initialDanceUrl,
  sectionImageUrls = [],
  sectionImageProgress = null,
  sectionImageError = null,
  onTitleChange,
}: Props) {
  const { user, profile } = useAuth();
  const { canCreate, credits, required, spendCredits } = useVoteGate();

  const defaultStages: PipelineStages = {
    rhythm: "pending",
    sections: "pending",
    cinematic: "pending",
    transcript: "pending",
  };
  const pipelineStages = pipelineStagesProp ?? defaultStages;
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState("");
  const [publishedUrl, setPublishedUrl] = useState<string | null>(
    initialDanceUrl ?? null,
  );
  const [publishedDanceId, setPublishedDanceId] = useState<string | null>(
    initialDanceId ?? null,
  );

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

  const [publishedLyricsHash, setPublishedLyricsHash] = useState<string | null>(
    null,
  );
  const [prefetchedDanceData, setPrefetchedDanceData] =
    useState<LyricDanceData | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [lightboxScene, setLightboxScene] = useState<{ imageUrl: string; description: string; timestamp: string; visualMood?: string; index: number } | null>(null);
  const dancePlayerRef =
    useRef<import("@/components/lyric/LyricDanceEmbed").LyricDanceEmbedHandle>(
      null,
    );
  const siteCopy = useSiteCopy();
  const hottestHooksEnabled =
    siteCopy.features?.hookfit_hottest_hooks !== false;

  const refetchDanceData = useCallback(() => {
    if (!publishedDanceId) {
      setPrefetchedDanceData(null);
      return;
    }
    supabase
      .from("shareable_lyric_dances" as any)
      .select(LYRIC_DANCE_COLUMNS)
      .eq("id", publishedDanceId)
      .maybeSingle()
      .then(({ data: row }) => {
        if (row) {
          setPrefetchedDanceData(row as any as LyricDanceData);
          const dbImages = (row as any).section_images;
          if (Array.isArray(dbImages) && dbImages.some(Boolean)) {
            pipeline.setSectionImageUrls(dbImages);
            pipeline.setSectionImageProgress({
              done: dbImages.filter(Boolean).length,
              total: dbImages.length,
            });
            if (dbImages.every(Boolean)) {
              pipeline.setGenerationStatus((prev) => ({
                ...prev,
                sectionImages: "done",
              }));
            }
          }
        }
      });
  }, [publishedDanceId, pipeline]);

  // Initial prefetch
  useEffect(() => {
    refetchDanceData();
  }, [refetchDanceData]);

  // ── CrowdFit publish state ─────────────────────────────────────────
  const [crowdfitPostId, setCrowdfitPostId] = useState<string | null>(null);
  const [crowdfitToggling, setCrowdfitToggling] = useState(false);

  // ── Battle publish state ──────────────────────────────────────────────
  const [battlePublishing, setBattlePublishing] = useState(false);
  const [battlePublishedUrl, setBattlePublishedUrl] = useState<string | null>(
    null,
  );
  // User overrides per slot — null means "use AI hook"
  const [customHooks, setCustomHooks] = useState<
    [SavedCustomHook | null, SavedCustomHook | null]
  >([null, null]);
  const [feudSetupOpen, setFeudSetupOpen] = useState(false);
  const [feudTab, setFeudTab] = useState<0 | 1>(0);
  const [hookClipProgress, setHookClipProgress] = useState(0);
  const hookClipProgressRafRef = useRef<number | null>(null);
  const hookLoopRegionRef = useRef<{ start: number; end: number } | null>(null);
  const [activeCustomHookIndex, setActiveCustomHookIndex] = useState<
    number | null
  >(null);

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
    const text = lns
      .filter((l) => l.tag !== "adlib")
      .map((l) => `${l.text}|${l.start}|${l.end}`)
      .join("\n");
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return String(hash);
  }, []);

  const currentLyricsHash = lyricData?.lines
    ? computeLyricsHash(lyricData.lines)
    : null;
  const danceNeedsRegeneration =
    !publishedUrl ||
    (publishedLyricsHash !== null && currentLyricsHash !== publishedLyricsHash);

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
          setBattlePublishedUrl(
            `/${data.artist_slug}/${data.song_slug}/${data.hook_slug}`,
          );
        }
      });
  }, [user, lyricData]);

  // Check for existing CrowdFit post when we know the dance ID
  useEffect(() => {
    if (!publishedDanceId || !user) {
      setCrowdfitPostId(null);
      return;
    }
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
  }, [
    user,
    publishedDanceId,
    publishedUrl,
    crowdfitPostId,
    crowdfitToggling,
    lyricData.title,
  ]);

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
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    // Only decode locally if parent didn't provide waveform
    if (!parentWaveformRef.current) {
      const ctx = new AudioContext();
      audioFile
        .arrayBuffer()
        .then((ab) => {
          ctx.decodeAudioData(ab).then((buf) => {
            setWaveform({
              peaks: extractPeaks(buf, PEAK_SAMPLES),
              duration: buf.duration,
            });
            ctx.close();
          });
        })
        .catch(() => {});
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
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
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
      lyricData.title &&
      lyricData.title !== "Unknown" &&
      lyricData.title !== "Untitled"
        ? lyricData.title
        : audioFile.name.replace(/\.[^.]+$/, "");
    onHeaderProject({ title, onBack: onBack ?? (() => {}), onTitleChange });
    return () => onHeaderProject(null);
  }, [lyricData.title, audioFile.name, onHeaderProject, onBack, onTitleChange]);
  // CinematicDirectionCard extracted to top-level — see below FitTab

  // ── Live transcript sync ──────────────────────────────────────────────
  // FitTab stays mounted (hidden) while the user edits in LyricsTab.
  // lyricData.lines is live shared state — just watch it and push to the
  // player whenever it changes. No DB comparison needed.
  const transcriptSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
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

    if (transcriptSyncTimerRef.current)
      clearTimeout(transcriptSyncTimerRef.current);
    transcriptSyncTimerRef.current = setTimeout(() => {
      const handle = dancePlayerRef.current;
      if (!handle) {
        return;
      }
      const mainLines = (linesRef.current || []).filter(
        (l: any) => l.tag !== "adlib",
      );
      void (handle as any).reloadTranscript?.(
        mainLines,
        wordsRef.current ?? undefined,
      );
    }, 300);

    return () => {
      if (transcriptSyncTimerRef.current)
        clearTimeout(transcriptSyncTimerRef.current);
    };
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
    if (!autoSaveInitRef.current) {
      autoSaveInitRef.current = true;
      return;
    }
    // Nothing to save to if no dance is published yet
    if (!publishedDanceIdRef.current) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      const danceId = publishedDanceIdRef.current;
      if (!danceId) return;
      const mainLines = (linesRef.current || []).filter(
        (l: any) => l.tag !== "adlib",
      );

      // Use the reconciled words from the player engine — updateTranscript() maps
      // edited line text back onto word timestamp slots. Those reconciled words
      // are what compileScene actually renders on the shareable page.
      // Fall back to raw Whisper words if player isn't ready yet.
      const reconciledWords = wordsRef.current ?? null;

      const { error } = await supabase
        .from("shareable_lyric_dances" as any)
        .update({ lyrics: mainLines, words: reconciledWords })
        .eq("id", danceId);
      if (error) {
        // auto-save failed silently
      }
    }, 1500); // 1.5s debounce — wait for user to stop typing

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [lyricData?.lines, words]);

  const handleDance = useCallback(async () => {
    if (!user) {
      toast.error("Sign in to publish your Dance");
      return;
    }
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
          .upload(storagePath, audioFile, {
            upsert: true,
            contentType: audioFile.type || undefined,
          });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("audio-clips")
          .getPublicUrl(storagePath);
        audioUrl = urlData.publicUrl;
      }

      setPublishStatus("Publishing…");
      const mainLines = lyricData.lines.filter((l) => l.tag !== "adlib");

      // Compute auto palettes from existing section images (non-blocking)
      let publishAutoPalettes: string[][] | null = null;
      if (!danceNeedsRegeneration) {
        try {
          if (
            Array.isArray(existingDance?.auto_palettes) &&
            existingDance.auto_palettes.length > 0
          ) {
            publishAutoPalettes = existingDance.auto_palettes;
          } else {
            const urls = (existingDance?.section_images ?? []).filter(
              (u: unknown): u is string => typeof u === "string" && Boolean(u),
            );
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
        .upsert(
          {
            user_id: user.id,
            artist_slug: artistSlug,
            song_slug: songSlug,
            artist_name: displayName,
            song_name: lyricData.title || "Untitled",
            audio_url: audioUrl,
            lyrics: mainLines,
            cinematic_direction: cinematicDirection || null,
            words: words ?? null,
            auto_palettes: danceNeedsRegeneration
              ? (publishAutoPalettes ?? null)
              : (publishAutoPalettes ?? null),
            beat_grid: beatGrid
              ? {
                  bpm: beatGrid.bpm,
                  beats: beatGrid.beats,
                  confidence: beatGrid.confidence,
                }
              : { bpm: 0, beats: [], confidence: 0 },
            palette: derivePaletteFromDirection({
              ...cinematicDirection,
              auto_palettes: danceNeedsRegeneration
                ? (publishAutoPalettes ?? null)
                : (publishAutoPalettes ?? null),
            }),
            section_images: danceNeedsRegeneration
              ? (sectionImageUrls.some(Boolean) ? sectionImageUrls : null)
              : (existingDance?.section_images ?? sectionImageUrls ?? null),
          },
          { onConflict: "artist_slug,song_slug" },
        );

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
      spendCredits();
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

            await supabase.from("songfit_posts" as any).insert({
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
  }, [
    user,
    lyricData,
    audioFile,
    publishing,
    renderData,
    beatGrid,
    cinematicDirection,
    words,
    danceNeedsRegeneration,
    currentLyricsHash,
    spendCredits,
  ]);

  // ── Battle publish handler ──────────────────────────────────────────
  const handleStartBattle = useCallback(
    async (
      overrideHooks?: [SavedCustomHook | null, SavedCustomHook | null],
    ) => {
      if (!user || battlePublishing || !canCreate) return;
      const hooks = overrideHooks ?? customHooks;
      const activeHook0 = hooks[0] ?? renderData?.hook;
      const activeHook1 = hooks[1] ?? renderData?.secondHook;
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
          const hookLines = lyricData.lines.filter(
            (l) => l.start < h.end && l.end > h.start,
          );
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

        // Look up ANY existing battle for this user + song (not by hookSlug).
        // This ensures we reuse the same battle_id when hooks change on republish.
        const { data: existingHooks }: any = await supabase
          .from("shareable_hooks" as any)
          .select("id, audio_url, battle_id, hook_slug")
          .eq("user_id", user.id)
          .eq("artist_slug", artistSlug)
          .eq("song_slug", songSlug)
          .order("battle_position", { ascending: true });

        const existingBattleId = existingHooks?.[0]?.battle_id ?? null;
        const existingAudioUrl = existingHooks?.[0]?.audio_url ?? null;

        let audioUrl: string;
        if (existingAudioUrl) {
          audioUrl = existingAudioUrl;
        } else {
          const fileExt = audioFile.name.split(".").pop() || "webm";
          const storagePath = `${user.id}/${artistSlug}/${songSlug}/${hookSlug}.${fileExt}`;
          const { error: uploadError } = await supabase.storage
            .from("audio-clips")
            .upload(storagePath, audioFile, { upsert: true });
          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage
            .from("audio-clips")
            .getPublicUrl(storagePath);
          audioUrl = urlData.publicUrl;
        }

        // Reuse existing battle_id — one battle per user+song
        const battleId = existingBattleId || crypto.randomUUID();

        // Delete old hooks for this battle if they exist (clean slate for new hooks)
        if (existingHooks && existingHooks.length > 0) {
          const oldSlugs = existingHooks
            .map((h: any) => h.hook_slug)
            .filter(Boolean);
          const newSlugs = [
            hookSlug,
            deriveHookSlug(activeHook1) || `${hookSlug}-2`,
          ];
          // Only delete hooks whose slugs differ from the new ones (upsert handles same-slug updates)
          const orphanedSlugs = oldSlugs.filter(
            (s: string) => !newSlugs.includes(s),
          );
          if (orphanedSlugs.length > 0) {
            await supabase
              .from("shareable_hooks" as any)
              .delete()
              .eq("user_id", user.id)
              .eq("artist_slug", artistSlug)
              .eq("song_slug", songSlug)
              .in("hook_slug", orphanedSlugs);
          }
        }
        const pSpec = renderData?.motionProfileSpec || {};
        const bg = beatGrid
          ? {
              bpm: beatGrid.bpm,
              beats: beatGrid.beats,
              confidence: beatGrid.confidence,
            }
          : {};
        const palette = pSpec.palette || ["#ffffff", "#a855f7", "#ec4899"];
        const system = pSpec.system || "fracture";

        // Helper to build hook payload — all values explicitly non-undefined
        const buildHookPayload = (
          h: any,
          slug: string,
          position: number,
          label: string | null,
        ) => {
          const hookLines = lyricData.lines.filter(
            (l) => l.start < h.end && l.end > h.start,
          );
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
          .upsert(
            buildHookPayload(
              activeHook0,
              hookSlug,
              1,
              renderData.hookLabel || null,
            ),
            { onConflict: "artist_slug,song_slug,hook_slug" },
          );
        if (e1) throw e1;

        // Upsert hook 2
        const secondHookSlug = deriveHookSlug(activeHook1);
        const { error: e2 } = await supabase
          .from("shareable_hooks" as any)
          .upsert(
            buildHookPayload(
              activeHook1,
              secondHookSlug || `${hookSlug}-2`,
              2,
              renderData.secondHookLabel || null,
            ),
            { onConflict: "artist_slug,song_slug,hook_slug" },
          );
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
          await supabase.from("hookfit_posts" as any).upsert(
            {
              user_id: user.id,
              battle_id: battleId,
              hook_id: (primaryHook as any).id,
              status: "live",
            },
            { onConflict: "battle_id" },
          );
        }

        const battleUrl = `/${artistSlug}/${songSlug}/${hookSlug}`;
        setBattlePublishedUrl(battleUrl);
        spendCredits();

        // Auto-post to CrowdFit — update existing or create new
        (async () => {
          try {
            // Find existing post by battle URL pattern (any hook slug for this user+song)
            const { data: existingPost }: any = await supabase
              .from("songfit_posts" as any)
              .select("id, lyric_dance_url")
              .eq("user_id", user.id)
              .like("lyric_dance_url", `/${artistSlug}/${songSlug}/%`)
              .is("lyric_dance_id", null)
              .maybeSingle();

            if (existingPost) {
              // Update existing post's URL to point to new hooks
              if (existingPost.lyric_dance_url !== battleUrl) {
                await supabase
                  .from("songfit_posts" as any)
                  .update({ lyric_dance_url: battleUrl })
                  .eq("id", existingPost.id);
              }
            } else {
              const expiresAt = new Date();
              expiresAt.setDate(expiresAt.getDate() + 21);
              await supabase.from("songfit_posts" as any).insert({
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
            console.warn(
              "[FitTab] CrowdFit battle auto-post failed:",
              e?.message,
            );
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
    },
    [
      user,
      battlePublishing,
      canCreate,
      customHooks,
      renderData,
      audioFile,
      lyricData,
      beatGrid,
      spendCredits,
    ],
  );

  const handleRemoveBattle = useCallback(async () => {
    if (!battlePublishedUrl || !user) return;
    try {
      await supabase
        .from("songfit_posts" as any)
        .delete()
        .eq("user_id", user.id)
        .eq("lyric_dance_url", battlePublishedUrl);
      setBattlePublishedUrl(null);
      toast.success("Removed from CrowdFit");
    } catch (e: any) {
      toast.error(e?.message || "Failed to remove battle");
    }
  }, [battlePublishedUrl, user]);

  const [fontReady, setFontReady] = useState(false);
  const [imageWaitExpired, setImageWaitExpired] = useState(false);

  useEffect(() => {
    if (!cinematicDirection) {
      setFontReady(false);
      return;
    }

    const fontMap: Record<string, string> = {
      "bold-impact": "Oswald",
      "clean-modern": "Montserrat",
      "elegant-serif": "Playfair Display",
      "raw-condensed": "Barlow Condensed",
      "whisper-soft": "Nunito",
      "tech-mono": "JetBrains Mono",
      "display-heavy": "Bebas Neue",
      "editorial-light": "Cormorant Garamond",
    };

    const typography = cinematicDirection.typography || "clean-modern";
    const fontName = fontMap[typography] || "Montserrat";
    const fontsApi = document.fonts;

    if (fontsApi?.check(`600 48px "${fontName}"`)) {
      setFontReady(true);
      return;
    }

    setFontReady(false);
    import("@/lib/fontReadinessCache").then(({ ensureFontReady }) => {
      ensureFontReady(fontName).then((loaded) => {
        setFontReady(loaded || true);
      });
    });
  }, [cinematicDirection]);

  const playerReady = useMemo(() => {
    if (!publishedDanceId) return false;
    if (!prefetchedDanceData) return false;

    if (generationStatus.beatGrid !== "done") return false;
    if (generationStatus.cinematicDirection !== "done") return false;

    const sections = (cinematicDirection as any)?.sections;
    if (Array.isArray(sections) && sections.length > 0) {
      if (
        generationStatus.sectionImages !== "done" &&
        generationStatus.sectionImages !== "error"
      )
        return false;
    }

    if (
      !prefetchedDanceData.words ||
      (prefetchedDanceData.words as any[]).length === 0
    )
      return false;
    if (!prefetchedDanceData.beat_grid) return false;

    // Ground-truth checks: ensure the prefetched DB snapshot has completed data.
    const cd = prefetchedDanceData.cinematic_direction as any;
    if (
      !cd ||
      Array.isArray(cd) ||
      !Array.isArray(cd.sections) ||
      cd.sections.length === 0
    )
      return false;

    if (Array.isArray(sections) && sections.length > 0) {
      const snapImages = (prefetchedDanceData as any).section_images;
      if (!Array.isArray(snapImages) || !snapImages.some(Boolean))
        return false;
    }

    if (!fontReady) return false;

    return true;
  }, [
    publishedDanceId,
    prefetchedDanceData,
    generationStatus,
    cinematicDirection,
    fontReady,
  ]);

  useEffect(() => {
    if (playerReady || !publishedDanceId) {
      setImageWaitExpired(false);
      return;
    }

    setImageWaitExpired(false);
    const timer = setTimeout(() => setImageWaitExpired(true), 60_000);
    return () => clearTimeout(timer);
  }, [playerReady, publishedDanceId]);

  const allGenDone =
    generationStatus.beatGrid === "done" &&
    generationStatus.renderData === "done" &&
    generationStatus.cinematicDirection === "done" &&
    (generationStatus.sectionImages === "done" ||
      generationStatus.sectionImages === "error");

  // Refetch dance data when core pipeline finishes OR when image URLs arrive/change
  useEffect(() => {
    if (!publishedDanceId) return;
    if (!allGenDone && !sectionImageUrls.some(Boolean)) return;
    const timer = setTimeout(() => {
      refetchDanceData();
    }, 300);
    return () => clearTimeout(timer);
  }, [allGenDone, publishedDanceId, refetchDanceData, sectionImageUrls]);

  const allReady =
    generationStatus.beatGrid === "done" &&
    generationStatus.renderData === "done" &&
    generationStatus.cinematicDirection === "done";
  const hasErrors = Object.values(generationStatus).includes("error");
  const danceDisabled =
    !cinematicDirection || publishing || !allReady || !canCreate;
  // Republish only needs auth + not currently publishing (data already exists on server)
  const republishDisabled = publishing;

  // ── Sections derived from renderData ─────────────────────────────────────
  const meaning = renderData?.meaning;
  const fmlyHookEnabled = siteCopy.features?.fmly_hook === true;

  const [empowermentPromise, setEmpowermentPromise] = useState<{
    emotionalJob: string;
    fromState: string;
    toState: string;
    promise: string;
    hooks: string[];
  } | null>(null);
  const [empowermentLoading, setEmpowermentLoading] = useState(false);
  const [empowermentError, setEmpowermentError] = useState(false);
  const [hasHydratedEmpowerment, setHasHydratedEmpowerment] = useState(false);

  // Live vote counts per hook index — fetched after promise is generated
  const [hookVoteCounts, setHookVoteCounts] = useState<number[]>([]);

  const fetchVoteCounts = useCallback(async (danceId: string) => {
    const { data } = await supabase
      .from("lyric_dance_angle_votes" as any)
      .select("hook_index")
      .eq("dance_id", danceId);
    if (!data) return;
    const counts = Array(6).fill(0);
    (data as any[]).forEach((row) => {
      counts[row.hook_index] = (counts[row.hook_index] ?? 0) + 1;
    });
    setHookVoteCounts(counts);
  }, []);

  // Hydrate empowermentPromise from DB snapshot once on load.
  // Prevents stale prefetched values from overriding regenerate attempts.
  useEffect(() => {
    if (!prefetchedDanceData || hasHydratedEmpowerment) return;

    const stored = (prefetchedDanceData as any).empowerment_promise;
    if (stored?.hooks?.length && !empowermentPromise && !empowermentLoading) {
      setEmpowermentPromise(stored);
      if (publishedDanceId) fetchVoteCounts(publishedDanceId);
    }

    setHasHydratedEmpowerment(true);
  }, [
    prefetchedDanceData,
    hasHydratedEmpowerment,
    empowermentPromise,
    empowermentLoading,
    publishedDanceId,
    fetchVoteCounts,
  ]);

  useEffect(() => {
    if (!fmlyHookEnabled) return;
    if (!publishedDanceId) return;
    if (!allReady && !prefetchedDanceData) return; // need either pipeline done OR DB data available
    if (empowermentPromise || empowermentLoading) return;

    const lines = lyricData?.lines;
    if (!Array.isArray(lines) || lines.length === 0) return;

    const lyricsText = lines
      .filter((l: any) => l.tag !== "adlib")
      .map((l: any) => l.text)
      .join("\n");

    setEmpowermentLoading(true);
    setEmpowermentError(false);

    invokeWithTimeout(
      "empowerment-promise",
      {
        songTitle: lyricData.title || "Untitled",
        lyricsText,
        emotionalArc: cinematicDirection?.emotionalArc ?? null,
        sceneTone: cinematicDirection?.sceneTone ?? null,
        chorusText: cinematicDirection?.chorusText ?? null,
        meaning: renderData?.meaning ?? null,
      },
      30_000,
    )
      .then(async ({ data, error }) => {
        if (error || !data?.hooks?.length) {
          setEmpowermentError(true);
          return;
        }

        setHasHydratedEmpowerment(true);
        setEmpowermentPromise(data);
        await supabase
          .from("shareable_lyric_dances" as any)
          .update({ empowerment_promise: data })
          .eq("id", publishedDanceId);
        fetchVoteCounts(publishedDanceId);
      })
      .catch(() => setEmpowermentError(true))
      .finally(() => setEmpowermentLoading(false));
  }, [
    fmlyHookEnabled,
    allReady,
    publishedDanceId,
    prefetchedDanceData,
    empowermentPromise,
    empowermentLoading,
    lyricData,
    cinematicDirection,
    renderData,
    fetchVoteCounts,
  ]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleGenerateImages = useCallback(async () => {
    await pipeline.retryImages();
  }, [pipeline]);

  const handleRetryImages = useCallback(() => {
    void handleGenerateImages();
  }, [handleGenerateImages]);

  return (
    <>
      <audio
        ref={hookAudioRef}
        src={hookAudioUrl}
        style={{ display: "none" }}
      />
      <div className="flex-1 px-4 py-6 space-y-4 max-w-2xl mx-auto">
        {/* Dance preview or waveform fallback */}
        {publishedUrl && publishedDanceId ? (
          <div className="space-y-3">
            {/* Action toolbar — above the player */}
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
                  const parsed = publishedUrl
                    ? parseLyricDanceUrl(publishedUrl)
                    : null;
                  const url = parsed
                    ? buildShareUrl(parsed.artistSlug, parsed.songSlug)
                    : `${window.location.origin}${publishedUrl}`;
                  navigator.clipboard
                    .writeText(url)
                    .then(() => toast.success("Link copied!"));
                }}
                className="flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase transition-colors border rounded-lg px-3 py-2.5 text-foreground hover:text-primary border-border/40 hover:border-primary/40"
                title="Copy Link"
              >
                Link
              </button>
              <button
                onClick={handleCrowdfitToggle}
                disabled={crowdfitToggling || (!canCreate && !crowdfitPostId)}
                className={`flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase transition-colors border rounded-lg px-3 py-2.5 ${
                  crowdfitPostId
                    ? "text-primary border-primary/40 bg-primary/5"
                    : "text-foreground hover:text-primary border-border/40 hover:border-primary/40"
                } disabled:opacity-50`}
                title={
                  crowdfitPostId
                    ? "Remove from CrowdFit"
                    : "Publish to CrowdFit"
                }
              >
                {crowdfitToggling ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : null}
                {crowdfitPostId
                  ? "Live"
                  : !canCreate
                    ? `${credits}/${required}`
                    : "Post"}
              </button>
              {user?.email === "sunpatel@gmail.com" && cinematicDirection && (
                <button
                  onClick={() => {
                    const meta = cinematicDirection._meta;
                    const debugInfo = {
                      _meta: meta || "no meta available",
                      cinematicDirection,
                      words:
                        wordsRef.current ??
                        (prefetchedDanceData as any)?.words ??
                        "no words available",
                    };
                    navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
                    const model = meta?.scene?.model || meta?.words?.model || "unknown";
                    const sceneSource = meta?.scene?.scenePromptSource || "?";
                    const wordSource = meta?.words?.wordPromptSource || "?";
                    toast.success(`Copied — model: ${model} | scene: ${sceneSource} | words: ${wordSource}`);
                  }}
                  className="flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase transition-colors border border-border/40 hover:border-primary/40 text-muted-foreground hover:text-primary rounded-lg px-3 py-2.5"
                >
                  Debug
                </button>
              )}
            </div>

            {/* Video player */}
            <div className="relative rounded-xl overflow-hidden w-full aspect-video">
              {playerReady || imageWaitExpired ? (
                <LyricDanceEmbed
                  ref={dancePlayerRef}
                  lyricDanceId={publishedDanceId}
                  lyricDanceUrl={publishedUrl}
                  songTitle={lyricData.title || "Untitled"}
                  artistName=""
                  prefetchedData={prefetchedDanceData}
                />
              ) : (
                <div className="absolute inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center gap-3">
                  <Loader2 size={20} className="animate-spin text-white/20" />
                  <span className="text-[10px] font-mono text-white/25 tracking-wider uppercase">
                    {!prefetchedDanceData
                      ? "loading..."
                      : generationStatus.sectionImages === "running"
                        ? `images ${sectionImageUrls.filter(Boolean).length}/${(cinematicDirection as any)?.sections?.length ?? "?"}`
                        : generationStatus.sectionImages === "error"
                          ? "images incomplete — loading player..."
                          : !fontReady
                            ? "loading font..."
                            : "preparing player..."}
                  </span>
                </div>
              )}
            </div>

            <FitExportModal
              isOpen={showExportModal}
              onClose={() => setShowExportModal(false)}
              getPlayer={() => dancePlayerRef.current?.getPlayer() ?? null}
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

        {/* ── FMLY Feud Setup ── */}
        {hottestHooksEnabled && (
          <>
            <div className="glass-card rounded-xl p-4 border border-border/30 space-y-3">
              <div className="flex items-center gap-1.5">
                <Zap size={11} className="text-primary" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Let the FMLY decide the hottest hook
                </span>
              </div>

              {battlePublishedUrl ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => window.open(battlePublishedUrl, "_blank")}
                    className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors border rounded-lg py-2 text-green-400 border-green-400/40 hover:border-green-400/70"
                  >
                    <Circle
                      size={7}
                      className="fill-green-400 text-green-400"
                    />{" "}
                    Live
                  </button>
                  <button
                    onClick={handleRemoveBattle}
                    className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors border rounded-lg py-2 text-foreground/50 border-border/30 hover:text-foreground hover:border-border/60"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setFeudTab(0);
                    setFeudSetupOpen(true);
                  }}
                  disabled={!hottestHooksEnabled || !canCreate}
                  className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors border rounded-lg py-2 text-foreground hover:text-primary border-border/40 hover:border-primary/40 disabled:opacity-40"
                >
                  <Zap size={10} /> Set Up Your Feud
                </button>
              )}
            </div>

            {/* ── Feud Setup Modal ── */}
            <Dialog
              open={feudSetupOpen}
              onOpenChange={(open) => {
                if (!open) {
                  setFeudSetupOpen(false);
                }
              }}
            >
              <DialogContent className="max-w-lg w-full p-0 overflow-hidden bg-background border border-border/40">
                {/* Header */}
                <div className="px-5 pt-5 pb-3 border-b border-border/30">
                  <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
                    Set Up Your Feud
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    Pick two hooks — the FMLY votes on the hottest one
                  </p>
                </div>

                <div className="flex border-b border-border/30">
                  {(["Left Hook", "Right Hook"] as const).map((label, idx) => {
                    const isSet = !!(
                      customHooks[idx] ??
                      (idx === 0 ? renderData?.hook : renderData?.secondHook)
                    );
                    return (
                      <button
                        key={idx}
                        onClick={() => setFeudTab(idx as 0 | 1)}
                        className={`flex-1 px-4 py-3 text-[11px] font-mono uppercase tracking-[0.12em] transition-colors flex items-center justify-center gap-1.5 ${
                          feudTab === idx
                            ? "text-primary border-b-2 border-primary"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {label}
                        {isSet && feudTab !== idx && (
                          <span className="text-[8px] text-primary/60">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="px-5 py-5" style={{ minHeight: 200 }}>
                  {([0, 1] as const).map((idx) => {
                    if (feudTab !== idx) return null;
                    const aiHook =
                      idx === 0 ? renderData?.hook : renderData?.secondHook;
                    return (
                      <HookWaveformPicker
                        key={idx}
                        waveform={waveform || parentWaveform || null}
                        lines={lyricData.lines}
                        audioRef={hookAudioRef}
                        loopRegionRef={hookLoopRegionRef}
                        aiHint={aiHook ?? null}
                        initialHook={customHooks[idx] ?? aiHook ?? null}
                        isLast={idx === 1}
                        onSave={async (hook) => {
                          const saved: SavedCustomHook = {
                            ...hook,
                            color: "#a855f7",
                          };
                          const next: [
                            SavedCustomHook | null,
                            SavedCustomHook | null,
                          ] = [...customHooks] as any;
                          next[idx] = saved;
                          setCustomHooks(next);
                          if (idx === 0) {
                            setFeudTab(1);
                          } else {
                            // Pass next directly — React state may not have flushed yet
                            const hook0 = next[0] ?? renderData?.hook;
                            const hook1 = next[1];
                            if (hook0 && hook1) {
                              await handleStartBattle(next);
                            }
                            setFeudSetupOpen(false);
                          }
                        }}
                      />
                    );
                  })}
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}

        {/* Single-column report */}
        <div className="space-y-3">
          {!allReady && (
            <div className="glass-card rounded-xl p-4 space-y-2">
              <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                {hasErrors
                  ? "Some steps failed"
                  : Object.values(generationStatus).some((v) => v === "running")
                    ? "Generating Fit in background"
                    : "Analysis not yet complete"}
              </p>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div>Rhythm: {generationStatus.beatGrid}</div>
                <div>Song DNA: {generationStatus.renderData}</div>
                <div>
                  Cinematic direction: {generationStatus.cinematicDirection}
                </div>
              </div>
            </div>
          )}

          {renderData?.description && (
            <div className="glass-card rounded-xl p-4 space-y-2">
              <p className="text-sm text-muted-foreground italic leading-relaxed">
                {renderData.description}
              </p>
              {renderData.mood && (
                <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {renderData.mood}
                </span>
              )}
            </div>
          )}

          {cinematicDirection?.chorusText && (
            <div className="glass-card rounded-xl p-4 space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-primary/70">
                Chorus
              </span>
              <p className="text-sm text-foreground/80 italic leading-relaxed">
                {cinematicDirection.chorusText}
              </p>
            </div>
          )}

          {fmlyHookEnabled &&
            allReady &&
            (empowermentLoading || empowermentPromise || empowermentError) && (
              <div className="glass-card rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    <Zap size={10} />
                    FMLY Hook
                  </div>
                  {empowermentPromise && (
                    <button
                      onClick={() => {
                        setEmpowermentPromise(null);
                        setEmpowermentError(false);
                        setHookVoteCounts([]);
                      }}
                      className="text-[9px] font-mono text-muted-foreground/50 hover:text-primary transition-colors flex items-center gap-1"
                    >
                      <RefreshCw size={9} /> Regenerate
                    </button>
                  )}
                </div>

                {empowermentLoading && (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 size={12} className="animate-spin text-white/20" />
                    <span className="text-[10px] font-mono text-white/25 tracking-wider">
                      generating angles…
                    </span>
                  </div>
                )}

                {empowermentError && !empowermentLoading && (
                  <p className="text-[11px] text-muted-foreground/50">
                    Could not generate — try again later.
                  </p>
                )}

                {empowermentPromise && (() => {
                  const totalVotes = hookVoteCounts.reduce((a, b) => a + b, 0);
                  const winnerIndex =
                    hookVoteCounts.length > 0
                      ? hookVoteCounts.indexOf(Math.max(...hookVoteCounts))
                      : -1;

                  return (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono px-2 py-1 rounded bg-white/[0.04] text-white/50">
                          {empowermentPromise.fromState}
                        </span>
                        <span className="text-white/20">→</span>
                        <span className="text-[10px] font-mono px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
                          {empowermentPromise.toState}
                        </span>
                      </div>

                      <p className="text-sm font-semibold text-foreground leading-snug">
                        {empowermentPromise.promise}
                      </p>

                      <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider">
                            {totalVotes > 0
                              ? `${totalVotes} FMLY vote${totalVotes !== 1 ? "s" : ""}`
                              : "Share to get votes"}
                          </span>
                        </div>
                        {empowermentPromise.hooks.map((hook, i) => {
                          const votes = hookVoteCounts[i] ?? 0;
                          const pct =
                            totalVotes > 0
                              ? Math.round((votes / totalVotes) * 100)
                              : 0;
                          const isWinner = totalVotes >= 3 && i === winnerIndex;
                          return (
                            <div key={i} className="relative rounded-lg overflow-hidden">
                              {totalVotes > 0 && (
                                <div
                                  className="absolute inset-y-0 left-0 transition-all duration-500"
                                  style={{
                                    width: `${pct}%`,
                                    background: isWinner
                                      ? "rgba(74,222,128,0.08)"
                                      : "rgba(255,255,255,0.03)",
                                  }}
                                />
                              )}
                              <div className="relative flex items-center gap-2.5 px-2.5 py-2">
                                <span className="text-[9px] font-mono text-white/15 shrink-0 w-4">
                                  {String(i + 1).padStart(2, "0")}
                                </span>
                                <span
                                  className={`text-[11px] flex-1 leading-snug ${isWinner ? "text-white/90" : "text-white/55"}`}
                                >
                                  {hook}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {isWinner && (
                                    <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/20 uppercase tracking-wider">
                                      FMLY pick
                                    </span>
                                  )}
                                  {totalVotes > 0 && (
                                    <span className="text-[9px] font-mono text-white/25 w-8 text-right">
                                      {pct}%
                                    </span>
                                  )}
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(hook);
                                    }}
                                    className="p-1 text-white/15 hover:text-white/50 transition-colors"
                                  >
                                    <Copy size={10} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

          {renderData && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Song DNA
                </span>
              </div>

              {meaning && (
                <div className="glass-card rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    <Sparkles size={10} />
                    Meaning
                  </div>
                  {meaning.theme && (
                    <p className="text-sm font-semibold text-foreground">
                      {meaning.theme}
                    </p>
                  )}
                  {(meaning.summary || meaning.narrative) && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {meaning.summary || meaning.narrative}
                    </p>
                  )}
                  {Array.isArray(meaning.imagery || meaning.emotions) &&
                    (meaning.imagery || meaning.emotions).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(meaning.imagery || meaning.emotions).map(
                          (e: string, i: number) => (
                            <span
                              key={i}
                              className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground"
                            >
                              {e}
                            </span>
                          ),
                        )}
                      </div>
                    )}
                </div>
              )}

              {cinematicDirection?.sections &&
                Array.isArray(cinematicDirection.sections) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                        <Eye size={10} />
                        Scenes
                      </div>
                      {Array.isArray(cinematicDirection.sections) &&
                        cinematicDirection.sections.length > 0 && (
                          <button
                            onClick={() => void handleRetryImages()}
                            disabled={generationStatus.sectionImages === "running"}
                            className="text-[9px] font-mono text-primary hover:text-primary/80 transition-colors flex items-center gap-1 disabled:opacity-40"
                          >
                            {generationStatus.sectionImages === "running" ? (
                              <>
                                <Loader2 size={9} className="animate-spin" />
                                {sectionImageProgress
                                  ? `${sectionImageProgress.done}/${sectionImageProgress.total}`
                                  : "Generating…"}
                              </>
                            ) : sectionImageError ? (
                              <>
                                <RefreshCw size={9} />
                                Retry (
                                {sectionImageProgress
                                  ? `${sectionImageProgress.done}/${sectionImageProgress.total}`
                                  : "failed"}
                                )
                              </>
                            ) : sectionImageUrls.length > 0 ? (
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

                    {cinematicDirection.sections.map(
                      (section: any, i: number) => {
                        const imageUrl = sectionImageUrls[i] || null;
                        const startSec = typeof section.startSec === "number" && section.startSec > 0
                          ? section.startSec
                          : typeof section.start === "number" && section.start > 0
                            ? section.start
                            : null;
                        const endSec = typeof section.endSec === "number" && section.endSec > 0
                          ? section.endSec
                          : typeof section.end === "number" && section.end > 0
                            ? section.end
                            : null;
                        const fmtTime = (t: number) => {
                          const m = Math.floor(t / 60);
                          const s = Math.floor(t % 60);
                          return `${m}:${s.toString().padStart(2, "0")}`;
                        };
                        const tsLabel = startSec != null
                          ? endSec != null
                            ? `${fmtTime(startSec)} – ${fmtTime(endSec)}`
                            : fmtTime(startSec)
                          : `Section ${i + 1}`;
                        return (
                          <div
                            key={section.sectionIndex ?? i}
                            className="glass-card rounded-lg p-2.5 flex gap-3 items-start cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all"
                            onClick={() => {
                              if (imageUrl) {
                                setLightboxScene({
                                  imageUrl,
                                  description: section.description || "",
                                  timestamp: tsLabel,
                                  visualMood: section.visualMood,
                                  index: i,
                                });
                              }
                            }}
                          >
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={
                                  section.structuralLabel || `Section ${i + 1}`
                                }
                                className="w-16 h-16 rounded-md object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-16 h-16 rounded-md bg-white/5 shrink-0 flex items-center justify-center">
                                <Image
                                  size={14}
                                  className="text-muted-foreground/30"
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-foreground font-mono">
                                  {tsLabel}
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
                      },
                    )}

                    {/* Scene Lightbox */}
                    <Dialog open={!!lightboxScene} onOpenChange={(open) => { if (!open) setLightboxScene(null); }}>
                      <DialogContent className="max-w-2xl w-full p-0 overflow-hidden bg-background border border-border/40">
                        {lightboxScene && (
                          <div className="space-y-0">
                            <img
                              src={lightboxScene.imageUrl}
                              alt={`Scene ${lightboxScene.index + 1}`}
                              className="w-full aspect-video object-cover"
                            />
                            <div className="px-5 py-4 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-foreground font-mono">
                                  {lightboxScene.timestamp}
                                </span>
                                {lightboxScene.visualMood && (
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                    {lightboxScene.visualMood}
                                  </span>
                                )}
                              </div>
                              {lightboxScene.description && (
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                  {lightboxScene.description}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  </div>
                )}

              {cinematicDirection && (
                <CinematicDirectionCard
                  cinematicDirection={cinematicDirection}
                  sectionImages={sectionImageUrls}
                  imageProgress={sectionImageProgress}
                  imageError={sectionImageError}
                  imageGenerating={generationStatus.sectionImages === "running"}
                  retryImagesAction={handleRetryImages}
                />
              )}

              {beatGrid && (
                <div className="glass-card rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    <Music size={10} />
                    Rhythm
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">
                      {beatGrid.bpm.toFixed(0)} BPM
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {Math.round((beatGrid.confidence ?? 0) * 100)}% confidence
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {beatGrid.beats?.length ?? 0} beats
                    </span>
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
              ) : !canCreate ? (
                `Vote on ${required - credits} more to post`
              ) : publishedUrl ? (
                "Regenerate Dance"
              ) : (
                "Dance"
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
  sectionImages,
  imageProgress,
  imageError,
  imageGenerating,
  retryImagesAction,
}: {
  cinematicDirection: any;
  sectionImages: (string | null)[];
  imageProgress: { done: number; total: number } | null;
  imageError: string | null;
  imageGenerating: boolean;
  retryImagesAction: () => void;
}) {
  const [imageTimestamps, setImageTimestamps] = useState<(string | null)[]>([]);

  const sections: any[] =
    cinematicDirection.sections && Array.isArray(cinematicDirection.sections)
      ? cinematicDirection.sections
      : [];

  useEffect(() => {
    setImageTimestamps(Array.from({ length: sectionImages.length }, () => null));
  }, [sectionImages]);

  return null;
}
