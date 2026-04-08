/* cache-bust: 2026-03-05-V1 */
/**
 * FitTab — Displays analysis results with waveform + beat markers.
 * Centered single-column layout for readability.
 * Pipeline runs in LyricFitTab parent.
 * v2: removed lyrics column, single-column report.
 */

import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import {
  Loader2,
  RefreshCw,
  Music,
  Sparkles,
  Eye,
  Zap,
  Image,
  Copy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { LyricWaveform } from "./LyricWaveform";
import { FitExportModal } from "./FitExportModal";

import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import type { WaveformData } from "@/hooks/useAudioEngine";
import type {
  LyricLine,
  LyricData,
  LyricHook,
} from "./LyricDisplay";
import type { BeatGridData } from "@/hooks/useBeatGrid";
// FrameRenderState import removed — V3 derives from cinematicDirection
import type { HeaderProjectSetter } from "./LyricsTab";
import type { GenerationStatus } from "./LyricFitTab";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import { buildShareUrl, parseLyricDanceUrl } from "@/lib/shareUrl";
import { useVoteGate } from "@/hooks/useVoteGate";

import { invokeWithTimeout } from "@/lib/invokeWithTimeout";
import { ClipComposer } from "@/components/lyric/ClipComposer";
import { fetchFireStrength, fetchFireData } from "@/lib/fire";
import { extractPeaks } from "@/lib/audioUtils";
import { persistQueue } from "@/lib/persistQueue";
import { preloadImage } from "@/lib/imagePreloadCache";
import { getCachedAudioBuffer } from "@/lib/audioDecodeCache";

interface Props {
  pipeline: {
    retryImages: () => void | Promise<void>;
    setSectionImageUrls: React.Dispatch<React.SetStateAction<(string | null)[]>>;
    setSectionImageProgress: React.Dispatch<
      React.SetStateAction<{ done: number; total: number } | null>
    >;
    setGenerationStatus: React.Dispatch<React.SetStateAction<GenerationStatus>>;
    spotifyTrackId?: string | null;
    setSpotifyTrackId?: React.Dispatch<React.SetStateAction<string | null>>;
  };
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
  initialDanceId?: string | null;
  initialDanceUrl?: string | null;
  sectionImageUrls?: (string | null)[];
  sectionImageProgress?: { done: number; total: number } | null;
  sectionImageError?: string | null;
  onTitleChange?: (newTitle: string) => void;
  subView?: "fit" | "data";
  filmMode?: "song" | "beat";
  onPlayerReady?: (ready: boolean) => void;
}

const fmtTime = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

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

const captions: Record<number, string> = {
  0: "for everyone who needed to hear this",
  1: "this is what letting go sounds like",
  2: "you already know who you were",
  3: "this one hurts because it's true",
  4: "something shifted — pay attention",
  5: "none of it was wasted",
};

function getMainLines(ref: React.MutableRefObject<any[] | undefined>) {
  return (ref.current || []).filter((l: any) => l.tag !== "adlib");
}

function SpotifyLinkField({
  spotifyTrackId,
  setSpotifyTrackId,
  savedId,
}: {
  spotifyTrackId: string | null;
  setSpotifyTrackId: (id: string | null) => void;
  savedId: string | null;
}) {
  const [query, setQuery] = useState(
    spotifyTrackId ? `https://open.spotify.com/track/${spotifyTrackId}` : "",
  );
  const [results, setResults] = useState<
    Array<{
      id: string;
      name: string;
      artists: string;
      image: string | null;
      url: string;
    }>
  >([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (q: string) => {
      if (!q.trim() || q.length < 2) {
        setResults([]);
        return;
      }
      const urlMatch = q.match(/track\/([a-zA-Z0-9]+)/);
      if (urlMatch) {
        setSpotifyTrackId(urlMatch[1]);
        setResults([]);
        if (savedId) {
          persistQueue.enqueue({
            table: "lyric_projects",
            id: savedId,
            payload: { spotify_track_id: urlMatch[1], spotify_track_url: q },
          });
        }
        return;
      }
      setSearching(true);
      try {
        const { data, error } = await supabase.functions.invoke("spotify-search", {
          body: { query: q.trim(), type: "track" },
        });
        if (!error && data?.results) setResults(data.results.slice(0, 5));
      } catch {
        // noop
      } finally {
        setSearching(false);
      }
    },
    [savedId, setSpotifyTrackId],
  );

  const onChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void search(val), 400);
  };

  const onSelect = (track: {
    id: string;
    name: string;
    artists: string;
    image: string | null;
    url: string;
  }) => {
    setSpotifyTrackId(track.id);
    setQuery(`${track.name} — ${track.artists}`);
    setResults([]);
    if (savedId) {
      persistQueue.enqueue({
        table: "lyric_projects",
        id: savedId,
        payload: { spotify_track_id: track.id, spotify_track_url: track.url },
      });
    }
  };

  const onClear = () => {
    setSpotifyTrackId(null);
    setQuery("");
    setResults([]);
    if (savedId) {
      persistQueue.enqueue({
        table: "lyric_projects",
        id: savedId,
        payload: { spotify_track_id: null, spotify_track_url: null },
      });
    }
  };

  return (
    <div style={{ padding: "8px 16px", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <svg viewBox="0 0 24 24" width={11} height={11} fill="rgba(30,215,96,0.6)">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02z" />
        </svg>
        <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", letterSpacing: "0.05em" }}>
          Spotify Song Link
        </span>
        {spotifyTrackId && (
          <button onClick={onClear} style={{ marginLeft: "auto", background: "none", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
        )}
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste Spotify link or search..."
        style={{
          width: "100%", padding: "7px 10px", background: "rgba(255,255,255,0.03)",
          border: spotifyTrackId ? "0.5px solid rgba(30,215,96,0.2)" : "0.5px solid rgba(255,255,255,0.07)",
          borderRadius: 8, fontSize: 12, fontFamily: "monospace",
          color: "rgba(255,255,255,0.6)", outline: "none", boxSizing: "border-box" as const,
        }}
      />
      {searching && <div style={{ fontSize: 10, marginTop: 3, color: "rgba(255,255,255,0.2)", fontFamily: "monospace" }}>Searching…</div>}
      {results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 16, right: 16, zIndex: 50,
          background: "#1a1a1f", border: "0.5px solid rgba(255,255,255,0.08)",
          borderRadius: 8, marginTop: 2, overflow: "hidden",
        }}>
          {results.map((track) => (
            <button key={track.id} onClick={() => onSelect(track)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              padding: "8px 10px", background: "transparent", border: "none",
              borderBottom: "0.5px solid rgba(255,255,255,0.04)", cursor: "pointer",
            }}>
              {track.image && <img src={track.image} style={{ width: 28, height: 28, borderRadius: 3, objectFit: "cover", flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.name}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.artists}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  initialDanceId,
  initialDanceUrl,
  sectionImageUrls = [],
  sectionImageProgress = null,
  sectionImageError = null,
  onTitleChange,
  subView = "fit",
  filmMode = "song",
  onPlayerReady,
}: Props) {
  const { user, profile } = useAuth();
  const { canCreate, credits, required } = useVoteGate();

  const [publishedUrl, setPublishedUrl] = useState<string | null>(
    initialDanceUrl ?? null,
  );
  const [publishedDanceId, setPublishedDanceId] = useState<string | null>(
    initialDanceId ?? null,
  );

  useEffect(() => {
    if (initialDanceId) setPublishedDanceId(initialDanceId);
  }, [initialDanceId]);

  useEffect(() => {
    if (initialDanceUrl) setPublishedUrl(initialDanceUrl);
  }, [initialDanceUrl]);

  const [prefetchedDanceData, setPrefetchedDanceData] =
    useState<LyricDanceData | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [lightboxScene, setLightboxScene] = useState<{ imageUrl: string; description: string; timestamp: string; visualMood?: string; index: number } | null>(null);
  const [clipComposerVisible, setClipComposerVisible] = useState(false);
  const [clipComposerStart, setClipComposerStart] = useState(0);
  const [clipComposerCaption, setClipComposerCaption] = useState<string | null>(
    null,
  );
  const dancePlayerRef =
    useRef<import("@/components/lyric/LyricDanceEmbed").LyricDanceEmbedHandle>(
      null,
    );
  useEffect(() => {
    const player = dancePlayerRef.current?.getPlayer();
    if (!player) return;
    player.beatVisEnabled = filmMode === "beat";
  }, [filmMode, publishedDanceId, prefetchedDanceData]);
  const siteCopy = useSiteCopy();

  const refetchDanceData = useCallback(() => {
    if (!publishedDanceId) {
      setPrefetchedDanceData(null);
      return;
    }
    supabase
      .from("lyric_projects" as any)
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

  // ── CrowdFit publish state ─────────────────────────────────────────
  const [crowdfitPostId, setCrowdfitPostId] = useState<string | null>(null);
  const crowdfitTogglingRef = useRef(false);
  const [crowdfitToggling, setCrowdfitToggling] = useState(false);

  const [fireData, setFireData] = useState(initialFireData);



  // Look for existing CrowdFit post when we know the dance ID
  useEffect(() => {
    if (!publishedDanceId || !user) {
      setCrowdfitPostId(null);
      return;
    }
    supabase
      .from("feed_posts" as any)
      .select("id, status")
      .eq("user_id", user.id)
      .eq("project_id", publishedDanceId)
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
    if (
      !user ||
      !publishedDanceId ||
      !publishedUrl ||
      crowdfitTogglingRef.current
    )
      return;
    crowdfitTogglingRef.current = true;
    setCrowdfitToggling(true);
    try {
      if (crowdfitPostId) {
        // Remove from CrowdFit
        await supabase
          .from("feed_posts" as any)
          .update({ status: "removed" })
          .eq("id", crowdfitPostId);
        setCrowdfitPostId(null);
        toast.success("Removed from CrowdFit");
      } else {
        // Look for existing removed post to reactivate
        const { data: existing }: any = await supabase
          .from("feed_posts" as any)
          .select("id")
          .eq("user_id", user.id)
          .eq("project_id", publishedDanceId)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("feed_posts" as any)
            .update({ status: "live" })
            .eq("id", existing.id);
          setCrowdfitPostId(existing.id);
        } else {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 21);
          const { data: inserted }: any = await supabase
            .from("feed_posts" as any)
            .insert({
              user_id: user.id,
              title: lyricData.title || "Untitled",
              caption: "",
                            project_id: publishedDanceId,
              spotify_track_id: pipeline.spotifyTrackId ?? null,
              spotify_track_url: pipeline.spotifyTrackId
                ? `https://open.spotify.com/track/${pipeline.spotifyTrackId}`
                : null,
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
      crowdfitTogglingRef.current = false;
      setCrowdfitToggling(false);
    }
  }, [
    user,
    publishedDanceId,
    publishedUrl,
    crowdfitPostId,
    lyricData.title,
  ]);

  // ── Audio playback + waveform ─────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string>("");
  const fireHeatmapCanvasRef = useRef<HTMLCanvasElement>(null);
  const [waveform, setWaveform] = useState<WaveformData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const activeWaveform = waveform ?? parentWaveform ?? null;
  const parentWaveformRef = useRef(parentWaveform);
  parentWaveformRef.current = parentWaveform;

  useEffect(() => {
    if (!audioFile || audioFile.size === 0) return;

    const url = URL.createObjectURL(audioFile);
    audioUrlRef.current = url;
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

    const waveformFromParent = parentWaveformRef.current;
    // Only decode locally if parent didn't provide waveform at effect fire time.
    if (waveformFromParent) {
      setWaveform(waveformFromParent);
    } else {
      getCachedAudioBuffer(audioFile)
        .then((buf) => {
          setWaveform({
            peaks: extractPeaks(buf, 200),
            duration: buf.duration,
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
      if (audioUrlRef.current === url) audioUrlRef.current = "";
      audioRef.current = null;
    };
    // parentWaveform intentionally read from ref — avoids re-creating Audio + blob on waveform updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioFile]);

  useEffect(() => {
    if (!sectionImageUrls.length) return;
    sectionImageUrls.forEach((url) => {
      if (!url) return;
      const img = new Image();
      img.src = url;
    });
  }, [sectionImageUrls]);

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
  const lyricsText = useMemo(
    () =>
      (lyricData?.lines ?? [])
        .filter((l: any) => l.tag !== "adlib")
        .map((l: any) => l.text)
        .join("\n"),
    [lyricData?.lines],
  );

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
      const mainLines = getMainLines(linesRef);
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
  // The canvas preview now updates live, but `lyric_projects` still
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
      const mainLines = getMainLines(linesRef);

      // Use the reconciled words from the player engine — updateTranscript() maps
      // edited line text back onto word timestamp slots. Those reconciled words
      // are what compileScene actually renders on the shareable page.
      // Fall back to raw Whisper words if player isn't ready yet.
      const reconciledWords = wordsRef.current ?? null;

      const { error } = await supabase
        .from("lyric_projects" as any)
        .update({ lines: mainLines, words: reconciledWords })
        .eq("id", danceId);
      if (error) {
        // auto-save failed silently
      }
    }, 1500); // 1.5s debounce — wait for user to stop typing

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [lyricData?.lines, words]);


  const [fontReady, setFontReady] = useState(false);
  const [imageWaitExpired, setImageWaitExpired] = useState(false);

  useEffect(() => {
    if (!cinematicDirection) {
      setFontReady(false);
      return;
    }

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
    const isInstrumental = !!(prefetchedDanceData.cinematic_direction as any)?._instrumental;

    if (generationStatus.beatGrid !== "done") return false;
    if (generationStatus.cinematicDirection !== "done") return false;

    const sections = (cinematicDirection as any)?.sections;
    if (Array.isArray(sections) && sections.length > 0 && !isInstrumental) {
      if (
        generationStatus.sectionImages !== "done" &&
        generationStatus.sectionImages !== "error"
      )
        return false;
    }

    if (
      !isInstrumental &&
      (!prefetchedDanceData.words ||
      (prefetchedDanceData.words as any[]).length === 0)
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

    if (Array.isArray(sections) && sections.length > 0 && !isInstrumental) {
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

  const LyricDanceEmbedModule = useMemo(
    () =>
      publishedDanceId
        ? lazy(() =>
            import("@/components/lyric/LyricDanceEmbed").then((m) => ({
              default: m.LyricDanceEmbed,
            })),
          )
        : null,
    [publishedDanceId],
  );

  useEffect(() => {
    onPlayerReady?.(playerReady);
  }, [playerReady, onPlayerReady]);

  useEffect(() => {
    if (playerReady || !publishedDanceId) {
      setImageWaitExpired(false);
      return;
    }

    setImageWaitExpired(false);
    const timer = setTimeout(() => setImageWaitExpired(true), 60_000);
    return () => clearTimeout(timer);
  }, [playerReady, publishedDanceId]);

  const allDone =
    generationStatus.beatGrid === "done" &&
    generationStatus.renderData === "done" &&
    generationStatus.cinematicDirection === "done" &&
    (generationStatus.sectionImages === "done" ||
      generationStatus.sectionImages === "error");

  // Refetch dance data when core pipeline finishes OR when image URLs arrive/change
  useEffect(() => {
    if (!publishedDanceId) return;
    if (!allDone && !sectionImageUrls.some(Boolean)) return;
    const timer = setTimeout(() => {
      refetchDanceData();
    }, 300);
    return () => clearTimeout(timer);
  }, [allDone, publishedDanceId, refetchDanceData, sectionImageUrls]);

  useEffect(() => {
    sectionImageUrls.filter(Boolean).forEach((url) => preloadImage(url!));
  }, [sectionImageUrls]);

  const allCoreDone =
    generationStatus.beatGrid === "done" &&
    generationStatus.renderData === "done" &&
    generationStatus.cinematicDirection === "done";
  const hasErrors = Object.values(generationStatus).includes("error");

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
      .from("project_angle_votes" as any)
      .select("hook_index")
      .eq("project_id", danceId);
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
    if (!allCoreDone && !prefetchedDanceData) return; // need either pipeline done OR DB data available
    if (empowermentPromise || empowermentLoading || empowermentError) return;

    const lines = lyricData?.lines;
    if (!Array.isArray(lines) || lines.length === 0) return;

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
          .from("lyric_projects" as any)
          .update({ empowerment_promise: data })
          .eq("id", publishedDanceId);
        fetchVoteCounts(publishedDanceId);
      })
      .catch(() => setEmpowermentError(true))
      .finally(() => setEmpowermentLoading(false));
  }, [
    fmlyHookEnabled,
    allCoreDone,
    publishedDanceId,
    prefetchedDanceData,
    empowermentPromise,
    empowermentLoading,
    empowermentError,
    lyricData,
    cinematicDirection,
    renderData,
    fetchVoteCounts,
  ]);

  const allLines = useMemo(
    () =>
      (lyricData?.lines ?? []).map((line, lineIndex) => ({
        lineIndex,
        text: line.text,
        startSec:
          typeof (line as any).startSec === "number"
            ? (line as any).startSec
            : Number((line as any).start ?? 0),
      })),
    [lyricData?.lines],
  );

  const fireHeatmapData = useMemo(() => {
    if (!activeWaveform || fireData.rawFires.length === 0 || allLines.length === 0) {
      return null;
    }
    const dur = activeWaveform.duration || 1;
    const bucketCount = activeWaveform.peaks.length;
    const buckets = new Float32Array(bucketCount);
    for (const fire of fireData.rawFires) {
      const idx = Math.min(
        bucketCount - 1,
        Math.max(0, Math.floor((fire.time_sec / dur) * bucketCount)),
      );
      const weight =
        fire.hold_ms < 300 ? 1 : fire.hold_ms < 1000 ? 2 : fire.hold_ms < 3000 ? 4 : 8;
      buckets[idx] += weight;
    }
    let maxBucket = 0;
    for (let i = 0; i < bucketCount; i++) {
      if (buckets[i] > maxBucket) maxBucket = buckets[i];
    }
    if (maxBucket > 0) {
      for (let i = 0; i < bucketCount; i++) buckets[i] /= maxBucket;
    }
    let peakIdx = 0;
    for (let i = 0; i < bucketCount; i++) {
      if (buckets[i] > buckets[peakIdx]) peakIdx = i;
    }
    const peakTimeSec = (peakIdx / bucketCount) * dur;
    const peakLine = allLines.reduce(
      (best, line) =>
        Math.abs(line.startSec - peakTimeSec) < Math.abs(best.startSec - peakTimeSec)
          ? line
          : best,
      allLines[0],
    );
    return { buckets, peakTimeSec, peakLine };
  }, [activeWaveform, fireData.rawFires, allLines]);

  useEffect(() => {
    const canvas = fireHeatmapCanvasRef.current;
    if (!canvas || !fireHeatmapData || !activeWaveform) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    ctx.clearRect(0, 0, cw, ch);

    const barW = Math.max(cw / activeWaveform.peaks.length, 1);
    const gap = 1;

    activeWaveform.peaks.forEach((peak, i) => {
      const barH = Math.max(peak * ch * 0.85, 2);
      const x = i * barW;
      const heat = fireHeatmapData.buckets[i];
      if (heat > 0.01) {
        const r = 255;
        const g = Math.round(140 - heat * 100);
        const b = Math.round(30);
        const a = 0.3 + heat * 0.65;
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      } else {
        ctx.fillStyle = "rgba(150,150,150,0.25)";
      }
      ctx.fillRect(x, (ch - barH) / 2, Math.max(barW - gap, 1), barH);
    });

    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,120,30,0.6)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < fireHeatmapData.buckets.length; i++) {
      const x = (i / fireHeatmapData.buckets.length) * cw;
      const y = ch - fireHeatmapData.buckets[i] * ch * 0.7 - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [fireHeatmapData, activeWaveform]);

  const beatSectionFires = useMemo(() => {
    if (filmMode !== "beat" || fireData.rawFires.length === 0 || !beatGrid) return null;
    const beats = beatGrid.beats;
    const beatsPerSection = 16;
    const sectionCount = Math.max(1, Math.ceil(beats.length / beatsPerSection));
    return Array.from({ length: sectionCount }, (_, i) => {
      const startSec = beats[i * beatsPerSection] ?? 0;
      const endBeat = Math.min((i + 1) * beatsPerSection, beats.length) - 1;
      const endSec = beats[endBeat] ?? (activeWaveform?.duration ?? 60);
      const count = fireData.rawFires.filter(
        (f) => (f.time_sec ?? 0) >= startSec && (f.time_sec ?? 0) < endSec,
      ).length;
      return { i, startSec, endSec, count };
    });
  }, [filmMode, fireData.rawFires, beatGrid, activeWaveform]);

  const beatSectionSummary = useMemo(() => {
    if (!beatSectionFires || beatSectionFires.length === 0) return null;
    return {
      maxSectionFires: Math.max(1, ...beatSectionFires.map((s) => s.count)),
      topSection: beatSectionFires.reduce((a, b) => (b.count > a.count ? b : a)),
    };
  }, [beatSectionFires]);

  const lyricFireBreakdown = useMemo(() => {
    if (fireData.fireStrength.length === 0) return null;
    const sections = ((cinematicDirection as any)?.sections as any[]) ?? [];
    const linesBySection: Map<number, typeof allLines> = new Map();
    for (const line of allLines) {
      let secIdx = 0;
      for (let s = 0; s < sections.length; s++) {
        const sec = sections[s];
        const start = sec.startSec ?? sec.start ?? 0;
        const end = sec.endSec ?? sec.end ?? Infinity;
        if (line.startSec >= start && line.startSec < end) {
          secIdx = s;
          break;
        }
      }
      if (!linesBySection.has(secIdx)) linesBySection.set(secIdx, []);
      linesBySection.get(secIdx)!.push(line);
    }
    const fireMap = new Map<
      number,
      { fire_count: number; fire_strength: number; avg_hold_ms: number }
    >();
    for (const row of fireData.fireStrength) fireMap.set(row.line_index, row);
    const maxStrength = fireData.fireStrength[0]?.fire_strength ?? 1;
    return { sections, linesBySection, fireMap, maxStrength };
  }, [fireData.fireStrength, cinematicDirection, allLines]);

  const sectionFireCounts = useMemo(() => {
    if (!lyricFireBreakdown || lyricFireBreakdown.linesBySection.size < 2) return [];
    const { linesBySection, fireMap, sections } = lyricFireBreakdown;
    return Array.from(linesBySection.entries())
      .map(([secIdx, lines]) => ({
        secIdx,
        fires: lines.reduce((s, l) => s + (fireMap.get(l.lineIndex)?.fire_count ?? 0), 0),
        label:
          (sections[secIdx] as any)?.description?.slice(0, 30) ??
          `Section ${secIdx + 1}`,
      }))
      .filter((s) => s.fires > 0)
      .sort((a, b) => b.fires - a.fires);
  }, [lyricFireBreakdown]);

  useEffect(() => {
    setFireData(initialFireData);
  }, [publishedDanceId]);

  useEffect(() => {
    if (subView !== "data" || !publishedDanceId || fireData.resultsLoaded) return;
    Promise.all([
      fetchFireStrength(publishedDanceId),
      fetchFireData(publishedDanceId),
      supabase
        .from("v_closing_distribution" as any)
        .select("hook_index, pick_count, pct")
        .eq("project_id", publishedDanceId),
      supabase
        .from("v_free_form_responses" as any)
        .select("free_text, repeat_count")
        .eq("project_id", publishedDanceId)
        .limit(20),
      supabase
        .from("project_fires" as any)
        .select("id", { count: "exact", head: true })
        .eq("project_id", publishedDanceId),
      supabase
        .from("project_exposures" as any)
        .select("session_id", { count: "exact" })
        .eq("project_id", publishedDanceId),
    ]).then(([strength, fires, dist, free, count, exposures]) => {
      // TODO: if project_exposures is not already session-deduplicated, switch this
      // to a distinct-session count query and keep the Set fallback below.
      setFireData({
        fireStrength: strength,
        rawFires: fires,
        closingDist: (dist.data as any[]) ?? [],
        freeResponses: (free.data as any[]) ?? [],
        totalFires: count.count ?? 0,
        uniqueListeners:
          exposures.count ??
          new Set(((exposures.data ?? []) as any[]).map((r: any) => r.session_id))
            .size,
        resultsLoaded: true,
      });
    });
  }, [subView, publishedDanceId, fireData.resultsLoaded]);

  const handleRetryImages = useCallback(() => {
    void pipeline.retryImages();
  }, [pipeline]);

  return (
    <>
      <div className="flex-1 px-4 py-6 space-y-4 max-w-2xl mx-auto">
        {/* Dance preview — hidden on Data view */}
        <div style={{ display: subView === "fit" ? undefined : "none" }}>
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
                onClick={() => {
                  const isUnlimited = !!(profile as any)?.is_unlimited;
                  if (!isUnlimited && !canCreate && !crowdfitPostId) {
                    const remaining = required - credits;
                    toast.error(`Fire ${remaining} song${remaining === 1 ? "" : "s"} to unlock posting`);
                    return;
                  }
                  handleCrowdfitToggle();
                }}
                disabled={crowdfitToggling}
                className={`flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase transition-colors border rounded-lg px-3 py-2.5 ${
                  crowdfitPostId
                    ? "text-primary border-primary/40 bg-primary/5"
                    : "text-foreground hover:text-primary border-border/40 hover:border-primary/40"
                } disabled:opacity-50`}
                title={
                  crowdfitPostId
                    ? "Remove from FMLY"
                    : "Post to FMLY"
                }
              >
                {crowdfitToggling ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : null}
                {crowdfitPostId ? "Live" : "Post to FMLY"}
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
                    const model = meta?.scene?.model || (meta ? "unknown" : "loaded from DB");
                    const sceneSource = meta?.scene?.scenePromptSource || (meta ? "?" : "saved");
                    const phraseMode = meta?.mode || "deterministic_v3";
                    const phraseCount = cinematicDirection?.phrases?.length ?? 0;
                    toast.success(`Copied — model: ${model} | scene: ${sceneSource} | phrases: ${phraseMode} (${phraseCount})`);
                  }}
                  className="flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase transition-colors border border-border/40 hover:border-primary/40 text-muted-foreground hover:text-primary rounded-lg px-3 py-2.5"
                >
                  Debug
                </button>
              )}
            </div>

            {/* Video player */}
            <div className="relative rounded-xl overflow-hidden w-full" style={{ height: 480 }}>
              {playerReady || imageWaitExpired ? (
                <Suspense
                  fallback={
                    <div className="absolute inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center gap-3">
                      <Loader2 size={20} className="animate-spin text-white/20" />
                      <span className="text-[10px] font-mono text-white/25 tracking-wider uppercase">
                        loading...
                      </span>
                    </div>
                  }
                >
                  {LyricDanceEmbedModule ? (
                    <LyricDanceEmbedModule
                      ref={dancePlayerRef}
                      lyricDanceId={publishedDanceId}
                      songTitle={lyricData.title || "Untitled"}
                      artistName={profile?.display_name || ""}
                      avatarUrl={profile?.avatar_url ?? null}
                      isVerified={profile?.is_verified ?? false}
                      userId={user?.id ?? null}
                      prefetchedData={prefetchedDanceData}
                    />
                  ) : null}
                </Suspense>
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
            {pipeline.savedId ? (
              <SpotifyLinkField
                spotifyTrackId={pipeline.spotifyTrackId}
                setSpotifyTrackId={pipeline.setSpotifyTrackId}
                savedId={pipeline.savedId}
              />
            ) : null}

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
                waveform={activeWaveform}
                isPlaying={isPlaying}
                currentTime={currentTime}
                onSeek={handleSeek}
                onTogglePlay={handleTogglePlay}
                beats={beatGrid?.beats ?? null}
                beatGridLoading={false}
              />
            </div>
          ) : null}
        </div>

        {subView === "data" && (
          <div className="space-y-5 pb-8">
            {!publishedDanceId && (
              <div className="flex flex-col items-center gap-3 py-12">
                <span style={{ fontSize: 32 }}>🔥</span>
                <p className="text-[12px] text-muted-foreground text-center leading-relaxed max-w-[260px]">
                  Publish your {filmMode === "beat" ? "beat" : "song"} to start collecting signal.
                </p>
              </div>
            )}

            {publishedDanceId && (
              <>
                {/* ── Headline ── */}
                {fireData.totalFires > 0 && (
                  <div className="space-y-1.5 px-1">
                    <div className="flex items-baseline gap-3">
                      <span style={{ fontSize: 28 }}>🔥</span>
                      <span className="text-[28px] font-mono font-medium text-foreground">{fireData.totalFires}</span>
                      <span className="text-[11px] font-mono text-muted-foreground">fires</span>
                      {fireData.uniqueListeners > 0 && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="text-[11px] font-mono text-muted-foreground">{fireData.uniqueListeners} listener{fireData.uniqueListeners !== 1 ? "s" : ""}</span>
                        </>
                      )}
                    </div>
                    {fireData.uniqueListeners > 1 && (
                      <p className="text-[12px] text-muted-foreground/60 leading-relaxed">
                        {fireData.totalFires / fireData.uniqueListeners >= 3
                          ? `${(fireData.totalFires / fireData.uniqueListeners).toFixed(1)} fires per listener — people are reacting to multiple moments.`
                          : fireData.totalFires / fireData.uniqueListeners >= 1.5
                            ? `${(fireData.totalFires / fireData.uniqueListeners).toFixed(1)} fires per listener — your song has more than one moment that hits.`
                            : `${(fireData.totalFires / fireData.uniqueListeners).toFixed(1)} fires per listener. More shares will reveal which lines connect deepest.`
                        }
                      </p>
                    )}
                  </div>
                )}

            {/* ── Fire Heatmap Waveform ── */}
            {filmMode !== "beat" && fireHeatmapData && activeWaveform && (
              <div className="glass-card rounded-xl p-4 space-y-2">
                <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  fire heatmap
                </p>
                <div className="relative" style={{ height: 64 }}>
                  <canvas
                    ref={fireHeatmapCanvasRef}
                    className="absolute inset-0 w-full h-full"
                  />
                </div>
                {fireHeatmapData.peakLine && (
                  <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
                    Hottest moment at {fmtTime(fireHeatmapData.peakTimeSec)} — "{fireHeatmapData.peakLine.text.slice(0, 50)}{fireHeatmapData.peakLine.text.length > 50 ? "…" : ""}"
                  </p>
                )}
              </div>
            )}

            {filmMode === "beat" && beatSectionFires && beatSectionSummary && (
              <div className="glass-card rounded-xl p-4 space-y-3">
                <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  fire moments by timestamp
                </p>
                <div className="space-y-2">
                  {beatSectionFires.map((section) => {
                    const width =
                      (section.count / beatSectionSummary.maxSectionFires) * 100;
                    const isTop = beatSectionSummary.topSection?.i === section.i;
                    return (
                      <div key={section.i} className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className={isTop ? "text-primary" : "text-muted-foreground"}>
                            {fmtTime(section.startSec)}
                          </span>
                          <span className={isTop ? "text-primary" : "text-muted-foreground/70"}>
                            {section.count} fires
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${width}%`,
                              background: isTop
                                ? "var(--primary)"
                                : "rgba(255,120,30,0.45)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Section-by-section lyric breakdown ── */}
            {lyricFireBreakdown && (
              <div className="space-y-3">
                <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider px-1">
                  fire by section
                </p>
                {Array.from(lyricFireBreakdown.linesBySection.entries()).map(
                  ([secIdx, sectionLines]) => {
                    const sec = lyricFireBreakdown.sections[secIdx] ?? {};
                    const sectionFires = sectionLines.reduce(
                      (sum, l) =>
                        sum +
                        (lyricFireBreakdown.fireMap.get(l.lineIndex)?.fire_count ?? 0),
                      0,
                    );
                    if (sectionLines.length === 0) return null;

                    const label = sec.description
                      ? sec.description.slice(0, 40)
                      : `Section ${secIdx + 1}`;

                    return (
                      <div key={secIdx} className="glass-card rounded-xl p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                            {label}
                          </span>
                          {sectionFires > 0 && (
                            <span className="text-[10px] font-mono text-orange-400/70">
                              🔥 {sectionFires}
                            </span>
                          )}
                        </div>
                        {sectionLines
                          .filter((l) => l.text.trim())
                          .map((line) => {
                            const fire = lyricFireBreakdown.fireMap.get(line.lineIndex);
                            const pct = fire
                              ? Math.round(
                                  (fire.fire_strength / lyricFireBreakdown.maxStrength) *
                                    100,
                                )
                              : 0;
                            const holdLabel = fire
                              ? fire.avg_hold_ms < 300
                                ? "tap"
                                : fire.avg_hold_ms < 1000
                                  ? "hold"
                                  : "deep"
                              : null;

                            return (
                              <div key={line.lineIndex} className="relative py-1">
                                {pct > 0 && (
                                  <div
                                    className="absolute inset-y-0 left-0 rounded"
                                    style={{
                                      width: `${pct}%`,
                                      background:
                                        "linear-gradient(90deg, rgba(255,120,30,0.08) 0%, rgba(255,120,30,0.15) 100%)",
                                    }}
                                  />
                                )}
                                <div className="relative flex items-center justify-between gap-2 px-1.5">
                                  <span
                                    className={`text-[11px] leading-snug flex-1 min-w-0 ${
                                      fire
                                        ? "text-foreground/80"
                                        : "text-muted-foreground/40"
                                    }`}
                                  >
                                    {line.text}
                                  </span>
                                  {fire && (
                                    <span className="text-[9px] font-mono text-orange-400/50 shrink-0">
                                      {fire.fire_count}× {holdLabel}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    );
                  },
                )}

                {sectionFireCounts.length >= 2 &&
                  (sectionFireCounts[0].fires > sectionFireCounts[1].fires * 2 ? (
                    <p className="text-[11px] text-muted-foreground/50 px-1 leading-relaxed">
                      "{sectionFireCounts[0].label}" is carrying your song — it has {Math.round((sectionFireCounts[0].fires / sectionFireCounts.reduce((s, c) => s + c.fires, 0)) * 100)}% of all fires. That's your clip section.
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/50 px-1 leading-relaxed">
                      Fires spread across multiple sections — your song holds attention from start to finish.
                    </p>
                  ))}
              </div>
            )}

            {/* ── What your song did (closing screen) ── */}
            {fireData.closingDist.length > 0 && empowermentPromise && (
              <div className="glass-card rounded-xl p-4 space-y-3">
                <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  what your song did for them
                </p>
                <p className="text-[11px] text-muted-foreground/40 mb-1">
                  After listening: "How does this make you feel?"
                </p>
                {fireData.closingDist.map((row) => {
                  const label = empowermentPromise.hooks[row.hook_index] ?? `feeling ${row.hook_index}`;
                  return (
                    <div key={row.hook_index} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono text-foreground/75 flex-1 truncate min-w-0">{label}</span>
                        <span className="text-[10px] font-mono text-primary/70 shrink-0 ml-2">{row.pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${row.pct}%`, background: "rgba(255,120,30,0.5)" }} />
                      </div>
                    </div>
                  );
                })}
                {fireData.closingDist.length >= 2 && fireData.closingDist[0]?.pct >= 50 && (
                  <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
                    Over half landed on "{empowermentPromise.hooks[fireData.closingDist[0].hook_index]?.slice(0, 40)}." That's your song's emotional center — use it in captions and promo.
                  </p>
                )}
              </div>
            )}

            {/* ── In their own words ── */}
            {fireData.freeResponses.length > 0 && (
              <div className="glass-card rounded-xl p-4 space-y-2">
                <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-3">
                  in their own words
                </p>
                {fireData.freeResponses.map((r, i) => (
                  <div key={i} className="flex items-start gap-2.5 py-1.5 border-b border-border/20 last:border-0">
                    <span className="text-[11px] text-foreground/70 flex-1 leading-snug font-light italic">"{r.free_text}"</span>
                    {r.repeat_count > 1 && (
                      <span className="text-[9px] font-mono text-primary/40 shrink-0 mt-0.5">×{r.repeat_count}</span>
                    )}
                  </div>
                ))}
                {fireData.freeResponses.length >= 3 && (
                  <p className="text-[11px] text-muted-foreground/50 pt-2 leading-relaxed">
                    These are captions waiting to happen. When listeners describe your song in their own words, that's your marketing language.
                  </p>
                )}
              </div>
            )}

            {/* ── Clip suggestions (kept) ── */}
            {fireData.closingDist.slice(0, 3).map((row) => {
              if (!empowermentPromise || row.pct < 10) return null;
              const feeling = empowermentPromise.hooks[row.hook_index];
              if (!feeling) return null;
              const topFireLine = fireData.fireStrength[0];
              const topLine = allLines.find((l) => l.lineIndex === topFireLine?.line_index);
              const caption = captions[row.hook_index] ?? feeling;
              return (
                <div key={row.hook_index} className="glass-card rounded-xl p-4 space-y-3 border border-primary/10">
                  <p className="text-[9px] font-mono text-primary/60 uppercase tracking-wider">{row.pct}% felt "{feeling.slice(0, 28)}"</p>
                  <p className="text-[13px] font-mono text-foreground/85 italic">"{caption}"</p>
                  {topLine && <p className="text-[9px] font-mono text-muted-foreground/50">best moment · {topLine.text.slice(0, 40)}</p>}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => {
                        const player = dancePlayerRef.current?.getPlayer();
                        if (player && topFireLine) {
                          if (topLine) {
                            player.setRegion(Math.max(0, topLine.startSec - 1.5), topLine.startSec + 10);
                            (player as any).setClipCaption?.(caption);
                            player.play();
                          }
                        }
                      }}
                      className="flex-1 py-2 text-[9px] font-mono uppercase tracking-wider rounded-lg border border-border/40 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                    >
                      preview clip
                    </button>
                    <button
                      onClick={() => {
                        setClipComposerVisible(true);
                        setClipComposerCaption(caption);
                        setClipComposerStart(Math.max(0, (topLine?.startSec ?? 0) - 1.5));
                      }}
                      className="flex-1 py-2 text-[9px] font-mono uppercase tracking-wider rounded-lg border border-primary/30 text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors"
                    >
                      export clip
                    </button>
                  </div>
                </div>
              );
            })}

            {clipComposerVisible && (
              <ClipComposer
                visible={clipComposerVisible}
                player={dancePlayerRef.current?.getPlayer() ?? null}
                durationSec={dancePlayerRef.current?.getPlayer()?.audio?.duration ?? 0}
                fires={fireData.rawFires}
                lines={allLines.map((l) => ({
                  lineIndex: l.lineIndex,
                  text: l.text,
                  startSec: l.startSec,
                  endSec: l.startSec + 5,
                }))}
                initialStart={clipComposerStart}
                initialEnd={clipComposerStart + 12}
                initialCaption={clipComposerCaption}
                songTitle={lyricData.title || "Untitled"}
                onClose={() => {
                  setClipComposerVisible(false);
                  const player = dancePlayerRef.current?.getPlayer();
                  if (player) {
                    player.setRegion(undefined, undefined);
                  }
                }}
              />
            )}

            {/* ── Empty state ── */}
                {fireData.totalFires === 0 && fireData.resultsLoaded && (
                  <div className="flex flex-col items-center gap-3 py-12">
                    <span style={{ fontSize: 32 }}>🔥</span>
                    <p className="text-[12px] text-muted-foreground text-center leading-relaxed max-w-[260px]">
                      Share your song to start collecting signal. Every fire shows up here — mapped to the exact lyric and moment in the song.
                    </p>
                  </div>
                )}
                {fireData.totalFires === 0 && !fireData.resultsLoaded && (
                  <div className="flex justify-center py-12">
                    <Loader2 size={18} className="animate-spin text-muted-foreground/30" />
                  </div>
                )}
              </>
            )}
          </div>
        )}


        {subView === "fit" && (
          <>
        {/* Single-column report */}
        <div className="space-y-3">
          {!allCoreDone && (
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
                <div>Render data: {generationStatus.renderData}</div>
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
            allCoreDone &&
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
                        <span className="text-[10px] font-mono px-2 py-1 rounded bg-muted/60 text-muted-foreground border border-border/60">
                          {empowermentPromise.fromState}
                        </span>
                        <span className="text-muted-foreground/50">→</span>
                        <span className="text-[10px] font-mono px-2 py-1 rounded bg-primary/10 text-primary border border-primary/25">
                          {empowermentPromise.toState}
                        </span>
                      </div>

                      <p className="text-sm font-semibold text-foreground leading-snug">
                        {empowermentPromise.promise}
                      </p>

                      <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] font-mono text-muted-foreground/70 uppercase tracking-wider">
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
                            <div key={i} className="relative rounded-lg overflow-hidden border border-border/60 bg-background/40">
                              {totalVotes > 0 && (
                                <div
                                  className="absolute inset-y-0 left-0 transition-all duration-500"
                                  style={{
                                    width: `${pct}%`,
                                    background: isWinner
                                      ? "hsl(var(--primary) / 0.12)"
                                      : "hsl(var(--muted) / 0.6)",
                                  }}
                                />
                              )}
                              <div className="relative flex items-center gap-2.5 px-2.5 py-2">
                                <span className="text-[9px] font-mono text-muted-foreground/70 shrink-0 w-4">
                                  {String(i + 1).padStart(2, "0")}
                                </span>
                                <span
                                  className={`text-[11px] flex-1 leading-snug ${isWinner ? "text-foreground" : "text-foreground/85"}`}
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
                                    <span className="text-[9px] font-mono text-muted-foreground w-8 text-right">
                                      {pct}%
                                    </span>
                                  )}
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(hook);
                                    }}
                                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
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
                  Scene Data
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

        </div>
          </>
        )}
      </div>
    </>
  );
}
