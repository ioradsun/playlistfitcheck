import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Zap,
  Play,
  Pause,
  Copy,
  Repeat2,
  MoreHorizontal,
  AlertCircle,
  RotateCcw,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/slugify";
import { useAuth } from "@/hooks/useAuth";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { SignUpToSaveBanner } from "@/components/SignUpToSaveBanner";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { type BeatGridData } from "@/hooks/useBeatGrid";
import { LyricWaveform } from "./LyricWaveform";
import { VersionToggle, type ActiveVersion } from "./VersionToggle";
import {
  LyricFormatControls,
  type LineFormat,
  type SocialPreset,
} from "./LyricFormatControls";
import { FmlyFriendlyPanel } from "./FmlyFriendlyPanel";
import { PublishHookButton } from "./PublishHookButton";
// PublishLyricDanceButton removed — publishing handled by FitTab
import {
  applyProfanityFilter,
  type Strictness,
  type ProfanityReport,
} from "@/lib/profanityFilter";
import { ensureFontReady } from "@/lib/fontReadinessCache";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { WaveformData } from "@/hooks/useAudioEngine";
import type {
  ArtistDNA,
  FingerprintSongContext,
} from "./ArtistFingerprintTypes";
export interface LyricLine {
  start: number;
  end: number;
  text: string;
  tag?: "main" | "adlib";
  isFloating?: boolean; // v2.2: adlib has no Whisper word match within ±1.5s
  geminiConflict?: string; // v2.2: Whisper alternative text when Gemini text diverges
  confidence?: number; // v2.2: per-adlib confidence from Gemini
  isCorrection?: boolean; // v3.7: line had a phonetic QA word swap applied
  correctedWord?: string; // v3.7: the replacement word (e.g. "rain") for purple underline
}

export interface LyricHook {
  start: number;
  end: number;
  score: number;
  reasonCodes: string[];
  previewText: string;
  status?: "confirmed" | "candidate"; // v2.2: candidate = confidence < 0.75
}

export interface SavedCustomHook extends LyricHook {
  color: string;
}

export interface LyricMetadata {
  mood?: string;
  description?: string;
  confidence?: number;
  mood_confidence?: number;
  bpm?: number;
  bpm_confidence?: number;
  meaning?: {
    theme?: string;
    summary?: string;
    imagery?: string[];
  };
}

export interface LyricData {
  title: string;
  artist?: string; // Transcription-detected song artist — display only, NOT user identity
  lines: LyricLine[];
  hooks?: LyricHook[];
  metadata?: LyricMetadata;
}

interface VersionMeta {
  lineFormat: LineFormat;
  socialPreset: SocialPreset;
  strictness: Strictness;
  lastEdited?: string;
}

function normalizeRenderDataWithManifest(
  renderData: any,
  _fallbackTitle: string,
): any {
  return renderData;
}


interface Props {
  data: LyricData;
  audioFile: File;
  hasRealAudio?: boolean;
  savedId?: string | null;
  fmlyLines?: LyricLine[] | null;
  versionMeta?: {
    explicit?: Partial<VersionMeta>;
    fmly?: Partial<VersionMeta>;
  } | null;
  initialBeatGrid?: BeatGridData | null;
  initialWaveform?: WaveformData | null;
  initialRenderData?: any | null;
  onBack: () => void;
  onSaved?: (id: string) => void;
  onReuploadAudio?: (file: File) => void;
  onLinesChange?: (lines: LyricLine[]) => void;
  onHeaderProject?: (
    project: {
      title: string;
      onBack: () => void;
      rightContent?: React.ReactNode;
      onTitleChange?: (newTitle: string) => void;
    } | null,
  ) => void;
  onTitleChange?: (newTitle: string) => void;
  debugData?: any | null;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function formatTimeLRC(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

function formatTimeSRT(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function formatTimeShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function toLRC(data: LyricData): string {
  const mainLines = data.lines.filter((l) => l.tag !== "adlib");
  return [
    `[ti:${data.title}]`,
    ...(data.artist ? [`[ar:${data.artist}]`] : []),
    "",
    ...mainLines.map((l) => `[${formatTimeLRC(l.start)}]${l.text}`),
  ].join("\n");
}

function toSRT(data: LyricData): string {
  const mainLines = data.lines.filter((l) => l.tag !== "adlib");
  return mainLines
    .map(
      (l, i) =>
        `${i + 1}\n${formatTimeSRT(l.start)} --> ${formatTimeSRT(l.end)}\n${l.text}\n`,
    )
    .join("\n");
}

function toPlainText(data: LyricData): string {
  const mainLines = data.lines.filter((l) => l.tag !== "adlib");
  return mainLines.map((l) => l.text).join("\n");
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Re-split main lines by format while preserving timestamps */
function applyLineFormat(lines: LyricLine[], format: LineFormat): LyricLine[] {
  if (format === "natural") return lines;

  const result: LyricLine[] = [];

  lines.forEach((line) => {
    // Pass adlibs through unchanged
    if (line.tag === "adlib") {
      result.push(line);
      return;
    }

    const words = line.text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    let groups: string[][] = [];

    if (format === "1_word") {
      groups = words.map((w) => [w]);
    } else if (format === "2_3_words") {
      for (let i = 0; i < words.length; i += 3)
        groups.push(words.slice(i, i + 3));
    } else if (format === "4_6_words") {
      for (let i = 0; i < words.length; i += 5)
        groups.push(words.slice(i, i + 5));
    } else if (format === "break_on_pause") {
      const text = line.text;
      const parts = text.split(/([,;:.!?]+\s*)/).filter(Boolean);
      const merged: string[] = [];
      let cur = "";
      parts.forEach((p) => {
        cur += p;
        if (/[,;:.!?]/.test(p)) {
          merged.push(cur.trim());
          cur = "";
        }
      });
      if (cur.trim()) merged.push(cur.trim());
      groups = merged.map((m) => [m]);
    } else {
      groups = [words];
    }

    const segDuration = (line.end - line.start) / Math.max(groups.length, 1);
    groups.forEach((g, gi) => {
      result.push({
        start: line.start + gi * segDuration,
        end: line.start + (gi + 1) * segDuration,
        text: format === "break_on_pause" ? g[0] : g.join(" "),
        tag: "main",
      });
    });
  });

  return result;
}

type ExportFormat = "lrc" | "srt" | "txt";

const EXPORT_OPTIONS: { format: ExportFormat; label: string; desc: string }[] =
  [
    { format: "lrc", label: "LRC", desc: "Synced" },
    { format: "srt", label: "SRT", desc: "Subtitles" },
    { format: "txt", label: "TXT", desc: "Plain" },
  ];

const DEFAULT_VERSION_META: VersionMeta = {
  lineFormat: "natural",
  socialPreset: "general",
  strictness: "standard",
};

// ── Hook score color ─────────────────────────────────────────────────────────
function hookScoreColor(score: number): string {
  if (score >= 85) return "text-green-400";
  if (score >= 70) return "text-yellow-400";
  return "text-muted-foreground";
}

// ── Component ─────────────────────────────────────────────────────────────────

const ADMIN_EMAILS = ["sunpatel@gmail.com", "spatel@iorad.com"];

export function LyricDisplay({
  data,
  audioFile,
  hasRealAudio = true,
  savedId,
  fmlyLines: initFmlyLines,
  versionMeta: initVersionMeta,
  initialBeatGrid,
  initialWaveform,
  initialRenderData,
  onBack,
  onSaved,
  onReuploadAudio,
  onLinesChange,
  onHeaderProject,
  onTitleChange,
}: Props) {
  const { user, roles } = useAuth();
  const siteCopy = useSiteCopy();
  const features = (siteCopy as any)?.features;
  const hookfitEnabled = features?.tools_enabled?.hookfit !== false;
  const hottestHooksEnabled = features?.hookfit_hottest_hooks !== false;
  const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email);
  const { decodeFile, play, stop, playingId, getPlayheadPosition } =
    useAudioEngine();

  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveform, setWaveform] = useState<WaveformData | null>(initialWaveform ?? null);
  // Beat grid from props only (no useBeatGrid hook — that's in FitTab now)
  const beatGrid = initialBeatGrid ?? null;
  const beatGridLoading = false;
  const rafRef = useRef<number | null>(null);

  // (timing offset removed — Scribe timestamps are accurate)

  // Clip loop state
  const [activeHookIndex, setActiveHookIndex] = useState<number | null>(null);
  const [clipProgress, setClipProgress] = useState(0); // 0-1 for the progress ring
  const clipProgressRafRef = useRef<number | null>(null);
  const loopRegionRef = useRef<{ start: number; end: number } | null>(null);

  // Version state
  const [activeVersion, setActiveVersion] = useState<ActiveVersion>("explicit");
  const [explicitLines, setExplicitLines] = useState<LyricLine[]>(data.lines);
  const [fmlyLines, setFmlyLines] = useState<LyricLine[] | null>(
    initFmlyLines ?? null,
  );
  const originalLines = useRef<LyricLine[]>(data.lines);
  const [fmlyReport, setFmlyReport] = useState<ProfanityReport | null>(null);

  // Per-version meta
  const [explicitMeta, setExplicitMeta] = useState<VersionMeta>({
    ...DEFAULT_VERSION_META,
    ...(initVersionMeta?.explicit ?? {}),
  });
  const [fmlyMeta, setFmlyMeta] = useState<VersionMeta>({
    ...DEFAULT_VERSION_META,
    strictness: "standard",
    ...(initVersionMeta?.fmly ?? {}),
  });

  // Editing
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  // Autosave
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [currentSavedId, setCurrentSavedId] = useState<string | null>(
    savedId ?? null,
  );
  const autosaveTimerRef = useRef<number | null>(null);
  const initialLoadRef = useRef(true);

  // Timestamps for version toggle
  const [explicitLastEdited, setExplicitLastEdited] = useState<Date | null>(
    null,
  );
  const [fmlyLastEdited, setFmlyLastEdited] = useState<Date | null>(null);

  // Lyric scroll
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const lyricRowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const autoScrollPausedRef = useRef(false);
  const autoScrollResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Copy state
  const [copied, setCopied] = useState<ExportFormat | null>(null);

  // (anchor state removed)

  // v2.2: Conflict resolution modal
  const [conflictLine, setConflictLine] = useState<{
    lineIndex: number;
    whisperText: string;
    geminiText: string;
  } | null>(null);

  const [artistFingerprint, setArtistFingerprint] = useState<ArtistDNA | null>(
    null,
  );
  const [battlePopupUrl, setBattlePopupUrl] = useState<string | null>(null);


  // Load fingerprint + display name from profile
  const [profileDisplayName, setProfileDisplayName] = useState<string>("—");
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("artist_fingerprint, display_name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.artist_fingerprint) {
          setArtistFingerprint(data.artist_fingerprint as unknown as ArtistDNA);
        }
        if (data?.display_name) {
          setProfileDisplayName(data.display_name);
        }
      });
  }, [user]);


  // Song DNA — on-demand generation
  const [renderData, setRenderData] = useState<Record<string, any> | null>(normalizeRenderDataWithManifest(initialRenderData, data.title) ?? null);
  useEffect(() => {
    // Font preloading — uses the same cache as the player
    const fontFamily = (initialRenderData as any)?.motionProfileSpec?.typographyProfile?.fontFamily;
    if (fontFamily) void ensureFontReady(fontFamily);
  }, [initialRenderData]);

  // Reset Song DNA when audio file changes (e.g. reupload)
  const audioFileRef = useRef(audioFile);
  useEffect(() => {
    if (audioFile !== audioFileRef.current) {
      audioFileRef.current = audioFile;
      setRenderData(null);
    }
  }, [audioFile]);


  // ── Active lines (format applied) ─────────────────────────────────────────
  const activeLinesRaw =
    activeVersion === "explicit" ? explicitLines : (fmlyLines ?? explicitLines);
  const activeMeta = activeVersion === "explicit" ? explicitMeta : fmlyMeta;
  const activeLines = applyLineFormat(activeLinesRaw, activeMeta.lineFormat);

  // Use currentTime directly (no offset)
  // Bug 2: epsilon prevents flickering at floating-point boundaries
  const HIGHLIGHT_EPSILON = 0.08;

  // ── Multi-active highlighting — supports overlapping adlibs ───────────────
  const activeLineIndices = new Set<number>(
    activeLines.reduce<number[]>((acc, l, i) => {
      if (currentTime >= l.start && currentTime < l.end + HIGHLIGHT_EPSILON)
        acc.push(i);
      return acc;
    }, []),
  );
  // Sticky: if no line is active, highlight the most recently passed main line
  if (activeLineIndices.size === 0) {
    let lastPassed = -1;
    for (let i = 0; i < activeLines.length; i++) {
      if (activeLines[i].tag !== "adlib" && currentTime >= activeLines[i].start)
        lastPassed = i;
    }
    if (lastPassed !== -1) activeLineIndices.add(lastPassed);
  }
  const primaryActiveLine = Math.min(
    ...(activeLineIndices.size > 0 ? [...activeLineIndices] : [-1]),
  );

  const scrollToActiveLine = useCallback((lineIndex: number) => {
    if (lineIndex < 0) return;
    const container = lyricsContainerRef.current;
    const row = lyricRowRefs.current[lineIndex];
    if (!container || !row) return;
    const targetScrollTop = row.offsetTop - container.clientHeight / 2 + row.offsetHeight / 2;
    container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: "smooth" });
  }, []);

  // ── Audio setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    const url = URL.createObjectURL(audioFile);
    audioUrlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;


    // Single RAF loop — only updates currentTime when audio is actually playing.
    let isRunning = true;
    let lastReportedTime = -1;
    const tick = () => {
      if (!isRunning) return;
      // Only update React state when playing AND the value actually changed
      if (!audio.paused) {
        const t = audio.currentTime;
        if (Math.abs(t - lastReportedTime) > 0.016) {
          lastReportedTime = t;
          setCurrentTime(t);
        }
        // Loop-region enforcement
        const region = loopRegionRef.current;
        if (region && t >= region.end) {
          audio.currentTime = region.start;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const handleEnded = () => {
      setIsPlaying(false);
      loopRegionRef.current = null;
      setActiveHookIndex(null);
    };

    audio.addEventListener("ended", handleEnded);

    // Only decode audio if we actually need the waveform or buffer for playback features
    // Skip decode entirely if waveform is already loaded from DB (prevents main-thread freeze)
    if (audioFile.size > 0 && !initialWaveform) {
      decodeFile(audioFile)
        .then(({ buffer, waveform: decoded }) => {
          setWaveform(decoded);
        })
        .catch(() => {});
    }

    return () => {
      isRunning = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
      URL.revokeObjectURL(url);
    };
  // decodeFile is intentionally omitted to avoid re-running setup when its identity changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioFile]);

  // Auto-scroll: keep active line centered in the container
  useEffect(() => {
    if (autoScrollPausedRef.current) return;
    scrollToActiveLine(primaryActiveLine);
  }, [scrollToActiveLine, primaryActiveLine]);

  // Pause auto-scroll when user manually scrolls; resume after 2.5s
  useEffect(() => {
    const container = lyricsContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      autoScrollPausedRef.current = true;
      if (autoScrollResumeTimerRef.current) clearTimeout(autoScrollResumeTimerRef.current);
      autoScrollResumeTimerRef.current = setTimeout(() => {
        autoScrollPausedRef.current = false;
        scrollToActiveLine(primaryActiveLine);
      }, 2500);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (autoScrollResumeTimerRef.current) clearTimeout(autoScrollResumeTimerRef.current);
    };
  }, [scrollToActiveLine, primaryActiveLine]);

  // ── Playback controls ─────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      loopRegionRef.current = null;
      setActiveHookIndex(null);
      if (clipProgressRafRef.current)
        cancelAnimationFrame(clipProgressRafRef.current);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const seekTo = useCallback(
    (time: number) => {
      if (!audioRef.current) return;
      const audio = audioRef.current;
      const wasPlaying = !audio.paused;
      loopRegionRef.current = null;
      setActiveHookIndex(null);
      if (clipProgressRafRef.current)
        cancelAnimationFrame(clipProgressRafRef.current);
      audio.currentTime = time;
      setCurrentTime(time);
      autoScrollPausedRef.current = false;
      if (wasPlaying) {
        audio.play().catch(() => {});
      }
      if (wasPlaying && !isPlaying) {
        setIsPlaying(true);
      } else if (!wasPlaying && isPlaying) {
        setIsPlaying(false);
      }
    },
    [isPlaying],
  );

  // ── Clip loop: play a hook region on repeat ───────────────────────────────
  const playClip = useCallback(
    (hook: LyricHook, hookIdx: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (activeHookIndex === hookIdx) {
        loopRegionRef.current = null;
        setActiveHookIndex(null);
        if (clipProgressRafRef.current)
          cancelAnimationFrame(clipProgressRafRef.current);
        setClipProgress(0);
        audio.pause();
        setIsPlaying(false);
        return;
      }
      loopRegionRef.current = { start: hook.start, end: hook.end };
      setActiveHookIndex(hookIdx);
      
      audio.currentTime = hook.start;
      audio.play();
      setIsPlaying(true);
      const duration = hook.end - hook.start;
      const tickProgress = () => {
        const region = loopRegionRef.current;
        if (!region) {
          setClipProgress(0);
          return;
        }
        const elapsed =
          (audio.currentTime - region.start + duration) % duration;
        setClipProgress(Math.min(Math.max(elapsed / duration, 0), 1));
        clipProgressRafRef.current = requestAnimationFrame(tickProgress);
      };
      if (clipProgressRafRef.current)
        cancelAnimationFrame(clipProgressRafRef.current);
      clipProgressRafRef.current = requestAnimationFrame(tickProgress);
    },
    [activeHookIndex],
  );

  // ── Copy Clip Info ────────────────────────────────────────────────────────
  const copyClipInfo = useCallback((hook: LyricHook) => {
    const text = `Start: ${formatTimeShort(hook.start)}\nEnd: ${formatTimeShort(hook.end)}\nDuration: ${Math.round(hook.end - hook.start)}s\n\nPreview:\n${hook.previewText}`;
    navigator.clipboard.writeText(text);
    toast.success("Clip info copied");
  }, []);

  // ── Autosave ──────────────────────────────────────────────────────────────
  const performSave = useCallback(async () => {
    if (!user) return;
    setSaveStatus("saving");
    try {
      // Upload audio to storage if we have a real file
      let audioUrl: string | null = null;
      if (hasRealAudio && audioFile.size > 0) {
        const fileExt = audioFile.name.split(".").pop() || "webm";
        const storagePath = `${user.id}/lyric/${currentSavedId || crypto.randomUUID()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("audio-clips")
          .upload(storagePath, audioFile, { upsert: true });
        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from("audio-clips")
            .getPublicUrl(storagePath);
          audioUrl = urlData.publicUrl;
        }
      }

      const payload: Record<string, any> = {
        title: data.title,
        lines: explicitLines as any,
        fmly_lines: (fmlyLines as any) ?? null,
        version_meta: {
          explicit: {
            lineFormat: explicitMeta.lineFormat,
            socialPreset: explicitMeta.socialPreset,
            lastEdited: new Date().toISOString(),
          },
          fmly: {
            lineFormat: fmlyMeta.lineFormat,
            socialPreset: fmlyMeta.socialPreset,
            strictness: fmlyMeta.strictness,
            lastEdited: new Date().toISOString(),
          },
        } as any,
        beat_grid: beatGrid
          ? ({
              bpm: beatGrid.bpm,
              beats: beatGrid.beats,
              confidence: beatGrid.confidence,
            } as any)
          : null,
        // Note: song_signature is NOT overwritten here — it's managed by the analysis pipeline
        ...(renderData ? { render_data: renderData as any } : {}),
        updated_at: new Date().toISOString(),
      };

      if (audioUrl) payload.audio_url = audioUrl;

      if (currentSavedId) {
        const { error } = await supabase
          .from("saved_lyrics")
          .update(payload)
          .eq("id", currentSavedId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from("saved_lyrics")
          .insert({ ...payload, user_id: user.id, filename: audioFile.name })
          .select("id")
          .single();
        if (error) throw error;
        if (inserted) {
          setCurrentSavedId(inserted.id);
          onSaved?.(inserted.id);
        }
      }

      // Keep published dance transcript in sync with autosaved lyrics so
      // embedded preview + Watch Dance page reflect latest edits immediately.
      const songSlug = slugify(data.title || "untitled");
      const publishedLines = explicitLines.filter((l) => l.tag !== "adlib");
      if (songSlug) {
        await supabase
          .from("shareable_lyric_dances" as any)
          .update({ lyrics: publishedLines } as any)
          .eq("user_id", user.id)
          .eq("song_slug", songSlug);
      }

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      console.error("Autosave error:", e);
      setSaveStatus("idle");
    }
  }, [
    user,
    currentSavedId,
    data,
    explicitLines,
    fmlyLines,
    explicitMeta,
    fmlyMeta,
    audioFile,
    hasRealAudio,
    onSaved,
    beatGrid,
    renderData,
  ]);

  const scheduleAutosave = useCallback(() => {
    if (!user) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    setSaveStatus("saving");
    autosaveTimerRef.current = window.setTimeout(() => {
      performSave();
    }, 1500);
  }, [user, performSave]);

  useEffect(() => {
    // Skip the initial render — don't autosave when data is just loaded from DB
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }
    scheduleAutosave();
  }, [explicitLines, fmlyLines, explicitMeta, fmlyMeta, beatGrid, renderData]);

  // Sync explicit lines back to parent so tab switches preserve edits
  const onLinesChangeRef = useRef(onLinesChange);
  onLinesChangeRef.current = onLinesChange;
  const linesInitRef = useRef(true);
  useEffect(() => {
    if (linesInitRef.current) { linesInitRef.current = false; return; }
    onLinesChangeRef.current?.(explicitLines);
  }, [explicitLines]);

  // ── Editing ───────────────────────────────────────────────────────────────
  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditText(activeLines[index].text);
  };

  const commitEdit = () => {
    if (editingIndex === null) return;
    const editedLine = activeLines[editingIndex];
    const updatedText = editText;
    if (activeVersion === "explicit") {
      setExplicitLines((prev) =>
        prev.map((l) =>
          l.start === editedLine.start && l.tag === editedLine.tag
            ? { ...l, text: updatedText }
            : l,
        ),
      );
      setExplicitLastEdited(new Date());
    } else {
      setFmlyLines((prev) =>
        prev
          ? prev.map((l) =>
              l.start === editedLine.start && l.tag === editedLine.tag
                ? { ...l, text: updatedText }
                : l,
            )
          : prev,
      );
      setFmlyLastEdited(new Date());
    }
    setEditingIndex(null);
  };

  // ── FMLY Generation ───────────────────────────────────────────────────────
  const handleGenerateFmly = useCallback(() => {
    const { filteredLines, report } = applyProfanityFilter(
      explicitLines,
      fmlyMeta.strictness,
    );
    setFmlyLines(filteredLines);
    setFmlyReport(report);
    setFmlyLastEdited(new Date());
    setActiveVersion("fmly");
    if (report.totalFlagged === 0) {
      toast.success("No profanity detected — FMLY Friendly version is clean!");
    } else {
      toast.success(
        `FMLY Friendly generated — ${report.totalFlagged} word${report.totalFlagged !== 1 ? "s" : ""} filtered`,
      );
    }
  }, [explicitLines, fmlyMeta.strictness]);

  // ── Format / meta updaters ────────────────────────────────────────────────
  const updateMeta = (version: ActiveVersion, patch: Partial<VersionMeta>) => {
    if (version === "explicit") {
      setExplicitMeta((m) => ({ ...m, ...patch }));
      setExplicitLastEdited(new Date());
    } else {
      setFmlyMeta((m) => ({ ...m, ...patch }));
      setFmlyLastEdited(new Date());
    }
  };

  // ── Export ────────────────────────────────────────────────────────────────
  const baseName = (
    data.title !== "Unknown" && data.title !== "Untitled"
      ? data.title
      : audioFile.name.replace(/\.[^.]+$/, "")
  ).replace(/\s+/g, "_");
  const versionSuffix =
    activeVersion === "explicit" ? "Explicit" : "FMLY_Friendly";
  const editedData: LyricData = { ...data, lines: activeLines };

  const handleCopy = (format: ExportFormat) => {
    const content =
      format === "lrc"
        ? toLRC(editedData)
        : format === "srt"
          ? toSRT(editedData)
          : toPlainText(editedData);
    navigator.clipboard.writeText(content);
    setCopied(format);
    toast.success(`${format.toUpperCase()} copied`);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownload = (format: ExportFormat) => {
    const filename = `${baseName}_${versionSuffix}.${format}`;
    if (format === "lrc")
      downloadFile(toLRC(editedData), filename, "text/plain");
    else if (format === "srt")
      downloadFile(toSRT(editedData), filename, "text/plain");
    else downloadFile(toPlainText(editedData), filename, "text/plain");
    toast.success(`${format.toUpperCase()} downloaded`);
  };

  const hooks = data.hooks ?? [];
  const metadata = data.metadata;

  // (drift/reset/offset removed — Scribe timestamps are accurate)

  // ── Tag toggle ─────────────────────────────────────────────────────────────
  const toggleLineTag = useCallback(
    (lineIndex: number) => {
      const line = activeLines[lineIndex];
      const newTag: "main" | "adlib" = line.tag === "adlib" ? "main" : "adlib";
      const updater = (prev: LyricLine[]) =>
        prev.map((l) =>
          l.start === line.start && l.text === line.text
            ? { ...l, tag: newTag }
            : l,
        );
      if (activeVersion === "explicit") {
        setExplicitLines(updater);
      } else {
        setFmlyLines((prev) => (prev ? updater(prev) : prev));
      }
      toast.success(
        newTag === "adlib"
          ? "Line converted to Adlib"
          : "Line converted to Main vocal",
      );
    },
    [activeLines, activeVersion],
  );

  // ── Word-level splitter ───────────────────────────────────────────────────
  // Store selection at mouseUp time — clicking the menu clears the browser selection
  const [selectionLineIndex, setSelectionLineIndex] = useState<number | null>(
    null,
  );
  const [capturedSelectionText, setCapturedSelectionText] =
    useState<string>("");

  const handleSplitToAdlib = useCallback(
    (lineIndex: number) => {
      const selectedText = capturedSelectionText.trim();
      if (!selectedText) {
        toast.error(
          "Select the adlib word(s) first, then choose Split new line Adlib",
        );
        return;
      }
      const line = activeLines[lineIndex];
      const remaining = line.text
        .replace(selectedText, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (!remaining) {
        toast.error("Cannot split — nothing would remain on the main line");
        return;
      }

      const mainLine: LyricLine = { ...line, text: remaining, tag: "main" };
      const adlibLine: LyricLine = {
        start: line.start,
        end: line.end,
        text: selectedText,
        tag: "adlib",
      };

      const updater = (prev: LyricLine[]): LyricLine[] => {
        const idx = prev.findIndex(
          (l) => l.start === line.start && l.text === line.text,
        );
        if (idx === -1) return prev;
        return [
          ...prev.slice(0, idx),
          mainLine,
          adlibLine,
          ...prev.slice(idx + 1),
        ];
      };
      if (activeVersion === "explicit") {
        setExplicitLines(updater);
      } else {
        setFmlyLines((prev) => (prev ? updater(prev) : prev));
      }
      setCapturedSelectionText("");
      setSelectionLineIndex(null);
      toast.success(`"${selectedText}" split to new Adlib line`);
    },
    [capturedSelectionText, activeLines, activeVersion],
  );

  // Report project title + right content (save indicator) to header
  useEffect(() => {
    const title =
      data.title && data.title !== "Unknown" && data.title !== "Untitled"
        ? data.title
        : audioFile.name.replace(/\.[^.]+$/, "");
    const rightContent = (
      <>
        {user && saveStatus !== "idle" && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {saveStatus === "saving" ? "● Saving…" : "✓ Saved"}
          </span>
        )}
      </>
    );
    onHeaderProject?.({ title, onBack, rightContent, onTitleChange });
    return () => onHeaderProject?.(null);
  }, [
    data.title,
    audioFile.name,
    onBack,
    onHeaderProject,
    saveStatus,
    user,
    isAdmin,
    onTitleChange,
    ]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <motion.div
      className="w-full space-y-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Metadata strip removed — mood/description now in Song DNA */}

      <div className="max-w-3xl mx-auto space-y-4">
        {/* ── Waveform — centered full width ── */}
        <div className="w-full">
          {/* Waveform */}
          <div className="glass-card rounded-xl p-3">
            {hasRealAudio ? (
              <>
                <LyricWaveform
                  waveform={waveform}
                  isPlaying={isPlaying}
                  currentTime={currentTime}
                  onSeek={seekTo}
                  onTogglePlay={togglePlay}
                  loopRegion={
                    activeHookIndex !== null && hooks[activeHookIndex]
                      ? {
                          start: hooks[activeHookIndex].start,
                          end: hooks[activeHookIndex].end,
                          duration: waveform?.duration ?? 1,
                        }
                      : null
                  }
                  beats={beatGrid?.beats ?? null}
                  beatGridLoading={beatGridLoading}
                />
                <AnimatePresence>
                  {activeHookIndex !== null && (
                    <motion.div
                      key="loop-indicator"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="flex items-center gap-1.5 mt-2 px-1"
                    >
                      <Repeat2
                        size={11}
                        className="text-primary animate-pulse"
                      />
                      <span className="text-[10px] font-mono text-primary">
                        Looping clip — click Stop to exit
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            ) : (
              <div className="h-16 flex items-center gap-3">
                <label className="cursor-pointer">
                  <span className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors border border-border/30 rounded px-2 py-1">
                    Reupload Song
                  </span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onReuploadAudio?.(f);
                    }}
                  />
                </label>
                <span className="text-[10px] text-muted-foreground/60 font-mono">
                  Audio files aren't saved or stored.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Two-column: Lyrics (left) + Controls (right) ── */}
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          {/* LEFT — Lyrics editor */}
          <div className="flex-1 min-w-0 w-full space-y-3">
          <div className="glass-card rounded-xl p-4 flex flex-col" style={{ height: "calc(100svh - 260px)" }}>
            {activeLines.length > 0 && (
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-muted-foreground">
                  Double-click to edit · Select text + ⋯ to split adlib
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground/50">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-sm bg-foreground/20 inline-block" />{" "}
                      main
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-sm bg-primary/20 inline-block" />{" "}
                      adlib
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (activeVersion === "explicit") {
                        setExplicitLines([...originalLines.current]);
                        setExplicitLastEdited(new Date());
                      } else if (fmlyLines) {
                        setFmlyLines(null);
                        setActiveVersion("explicit");
                      }
                      toast.success("Lyrics restored to original");
                    }}
                    className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RotateCcw size={10} />
                    Restore
                  </button>
                </div>
              </div>
            )}
            <div
              ref={lyricsContainerRef}
              className="relative overflow-y-auto flex-1 min-h-0 space-y-0.5 scroll-smooth"
            >
              {activeLines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {activeVersion === "fmly"
                    ? 'Click "Make FMLY Friendly" above to generate the clean version.'
                    : "No lyrics detected — this may be an instrumental track."}
                </p>
              ) : (
                activeLines.map((line, i) => {
                  const isAdlib = line.tag === "adlib";
                  const isFloating = isAdlib && line.isFloating;
                  // v3.8: hide conflict marker on QA-corrected lines (purple badge already shown)
                  const hasConflict =
                    isAdlib && !!line.geminiConflict && !line.isCorrection;
                  const isActive = activeLineIndices.has(i);
                  const isPrimary = i === primaryActiveLine;
                  const isEditing = i === editingIndex;
                  // Highlight lines that fall within the active looping hook
                  const activeHook =
                    activeHookIndex !== null ? hooks[activeHookIndex] : null;
                  const isInHook = activeHook
                    ? line.start >= activeHook.start &&
                      line.start < activeHook.end
                    : false;
                  const isSelected = selectionLineIndex === i;

                  // v6.0: No standalone chips — all adlibs render inline regardless of orphan/floating status

                  // v3.7: render corrected word with purple underline
                  const renderLineText = () => {
                    if (
                      !isEditing &&
                      !isAdlib &&
                      line.isCorrection &&
                      line.correctedWord &&
                      line.text.includes(line.correctedWord)
                    ) {
                      const parts = line.text.split(line.correctedWord);
                      return (
                        <span
                          className={`leading-relaxed cursor-text flex-1 select-text text-sm ${isSelected ? "bg-primary/10 rounded px-0.5" : ""}`}
                          onDoubleClick={() => startEditing(i)}
                          onMouseUp={() => {
                            const sel = window.getSelection();
                            if (sel && !sel.isCollapsed) {
                              setSelectionLineIndex(i);
                              setCapturedSelectionText(sel.toString());
                            } else {
                              setSelectionLineIndex(null);
                              setCapturedSelectionText("");
                            }
                          }}
                        >
                          {parts[0]}
                          <span
                            className="underline decoration-purple-400 decoration-2 underline-offset-2 text-purple-300"
                            title={`AI correction: was "${line.geminiConflict ?? "?"}" in transcript`}
                          >
                            {line.correctedWord}
                          </span>
                          {parts.slice(1).join(line.correctedWord)}
                        </span>
                      );
                    }
                    // Word-level highlighting: interpolate timestamps per word
                    const words = line.text.split(/(\s+)/);
                    const nonSpaceWords = words.filter(
                      (w) => w.trim().length > 0,
                    );
                    const totalChars = nonSpaceWords.reduce(
                      (s, w) => s + w.length,
                      0,
                    );
                    const lineDuration = line.end - line.start;

                    let charsSoFar = 0;
                    const wordTimings = nonSpaceWords.map((w) => {
                      const wordStart =
                        line.start + (charsSoFar / totalChars) * lineDuration;
                      charsSoFar += w.length;
                      const wordEnd =
                        line.start + (charsSoFar / totalChars) * lineDuration;
                      return { word: w, start: wordStart, end: wordEnd };
                    });

                    let timingIdx = 0;
                    return (
                      <span
                        className={`leading-relaxed cursor-text flex-1 select-text ${
                          isAdlib
                            ? "text-xs italic text-muted-foreground/80"
                            : "text-sm"
                        } ${isSelected ? "bg-primary/10 rounded px-0.5" : ""}`}
                        onDoubleClick={() => startEditing(i)}
                        onMouseUp={() => {
                          const sel = window.getSelection();
                          if (sel && !sel.isCollapsed) {
                            setSelectionLineIndex(i);
                            setCapturedSelectionText(sel.toString());
                          } else {
                            setSelectionLineIndex(null);
                            setCapturedSelectionText("");
                          }
                        }}
                      >
                        {words.map((token, ti) => {
                          if (token.trim().length === 0)
                            return <span key={ti}>{token}</span>;
                          const timing = wordTimings[timingIdx++];
                          const isWordActive =
                            isActive &&
                            timing &&
                            currentTime >= timing.start &&
                            currentTime < timing.end + HIGHLIGHT_EPSILON;
                          const isWordPast =
                            isActive &&
                            timing &&
                            currentTime >= timing.end + HIGHLIGHT_EPSILON;
                          // FMLY: highlight censored words (all asterisks) in green
                          const isCensored =
                            activeVersion === "fmly" &&
                            /^\*+$/.test(token.trim());
                          return (
                            <span
                              key={ti}
                              className={
                                isCensored
                                  ? "bg-primary/20 text-primary rounded px-0.5 font-semibold"
                                  : activeVersion === "fmly"
                                    ? "" // in FMLY mode, don't highlight non-censored words
                                    : isAdlib
                                      ? ""
                                      : isWordActive
                                        ? "font-semibold text-primary"
                                        : isWordPast
                                          ? "text-primary/60"
                                          : ""
                              }
                            >
                              {token}
                            </span>
                          );
                        })}
                      </span>
                    );
                  };

                  return (
                    <div
                      key={`${line.start}-${line.tag ?? "main"}-${i}`}
                      ref={(node) => {
                        lyricRowRefs.current[i] = node;
                      }}
                      className={`group flex items-start gap-3 px-3 py-1 rounded-lg transition-all ${
                        isAdlib ? "ml-6 opacity-70" : ""
                      } ${
                        isFloating
                          ? "border-l-2 border-dashed border-primary/30"
                          : ""
                      } ${
                        isActive
                          ? isAdlib
                            ? "bg-primary/5 text-foreground"
                            : "bg-primary/10 text-foreground"
                          : isInHook
                            ? "bg-primary/5 text-foreground/80"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                      }`}
                    >
                      <span
                        className="text-[10px] font-mono text-muted-foreground/60 pt-0.5 shrink-0 w-12 cursor-pointer hover:text-primary"
                        onClick={() => {
                          autoScrollPausedRef.current = false;
                          seekTo(line.start);
                          if (!isPlaying) togglePlay();
                        }}
                      >
                        {formatTimeLRC(line.start)}
                      </span>
                      {isEditing ? (
                        <input
                          autoFocus
                          className="flex-1 text-sm bg-transparent border-b border-primary outline-none leading-relaxed"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit();
                            if (e.key === "Escape") setEditingIndex(null);
                          }}
                        />
                      ) : (
                        renderLineText()
                      )}
                      {/* v2.2: Floating chip badge */}
                      {isFloating && (
                        <span
                          className="shrink-0 text-[9px] font-mono text-primary/50 border border-primary/20 rounded px-1 py-0.5 self-center"
                          title="Floating adlib — no matching word in Whisper timeline"
                        >
                          float
                        </span>
                      )}
                      {/* v3.7: QA correction badge on main lines */}
                      {!isAdlib && line.isCorrection && (
                        <span
                          className="shrink-0 text-[9px] font-mono text-purple-400/70 border border-purple-400/20 rounded px-1 py-0.5 self-center"
                          title={`AI corrected: "${line.geminiConflict}" → "${line.correctedWord}"`}
                        >
                          ✱ fix
                        </span>
                      )}
                      {/* v2.2: Conflict indicator 💡 */}
                      {hasConflict && (
                        <button
                          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity self-center"
                          title="Gemini and Whisper text differ — click to resolve"
                          onClick={() =>
                            setConflictLine({
                              lineIndex: i,
                              whisperText: line.geminiConflict!,
                              geminiText: line.text,
                            })
                          }
                        >
                          <AlertCircle size={12} className="text-yellow-500" />
                        </button>
                      )}
                      {/* Three-dot context menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 p-0.5 rounded text-muted-foreground/60 hover:text-foreground transition-all">
                            <MoreHorizontal size={14} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {isAdlib ? (
                            <DropdownMenuItem onClick={() => toggleLineTag(i)}>
                              Convert to Main vocal
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => toggleLineTag(i)}>
                              Convert to Adlib
                            </DropdownMenuItem>
                          )}
                          {!isAdlib && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleSplitToAdlib(i)}
                              >
                                Split new line Adlib
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Song DNA card removed — DNA now auto-generates in Fit tab */}
        </div>

        {/* ── RIGHT: Controls panel ── */}
        <div className="w-full lg:w-56 lg:shrink-0 space-y-4">
          {/* Version toggle */}
          <div className="glass-card rounded-xl p-3">
            <VersionToggle
              active={activeVersion}
              explicitLastEdited={explicitLastEdited}
              fmlyLastEdited={fmlyLastEdited}
              hasFmly={fmlyLines !== null}
              onChange={setActiveVersion}
            />
            {activeVersion === "fmly" && (
              <div className="mt-3 pt-3 border-t border-border/40">
                <FmlyFriendlyPanel
                  hasFmly={fmlyLines !== null}
                  report={fmlyReport}
                  onGenerate={handleGenerateFmly}
                  onSeek={seekTo}
                />
              </div>
            )}
          </div>

          {/* Format controls */}
          <div className="glass-card rounded-xl p-3">
            <LyricFormatControls
              activeVersion={activeVersion}
              lineFormat={activeMeta.lineFormat}
              socialPreset={activeMeta.socialPreset}
              strictness={fmlyMeta.strictness}
              onLineFormatChange={(v) =>
                updateMeta(activeVersion, { lineFormat: v })
              }
              onSocialPresetChange={(v) =>
                updateMeta(activeVersion, { socialPreset: v })
              }
              onStrictnessChange={(v) =>
                setFmlyMeta((m) => ({ ...m, strictness: v }))
              }
            />
          </div>

          {/* Export — under formatting */}
          {activeLines.length > 0 && (
            <div className="glass-card rounded-xl p-3">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
                Export · {versionSuffix}
              </p>
              <div className="space-y-0">
                {EXPORT_OPTIONS.map(({ format, label, desc }, idx) => (
                  <div
                    key={format}
                    className={`flex items-center justify-between py-2 ${idx > 0 ? "border-t border-border/30" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-medium text-foreground w-7">
                        {label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {desc}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => handleCopy(format)}
                      >
                        {copied === format ? "✓ Copied" : "Copy"}
                      </button>
                      <button
                        className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => handleDownload(format)}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                 ))}
               </div>
             </div>
           )}

           {/* Publish Hook Battle / Hook Page — below both hooks */}
           {hottestHooksEnabled && (renderData?.hook || renderData?.secondHook) && renderData?.motionProfileSpec && beatGrid && (
             <PublishHookButton
               hook={renderData.hook}
               secondHook={renderData.secondHook || null}
               hookLabel={renderData.hookLabel}
               secondHookLabel={renderData.secondHookLabel}
               motionProfileSpec={renderData.motionProfileSpec as PhysicsSpec}
               lines={data.lines}
               beatGrid={{
                 bpm: beatGrid.bpm,
                 beats: beatGrid.beats,
                 confidence: beatGrid.confidence,
               }}
               audioFile={audioFile}
               songTitle={data.title}
               system={renderData.motionProfileSpec.system}
               palette={
                 renderData.motionProfileSpec.palette || ["#ffffff", "#a855f7", "#ec4899"]
               }
               fingerprint={artistFingerprint}
               onViewBattle={(url) => setBattlePopupUrl(url)}
             />
           )}
         </div>
       </div>

           {/* Spacer so floating widget doesn't block last card */}
           <div className="h-20" />
         </div>

       <SignUpToSaveBanner />

      {/* v2.2: Conflict Resolution Modal — keeps Whisper timestamps, lets artist swap text */}
      <Dialog
        open={!!conflictLine}
        onOpenChange={(open) => {
          if (!open) setConflictLine(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <AlertCircle size={14} className="text-yellow-500" />
              Text Conflict Detected
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Gemini and Whisper identified different words at this timestamp.
              Whisper's timestamps are kept regardless — choose which text to
              display.
            </DialogDescription>
          </DialogHeader>
          {conflictLine && (
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="rounded-lg border border-border/40 p-3 space-y-1">
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    Gemini (AI label)
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    "{conflictLine.geminiText}"
                  </p>
                </div>
                <div className="rounded-lg border border-border/40 p-3 space-y-1">
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    Whisper (transcription)
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    "{conflictLine.whisperText}"
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">
                Timestamps always stay from Whisper — you're only choosing what
                text is shown.
              </p>
              <div className="flex gap-2">
                <button
                  className="flex-1 text-xs font-mono border border-border/50 rounded-lg py-2 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                  onClick={() => setConflictLine(null)}
                >
                  Keep Gemini
                </button>
                <button
                  className="flex-1 text-xs font-mono bg-primary/10 border border-primary/40 rounded-lg py-2 text-primary hover:bg-primary/20 transition-colors"
                  onClick={() => {
                    if (!conflictLine) return;
                    const line = activeLines[conflictLine.lineIndex];
                    const updater = (prev: LyricLine[]) =>
                      prev.map((l) =>
                        l.start === line.start && l.text === line.text
                          ? {
                              ...l,
                              text: conflictLine.whisperText,
                              geminiConflict: undefined,
                            }
                          : l,
                      );
                    if (activeVersion === "explicit") {
                      setExplicitLines(updater);
                    } else {
                      setFmlyLines((prev) => (prev ? updater(prev) : prev));
                    }
                    setConflictLine(null);
                    toast.success("Switched to Whisper transcription text");
                  }}
                >
                  Use Whisper text
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


      {/* Battle Page Popup Overlay */}
      <AnimatePresence>
        {battlePopupUrl && (
          <motion.div
            className="fixed inset-0 z-[100] bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <iframe
              src={battlePopupUrl}
              className="absolute inset-0 w-full h-full border-0"
              allow="autoplay"
            />
            <button
              onClick={() => setBattlePopupUrl(null)}
              className="absolute top-4 right-4 z-10 text-white/60 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
