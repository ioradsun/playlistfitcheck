import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Zap, Play, Pause, Copy, Repeat2, MoreHorizontal, AlertCircle, Video, Sparkles, Loader2, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { useAuth } from "@/hooks/useAuth";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { SignUpToSaveBanner } from "@/components/SignUpToSaveBanner";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { useBeatGrid, type BeatGridData } from "@/hooks/useBeatGrid";
import { LyricWaveform } from "./LyricWaveform";
import { VersionToggle, type ActiveVersion } from "./VersionToggle";
import { LyricFormatControls, type LineFormat, type SocialPreset } from "./LyricFormatControls";
import { FmlyFriendlyPanel } from "./FmlyFriendlyPanel";
import { LyricVideoComposer } from "./LyricVideoComposer";
import { applyProfanityFilter, type Strictness, type ProfanityReport } from "@/lib/profanityFilter";
import type { WaveformData } from "@/hooks/useAudioEngine";

export interface LyricLine {
  start: number;
  end: number;
  text: string;
  tag?: "main" | "adlib";
  isFloating?: boolean;      // v2.2: adlib has no Whisper word match within ±1.5s
  geminiConflict?: string;   // v2.2: Whisper alternative text when Gemini text diverges
  confidence?: number;       // v2.2: per-adlib confidence from Gemini
  isCorrection?: boolean;    // v3.7: line had a phonetic QA word swap applied
  correctedWord?: string;    // v3.7: the replacement word (e.g. "rain") for purple underline
}

export interface LyricHook {
  start: number;
  end: number;
  score: number;
  reasonCodes: string[];
  previewText: string;
  status?: "confirmed" | "candidate"; // v2.2: candidate = confidence < 0.75
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
  artist: string;
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

interface Props {
  data: LyricData;
  audioFile: File;
  hasRealAudio?: boolean;
  savedId?: string | null;
  fmlyLines?: LyricLine[] | null;
  versionMeta?: { explicit?: Partial<VersionMeta>; fmly?: Partial<VersionMeta> } | null;
  debugData?: any | null;
  initialBeatGrid?: BeatGridData | null;
  onBack: () => void;
  onSaved?: (id: string) => void;
  onReuploadAudio?: (file: File) => void;
  onHeaderProject?: (project: { title: string; onBack: () => void; rightContent?: React.ReactNode } | null) => void;
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
  return [`[ti:${data.title}]`, `[ar:${data.artist}]`, "", ...mainLines.map((l) => `[${formatTimeLRC(l.start)}]${l.text}`)].join("\n");
}

function toSRT(data: LyricData): string {
  const mainLines = data.lines.filter((l) => l.tag !== "adlib");
  return mainLines.map((l, i) => `${i + 1}\n${formatTimeSRT(l.start)} --> ${formatTimeSRT(l.end)}\n${l.text}\n`).join("\n");
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
    if (line.tag === "adlib") { result.push(line); return; }

    const words = line.text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    let groups: string[][] = [];

    if (format === "1_word") {
      groups = words.map((w) => [w]);
    } else if (format === "2_3_words") {
      for (let i = 0; i < words.length; i += 3) groups.push(words.slice(i, i + 3));
    } else if (format === "4_6_words") {
      for (let i = 0; i < words.length; i += 5) groups.push(words.slice(i, i + 5));
    } else if (format === "break_on_pause") {
      const text = line.text;
      const parts = text.split(/([,;:.!?]+\s*)/).filter(Boolean);
      const merged: string[] = [];
      let cur = "";
      parts.forEach((p) => {
        cur += p;
        if (/[,;:.!?]/.test(p)) { merged.push(cur.trim()); cur = ""; }
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

const EXPORT_OPTIONS: { format: ExportFormat; label: string; desc: string }[] = [
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

export function LyricDisplay({ data, audioFile, hasRealAudio = true, savedId, fmlyLines: initFmlyLines, versionMeta: initVersionMeta, debugData, initialBeatGrid, onBack, onSaved, onReuploadAudio, onHeaderProject }: Props) {
  const { user } = useAuth();
  const siteCopy = useSiteCopy();
  const features = (siteCopy as any)?.features;
  const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email);
  const [showDebug, setShowDebug] = useState(false);
  const { decodeFile, play, stop, playingId, getPlayheadPosition } = useAudioEngine();

  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveform, setWaveform] = useState<WaveformData | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  // Use pre-computed beat grid if available, otherwise run detection from decoded audio
  const { beatGrid: detectedBeatGrid, loading: beatGridLoading } = useBeatGrid(initialBeatGrid ? null : audioBuffer);
  const beatGrid = initialBeatGrid ?? detectedBeatGrid;
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
  const [fmlyLines, setFmlyLines] = useState<LyricLine[] | null>(initFmlyLines ?? null);
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
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [currentSavedId, setCurrentSavedId] = useState<string | null>(savedId ?? null);
  const autosaveTimerRef = useRef<number | null>(null);

  // Timestamps for version toggle
  const [explicitLastEdited, setExplicitLastEdited] = useState<Date | null>(null);
  const [fmlyLastEdited, setFmlyLastEdited] = useState<Date | null>(null);

  // Lyric scroll
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  // Copy state
  const [copied, setCopied] = useState<ExportFormat | null>(null);

  // (anchor state removed)

  // v2.2: Conflict resolution modal
  const [conflictLine, setConflictLine] = useState<{ lineIndex: number; whisperText: string; geminiText: string } | null>(null);

  // Lyric video composer
  const [videoComposerOpen, setVideoComposerOpen] = useState(false);

  // Song DNA — on-demand generation
  const [songDna, setSongDna] = useState<{
    mood?: string; description?: string;
    meaning?: { theme?: string; summary?: string; imagery?: string[] };
    hook?: LyricHook | null;
  } | null>(null);
  const [dnaLoading, setDnaLoading] = useState(false);
  const [dnaRequested, setDnaRequested] = useState(false);

  const fetchSongDna = useCallback(async () => {
    if (dnaLoading || songDna) return;
    setDnaLoading(true);
    setDnaRequested(true);
    try {
      const lyricsText = data.lines.filter(l => l.tag !== "adlib").map(l => l.text).join("\n");

      // If we have real audio, encode it and send along for full audio+lyrics DNA
      let audioBase64: string | undefined;
      let format: string | undefined;
      if (hasRealAudio && audioFile.size > 0) {
        const arrayBuffer = await audioFile.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < uint8.length; i += chunkSize) {
          binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
        }
        audioBase64 = btoa(binary);
        const name = audioFile.name.toLowerCase();
        if (name.endsWith(".wav")) format = "wav";
        else if (name.endsWith(".m4a")) format = "m4a";
        else if (name.endsWith(".flac")) format = "flac";
        else if (name.endsWith(".ogg")) format = "ogg";
        else if (name.endsWith(".webm")) format = "webm";
        else format = "mp3";
      }

      const { data: result, error } = await supabase.functions.invoke("lyric-analyze", {
        body: {
          title: data.title, artist: data.artist, lyrics: lyricsText, audioBase64, format,
          beatGrid: beatGrid ? { bpm: beatGrid.bpm, confidence: beatGrid.confidence } : undefined,
        },
      });
      if (error) throw error;

      // Parse hook from result
      let hook: LyricHook | null = null;
      if (result?.hottest_hook?.start_sec != null) {
        const startSec = Number(result.hottest_hook.start_sec);
        const durationSec = Number(result.hottest_hook.duration_sec) || 10;
        const conf = Number(result.hottest_hook.confidence) || 0;
        if (conf >= 0.75) {
          // Find preview text from lyrics that overlap the hook window
          const hookEnd = startSec + durationSec;
          const hookLines = data.lines.filter(l => l.end >= startSec && l.start <= hookEnd);
          const previewText = hookLines.map(l => l.text).join(" ").trim();
          hook = {
            start: startSec,
            end: startSec + durationSec,
            score: Math.round(conf * 100),
            reasonCodes: [],
            previewText,
          };
        }
      }

      setSongDna({
        mood: result?.mood,
        description: result?.description,
        meaning: result?.meaning,
        hook,
      });
    } catch (e) {
      console.error("Song DNA error:", e);
      toast.error("Couldn't generate Song DNA");
    } finally {
      setDnaLoading(false);
    }
  }, [data, audioFile, hasRealAudio, dnaLoading, songDna, beatGrid]);

  // ── Active lines (format applied) ─────────────────────────────────────────
  const activeLinesRaw = activeVersion === "explicit" ? explicitLines : (fmlyLines ?? explicitLines);
  const activeMeta = activeVersion === "explicit" ? explicitMeta : fmlyMeta;
  const activeLines = applyLineFormat(activeLinesRaw, activeMeta.lineFormat);

  // Use currentTime directly (no offset)
  // Bug 2: epsilon prevents flickering at floating-point boundaries
  const HIGHLIGHT_EPSILON = 0.08;

  // ── Multi-active highlighting — supports overlapping adlibs ───────────────
  const activeLineIndices = new Set<number>(
    activeLines.reduce<number[]>((acc, l, i) => {
      if (currentTime >= l.start && currentTime < l.end + HIGHLIGHT_EPSILON) acc.push(i);
      return acc;
    }, [])
  );
  // Sticky: if no line is active, highlight the most recently passed main line
  if (activeLineIndices.size === 0) {
    let lastPassed = -1;
    for (let i = 0; i < activeLines.length; i++) {
      if (activeLines[i].tag !== "adlib" && currentTime >= activeLines[i].start) lastPassed = i;
    }
    if (lastPassed !== -1) activeLineIndices.add(lastPassed);
  }
  const primaryActiveLine = Math.min(...(activeLineIndices.size > 0 ? [...activeLineIndices] : [-1]));

  // ── Audio setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    const url = URL.createObjectURL(audioFile);
    audioUrlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;

    // Single RAF loop — runs continuously, only reads currentTime when playing.
    // Using rafRef so cleanup always cancels the correct frame, even across re-renders.
    let isRunning = true;
    const tick = () => {
      if (!isRunning) return;
      setCurrentTime(audio.currentTime);
      // Loop-region enforcement (doesn't need separate timeupdate)
      const region = loopRegionRef.current;
      if (region && audio.currentTime >= region.end) {
        audio.currentTime = region.start;
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

    if (audioFile.size > 0) {
      decodeFile(audioFile).then(({ buffer, waveform }) => {
        setWaveform(waveform);
        setAudioBuffer(buffer);
      }).catch(() => {});
    }

    return () => {
      isRunning = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
      URL.revokeObjectURL(url);
    };
  }, [audioFile, decodeFile]);

  // ── Auto-scroll active lyric ──────────────────────────────────────────────
  // Scroll within the lyrics container only — never scroll the page
  useEffect(() => {
    const container = lyricsContainerRef.current;
    const activeLine = activeLineRef.current;
    if (!container || !activeLine) return;
    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;
    const lineTop = activeLine.offsetTop;
    const lineBottom = lineTop + activeLine.offsetHeight;
    const targetScroll = lineTop - container.clientHeight / 2 + activeLine.offsetHeight / 2;
    if (lineTop < containerTop || lineBottom > containerBottom) {
      container.scrollTo({ top: targetScroll, behavior: "smooth" });
    }
  }, [primaryActiveLine]);

  // ── Playback controls ─────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      loopRegionRef.current = null;
      setActiveHookIndex(null);
      if (clipProgressRafRef.current) cancelAnimationFrame(clipProgressRafRef.current);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const seekTo = useCallback((time: number) => {
    if (!audioRef.current) return;
    loopRegionRef.current = null;
    setActiveHookIndex(null);
    if (clipProgressRafRef.current) cancelAnimationFrame(clipProgressRafRef.current);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
    if (!isPlaying) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);


  // ── Clip loop: play a hook region on repeat ───────────────────────────────
  const playClip = useCallback((hook: LyricHook, hookIdx: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (activeHookIndex === hookIdx) {
      loopRegionRef.current = null;
      setActiveHookIndex(null);
      if (clipProgressRafRef.current) cancelAnimationFrame(clipProgressRafRef.current);
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
      if (!region) { setClipProgress(0); return; }
      const elapsed = (audio.currentTime - region.start + duration) % duration;
      setClipProgress(Math.min(Math.max(elapsed / duration, 0), 1));
      clipProgressRafRef.current = requestAnimationFrame(tickProgress);
    };
    if (clipProgressRafRef.current) cancelAnimationFrame(clipProgressRafRef.current);
    clipProgressRafRef.current = requestAnimationFrame(tickProgress);
  }, [activeHookIndex]);

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
      const payload = {
        title: data.title,
        artist: data.artist,
        lines: explicitLines as any,
        fmly_lines: fmlyLines as any ?? null,
        version_meta: {
          explicit: { lineFormat: explicitMeta.lineFormat, socialPreset: explicitMeta.socialPreset, lastEdited: new Date().toISOString() },
          fmly: { lineFormat: fmlyMeta.lineFormat, socialPreset: fmlyMeta.socialPreset, strictness: fmlyMeta.strictness, lastEdited: new Date().toISOString() },
        } as any,
        beat_grid: beatGrid ? { bpm: beatGrid.bpm, beats: beatGrid.beats, confidence: beatGrid.confidence } as any : null,
      };

      if (currentSavedId) {
        const { error } = await supabase.from("saved_lyrics").update(payload).eq("id", currentSavedId);
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
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      console.error("Autosave error:", e);
      setSaveStatus("idle");
    }
  }, [user, currentSavedId, data, explicitLines, fmlyLines, explicitMeta, fmlyMeta, audioFile.name, onSaved, beatGrid]);

  const scheduleAutosave = useCallback(() => {
    if (!user) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    setSaveStatus("saving");
    autosaveTimerRef.current = window.setTimeout(() => {
      performSave();
    }, 1500);
  }, [user, performSave]);

  useEffect(() => {
    scheduleAutosave();
  }, [explicitLines, fmlyLines, explicitMeta, fmlyMeta, beatGrid]);

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
        prev.map((l) => (l.start === editedLine.start && l.tag === editedLine.tag ? { ...l, text: updatedText } : l))
      );
      setExplicitLastEdited(new Date());
    } else {
      setFmlyLines((prev) =>
        prev
          ? prev.map((l) => (l.start === editedLine.start && l.tag === editedLine.tag ? { ...l, text: updatedText } : l))
          : prev
      );
      setFmlyLastEdited(new Date());
    }
    setEditingIndex(null);
  };

  // ── FMLY Generation ───────────────────────────────────────────────────────
  const handleGenerateFmly = useCallback(() => {
    const { filteredLines, report } = applyProfanityFilter(explicitLines, fmlyMeta.strictness);
    setFmlyLines(filteredLines);
    setFmlyReport(report);
    setFmlyLastEdited(new Date());
    setActiveVersion("fmly");
    if (report.totalFlagged === 0) {
      toast.success("No profanity detected — FMLY Friendly version is clean!");
    } else {
      toast.success(`FMLY Friendly generated — ${report.totalFlagged} word${report.totalFlagged !== 1 ? "s" : ""} filtered`);
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
  const baseName = (data.title !== "Unknown" && data.title !== "Untitled" ? data.title : audioFile.name.replace(/\.[^.]+$/, "")).replace(/\s+/g, "_");
  const versionSuffix = activeVersion === "explicit" ? "Explicit" : "FMLY_Friendly";
  const editedData: LyricData = { ...data, lines: activeLines };

  const handleCopy = (format: ExportFormat) => {
    const content = format === "lrc" ? toLRC(editedData) : format === "srt" ? toSRT(editedData) : toPlainText(editedData);
    navigator.clipboard.writeText(content);
    setCopied(format);
    toast.success(`${format.toUpperCase()} copied`);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownload = (format: ExportFormat) => {
    const filename = `${baseName}_${versionSuffix}.${format}`;
    if (format === "lrc") downloadFile(toLRC(editedData), filename, "text/plain");
    else if (format === "srt") downloadFile(toSRT(editedData), filename, "text/plain");
    else downloadFile(toPlainText(editedData), filename, "text/plain");
    toast.success(`${format.toUpperCase()} downloaded`);
  };

  const hooks = data.hooks ?? [];
  const metadata = data.metadata;

  // (drift/reset/offset removed — Scribe timestamps are accurate)

  // ── Tag toggle ─────────────────────────────────────────────────────────────
  const toggleLineTag = useCallback((lineIndex: number) => {
    const line = activeLines[lineIndex];
    const newTag: "main" | "adlib" = line.tag === "adlib" ? "main" : "adlib";
    const updater = (prev: LyricLine[]) =>
      prev.map((l) =>
        l.start === line.start && l.text === line.text ? { ...l, tag: newTag } : l
      );
    if (activeVersion === "explicit") {
      setExplicitLines(updater);
    } else {
      setFmlyLines((prev) => (prev ? updater(prev) : prev));
    }
    toast.success(newTag === "adlib" ? "Line converted to Adlib" : "Line converted to Main vocal");
  }, [activeLines, activeVersion]);

  // ── Word-level splitter ───────────────────────────────────────────────────
  // Store selection at mouseUp time — clicking the menu clears the browser selection
  const [selectionLineIndex, setSelectionLineIndex] = useState<number | null>(null);
  const [capturedSelectionText, setCapturedSelectionText] = useState<string>("");

  const handleSplitToAdlib = useCallback((lineIndex: number) => {
    const selectedText = capturedSelectionText.trim();
    if (!selectedText) {
      toast.error("Select the adlib word(s) first, then choose Split new line Adlib");
      return;
    }
    const line = activeLines[lineIndex];
    const remaining = line.text.replace(selectedText, "").replace(/\s{2,}/g, " ").trim();
    if (!remaining) {
      toast.error("Cannot split — nothing would remain on the main line");
      return;
    }

    const mainLine: LyricLine = { ...line, text: remaining, tag: "main" };
    const adlibLine: LyricLine = { start: line.start, end: line.end, text: selectedText, tag: "adlib" };

    const updater = (prev: LyricLine[]): LyricLine[] => {
      const idx = prev.findIndex((l) => l.start === line.start && l.text === line.text);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), mainLine, adlibLine, ...prev.slice(idx + 1)];
    };
    if (activeVersion === "explicit") {
      setExplicitLines(updater);
    } else {
      setFmlyLines((prev) => (prev ? updater(prev) : prev));
    }
    setCapturedSelectionText("");
    setSelectionLineIndex(null);
    toast.success(`"${selectedText}" split to new Adlib line`);
  }, [capturedSelectionText, activeLines, activeVersion]);

  // Report project title + right content (save indicator + debug) to header
  useEffect(() => {
    const title = data.title || audioFile.name.replace(/\.[^.]+$/, "");
    const rightContent = (
      <>
        {user && saveStatus !== "idle" && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {saveStatus === "saving" ? "● Saving…" : "✓ Saved"}
          </span>
        )}
        {isAdmin && debugData && (
          <button
            onClick={() => setShowDebug((v) => !v)}
            className="text-[10px] font-mono text-muted-foreground/50 hover:text-foreground border border-border/30 rounded px-2 py-1 transition-colors"
          >
            ⚙ Debug
          </button>
        )}
      </>
    );
    onHeaderProject?.({ title, onBack, rightContent });
    return () => onHeaderProject?.(null);
  }, [data.title, audioFile.name, onBack, onHeaderProject, saveStatus, user, isAdmin, debugData]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <motion.div
      className="w-full space-y-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Debug panel (admin only, toggled from header) */}
      {isAdmin && debugData && showDebug && (
        <div className="w-full glass-card rounded-xl p-4 border border-border/40 shadow-lg max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-mono font-semibold text-foreground">🔬 Full Debug Panel</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground/40">
                v{debugData.version} · {Math.round((debugData.inputBytes || 0) / 1024)}KB
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
                  toast.success("Full debug data copied");
                }}
                className="text-[10px] font-mono text-muted-foreground/60 hover:text-foreground border border-border/30 rounded px-1.5 py-0.5"
              >
                Copy All
              </button>
            </div>
          </div>

          {/* ── WHISPER INPUT ── */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-mono text-blue-400/90 uppercase tracking-wider">📥 Whisper — Input</p>
              <button onClick={() => navigator.clipboard.writeText(JSON.stringify(debugData.whisper?.input, null, 2)).then(() => toast.success("Copied"))} className="text-[9px] font-mono text-muted-foreground/40 hover:text-foreground">copy</button>
            </div>
            <pre className="text-[10px] font-mono text-muted-foreground bg-blue-950/20 border border-blue-500/10 rounded p-2 overflow-auto max-h-28 whitespace-pre-wrap">
              {JSON.stringify(debugData.whisper?.input, null, 2) || "(no data)"}
            </pre>
          </div>

          {/* ── WHISPER OUTPUT ── */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-mono text-blue-400/90 uppercase tracking-wider">📤 Whisper — Output ({debugData.whisper?.output?.wordCount ?? 0} words / {debugData.whisper?.output?.segmentCount} segments)</p>
              <button onClick={() => navigator.clipboard.writeText(JSON.stringify(debugData.whisper?.output, null, 2)).then(() => toast.success("Copied"))} className="text-[9px] font-mono text-muted-foreground/40 hover:text-foreground">copy</button>
            </div>
            <p className="text-[9px] font-mono text-muted-foreground/60 mb-1">Raw text:</p>
            <pre className="text-[10px] font-mono text-muted-foreground bg-blue-950/20 border border-blue-500/10 rounded p-2 overflow-auto max-h-24 whitespace-pre-wrap mb-1">
              {debugData.whisper?.output?.rawText || "(no raw text)"}
            </pre>
            <p className="text-[9px] font-mono text-muted-foreground/60 mb-1">Words — source of truth (first 40):</p>
            <pre className="text-[10px] font-mono text-muted-foreground bg-blue-950/20 border border-blue-500/10 rounded p-2 overflow-auto max-h-36 whitespace-pre-wrap mb-1">
              {JSON.stringify(debugData.whisper?.output?.words?.slice(0, 40), null, 2) || "(no words — upgrade needed)"}
            </pre>
            <p className="text-[9px] font-mono text-muted-foreground/60 mb-1">Segments — grouping context (first 20):</p>
            <pre className="text-[10px] font-mono text-muted-foreground bg-blue-950/20 border border-blue-500/10 rounded p-2 overflow-auto max-h-28 whitespace-pre-wrap">
              {JSON.stringify(debugData.whisper?.output?.segments?.slice(0, 20), null, 2) || "(no segments)"}
            </pre>
          </div>

          {/* ── GEMINI INPUT ── */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-mono text-purple-400/90 uppercase tracking-wider">📥 Gemini — Input</p>
              <button onClick={() => navigator.clipboard.writeText(JSON.stringify(debugData.gemini?.input, null, 2)).then(() => toast.success("Copied"))} className="text-[9px] font-mono text-muted-foreground/40 hover:text-foreground">copy</button>
            </div>
            <pre className="text-[10px] font-mono text-muted-foreground bg-purple-950/20 border border-purple-500/10 rounded p-2 overflow-auto max-h-28 whitespace-pre-wrap">
              {JSON.stringify(debugData.gemini?.input, null, 2) || "(no data)"}
            </pre>
          </div>

          {/* ── GEMINI OUTPUT ── */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-mono text-purple-400/90 uppercase tracking-wider">
                📤 Gemini — Output {debugData.gemini?.output?.status === "failed" ? "❌ FAILED" : `✓ (${debugData.gemini?.output?.adlibsCount} adlibs)`}
              </p>
              <button onClick={() => navigator.clipboard.writeText(JSON.stringify(debugData.gemini?.output, null, 2)).then(() => toast.success("Copied"))} className="text-[9px] font-mono text-muted-foreground/40 hover:text-foreground">copy</button>
            </div>
            {debugData.gemini?.output?.status === "failed" && (
              <pre className="text-[10px] font-mono text-red-400 bg-red-950/20 border border-red-500/20 rounded p-2 mb-1 whitespace-pre-wrap">
                Error: {debugData.gemini?.output?.error}
              </pre>
            )}
            <p className="text-[9px] font-mono text-muted-foreground/60 mb-1">Raw response ({debugData.gemini?.output?.rawResponseLength || 0} chars):</p>
            <pre className="text-[10px] font-mono text-muted-foreground bg-purple-950/20 border border-purple-500/10 rounded p-2 overflow-auto max-h-36 whitespace-pre-wrap mb-1">
              {debugData.gemini?.output?.rawResponseContent?.slice(0, 800) || "(no response)"}
            </pre>
            <p className="text-[9px] font-mono text-muted-foreground/60 mb-1">Parsed metadata:</p>
            <pre className="text-[10px] font-mono text-muted-foreground bg-purple-950/20 border border-purple-500/10 rounded p-2 overflow-auto max-h-24 whitespace-pre-wrap mb-1">
              {JSON.stringify(debugData.gemini?.output?.metadata, null, 2) || "(none)"}
            </pre>
            <p className="text-[9px] font-mono text-muted-foreground/60 mb-1">Hook detected:</p>
            <pre className="text-[10px] font-mono text-muted-foreground bg-purple-950/20 border border-purple-500/10 rounded p-2 overflow-auto max-h-24 whitespace-pre-wrap mb-1">
              {JSON.stringify(debugData.gemini?.output?.hottest_hook, null, 2) || "null"}
            </pre>
            <p className="text-[9px] font-mono text-muted-foreground/60 mb-1">Adlibs ({(debugData.gemini?.output?.adlibs || []).length}):</p>
            <pre className="text-[10px] font-mono text-muted-foreground bg-purple-950/20 border border-purple-500/10 rounded p-2 overflow-auto max-h-36 whitespace-pre-wrap">
              {JSON.stringify(debugData.gemini?.output?.adlibs, null, 2) || "[]"}
            </pre>
          </div>

          {/* ── MERGED OUTPUT ── */}
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-mono text-green-400/90 uppercase tracking-wider">
                🎯 Merged Output — {debugData.merged?.totalLines} lines ({debugData.merged?.mainLines} main / {debugData.merged?.adlibLines} adlib) · {debugData.merged?.hooks?.length || 0} hooks
              </p>
              <button onClick={() => navigator.clipboard.writeText(JSON.stringify(debugData.merged, null, 2)).then(() => toast.success("Copied"))} className="text-[9px] font-mono text-muted-foreground/40 hover:text-foreground">copy</button>
            </div>
            <p className="text-[9px] font-mono text-muted-foreground/60 mb-1">All lines:</p>
            <pre className="text-[10px] font-mono text-muted-foreground bg-green-950/20 border border-green-500/10 rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap">
              {JSON.stringify(debugData.merged?.allLines, null, 2) || "[]"}
            </pre>
          </div>
        </div>
      )}

      {/* Metadata strip removed — mood/description now in Song DNA */}

      

      <div className="flex flex-col lg:flex-row gap-4 items-start">

        {/* ── LEFT: Waveform + Lyrics + Export ── */}
        <div className="flex-1 min-w-0 w-full space-y-3">

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
                  loopRegion={activeHookIndex !== null && hooks[activeHookIndex]
                    ? { start: hooks[activeHookIndex].start, end: hooks[activeHookIndex].end, duration: waveform?.duration ?? 1 }
                    : null}
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
                      <Repeat2 size={11} className="text-primary animate-pulse" />
                      <span className="text-[10px] font-mono text-primary">Looping clip — click Stop to exit</span>
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
                <span className="text-[10px] text-muted-foreground/60 font-mono">Audio files aren't saved or stored.</span>
              </div>
            )}
          </div>

          {/* Lyrics editor */}
          <div className="glass-card rounded-xl p-4 space-y-1">
            {activeLines.length > 0 && (
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-muted-foreground">Double-click to edit · Select text + ⋯ to split adlib</p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground/50">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-foreground/20 inline-block" /> main</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary/20 inline-block" /> adlib</span>
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
            {/* v3.7: scroll height anchored to last element's start time so Outro adlibs are reachable */}
            <div ref={lyricsContainerRef} className="overflow-y-auto space-y-0.5" style={{ maxHeight: "45vh" }}>
              {activeLines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {activeVersion === "fmly"
                    ? "Click \"Make FMLY Friendly\" above to generate the clean version."
                    : "No lyrics detected — this may be an instrumental track."}
                </p>
              ) : (
              activeLines.map((line, i) => {
                  const isAdlib = line.tag === "adlib";
                  const isFloating = isAdlib && line.isFloating;
                  // v3.8: hide conflict marker on QA-corrected lines (purple badge already shown)
                  const hasConflict = isAdlib && !!line.geminiConflict && !line.isCorrection;
                  const isActive = activeLineIndices.has(i);
                  const isPrimary = i === primaryActiveLine;
                  const isEditing = i === editingIndex;
                  // Highlight lines that fall within the active looping hook
                  const activeHook = activeHookIndex !== null ? hooks[activeHookIndex] : null;
                  const isInHook = activeHook
                    ? line.start >= activeHook.start && line.start < activeHook.end
                    : false;
                  const isSelected = selectionLineIndex === i;

                  // v6.0: No standalone chips — all adlibs render inline regardless of orphan/floating status

                  // v3.7: render corrected word with purple underline
                  const renderLineText = () => {
                    if (!isEditing && !isAdlib && line.isCorrection && line.correctedWord && line.text.includes(line.correctedWord)) {
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
                    const nonSpaceWords = words.filter(w => w.trim().length > 0);
                    const totalChars = nonSpaceWords.reduce((s, w) => s + w.length, 0);
                    const lineDuration = line.end - line.start;

                    let charsSoFar = 0;
                    const wordTimings = nonSpaceWords.map(w => {
                      const wordStart = line.start + (charsSoFar / totalChars) * lineDuration;
                      charsSoFar += w.length;
                      const wordEnd = line.start + (charsSoFar / totalChars) * lineDuration;
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
                          if (token.trim().length === 0) return <span key={ti}>{token}</span>;
                          const timing = wordTimings[timingIdx++];
                          const isWordActive = isActive && timing && currentTime >= timing.start && currentTime < timing.end + HIGHLIGHT_EPSILON;
                          const isWordPast = isActive && timing && currentTime >= timing.end + HIGHLIGHT_EPSILON;
                          // FMLY: highlight censored words (all asterisks) in green
                          const isCensored = activeVersion === "fmly" && /^\*+$/.test(token.trim());
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
                      ref={isPrimary ? activeLineRef : undefined}
                      className={`group flex items-start gap-3 px-3 py-1 rounded-lg transition-all ${
                        isAdlib ? "ml-6 opacity-70" : ""
                      } ${
                        isFloating ? "border-l-2 border-dashed border-primary/30" : ""
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
                        onClick={() => seekTo(line.start)}
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
                      ) : renderLineText()}
                      {/* v2.2: Floating chip badge */}
                      {isFloating && (
                        <span className="shrink-0 text-[9px] font-mono text-primary/50 border border-primary/20 rounded px-1 py-0.5 self-center" title="Floating adlib — no matching word in Whisper timeline">
                          float
                        </span>
                      )}
                      {/* v3.7: QA correction badge on main lines */}
                      {!isAdlib && line.isCorrection && (
                        <span className="shrink-0 text-[9px] font-mono text-purple-400/70 border border-purple-400/20 rounded px-1 py-0.5 self-center" title={`AI corrected: "${line.geminiConflict}" → "${line.correctedWord}"`}>
                          ✱ fix
                        </span>
                      )}
                      {/* v2.2: Conflict indicator 💡 */}
                      {hasConflict && (
                        <button
                          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity self-center"
                          title="Gemini and Whisper text differ — click to resolve"
                          onClick={() => setConflictLine({
                            lineIndex: i,
                            whisperText: line.geminiConflict!,
                            geminiText: line.text,
                          })}
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
                              <DropdownMenuItem onClick={() => handleSplitToAdlib(i)}>
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

          {/* ── Song DNA — click Reveal to generate ── */}
          <div className="glass-card rounded-xl p-4 border border-border/30">
            {!dnaRequested ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-primary" />
                  <span className="text-[11px] font-mono text-muted-foreground">Song DNA</span>
                </div>
                <button
                  onClick={fetchSongDna}
                  className="text-[11px] font-mono text-primary hover:text-primary/80 transition-colors"
                >
                  Reveal
                </button>
              </div>
            ) : dnaLoading ? (
              <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                <Loader2 size={14} className="animate-spin text-primary" />
                Analyzing track…
              </div>
            ) : songDna ? (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center gap-1.5">
                  <Sparkles size={12} className="text-primary" />
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    Song DNA
                  </span>
                </div>

                {/* Description */}
                {songDna.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed italic">
                    {songDna.description}
                  </p>
                )}

                {/* Tags row: mood */}
                {songDna.mood && (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {songDna.mood}
                    </span>
                  </div>
                )}


                {/* Song Meaning */}
                {songDna.meaning && (songDna.meaning.theme || songDna.meaning.summary) && (
                  <div className="space-y-2 pt-2 border-t border-border/30">
                    {songDna.meaning.theme && (
                      <p className="text-sm font-semibold text-foreground">{songDna.meaning.theme}</p>
                    )}
                    {songDna.meaning.summary && (
                      <p className="text-sm text-muted-foreground leading-relaxed">{songDna.meaning.summary}</p>
                    )}
                    {songDna.meaning.imagery && songDna.meaning.imagery.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {songDna.meaning.imagery.map((img, idx) => (
                          <span key={idx} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {img}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">Couldn't analyze — try again later.</p>
            )}
          </div>
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
              onLineFormatChange={(v) => updateMeta(activeVersion, { lineFormat: v })}
              onSocialPresetChange={(v) => updateMeta(activeVersion, { socialPreset: v })}
              onStrictnessChange={(v) => setFmlyMeta((m) => ({ ...m, strictness: v }))}
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
                  <div key={format} className={`flex items-center justify-between py-2 ${idx > 0 ? "border-t border-border/30" : ""}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-medium text-foreground w-7">{label}</span>
                      <span className="text-[10px] text-muted-foreground">{desc}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors" onClick={() => handleCopy(format)}>
                        {copied === format ? "✓ Copied" : "Copy"}
                      </button>
                      <button className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors" onClick={() => handleDownload(format)}>
                        Save
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Hottest Hook — appears after Song DNA is revealed ── */}
          {songDna?.hook && (() => {
            const hook = songDna.hook;
            const isLooping = activeHookIndex === 0;
            const clipDuration = hook.end - hook.start;
            return (
              <div className="glass-card rounded-xl p-4 border border-border/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap size={11} className="text-primary" />
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                      Hottest Hook
                    </span>
                  </div>
                  <button
                    onClick={() => playClip(hook, 0)}
                    className={`relative flex items-center justify-center w-7 h-7 rounded-full transition-all duration-300 ${
                      isLooping
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                    }`}
                    title={isLooping ? "Stop clip" : "Play clip"}
                  >
                    <svg width="28" height="28" viewBox="0 0 28 28" className="absolute inset-0" style={{ transform: "rotate(-90deg)" }}>
                      <circle cx="14" cy="14" r={10} fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth="2" />
                      {isLooping && (
                        <circle
                          cx="14" cy="14" r={10} fill="none" stroke="currentColor" strokeOpacity={0.9} strokeWidth="2"
                          strokeDasharray={Math.PI * 2 * 10}
                          strokeDashoffset={Math.PI * 2 * 10 * (1 - clipProgress)}
                          strokeLinecap="round"
                          style={{ transition: "stroke-dashoffset 0.1s linear" }}
                        />
                      )}
                    </svg>
                    {isLooping ? <Pause size={10} /> : <Play size={10} />}
                  </button>
                </div>
                {hook.previewText && (
                  <p className="text-sm font-medium text-foreground leading-snug">
                    "{hook.previewText}"
                  </p>
                )}
                <p className="text-[10px] font-mono text-muted-foreground">
                  {formatTimeShort(hook.start)} – {formatTimeShort(hook.end)}
                  <span className="ml-1 text-muted-foreground/40">({Math.round(clipDuration)}s)</span>
                </p>
                {features?.lyric_video && (
                  <button
                    onClick={() => setVideoComposerOpen(true)}
                    className="w-full flex items-center justify-center gap-1.5 text-[10px] font-mono text-primary/70 hover:text-primary transition-colors border border-primary/20 hover:border-primary/40 rounded-lg py-1.5"
                  >
                    <Video size={10} />
                    <span>Create Lyric Video</span>
                  </button>
                )}
              </div>
            );
          })()}
          {/* Spacer so floating widget doesn't block last card */}
          <div className="h-20" />
        </div>
      </div>

      <SignUpToSaveBanner />

      {/* v2.2: Conflict Resolution Modal — keeps Whisper timestamps, lets artist swap text */}
      <Dialog open={!!conflictLine} onOpenChange={(open) => { if (!open) setConflictLine(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <AlertCircle size={14} className="text-yellow-500" />
              Text Conflict Detected
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Gemini and Whisper identified different words at this timestamp. Whisper's timestamps are kept regardless — choose which text to display.
            </DialogDescription>
          </DialogHeader>
          {conflictLine && (
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="rounded-lg border border-border/40 p-3 space-y-1">
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Gemini (AI label)</p>
                  <p className="text-sm font-medium text-foreground">"{conflictLine.geminiText}"</p>
                </div>
                <div className="rounded-lg border border-border/40 p-3 space-y-1">
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Whisper (transcription)</p>
                  <p className="text-sm font-medium text-foreground">"{conflictLine.whisperText}"</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">Timestamps always stay from Whisper — you're only choosing what text is shown.</p>
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
                        l.start === line.start && l.text === line.text ? { ...l, text: conflictLine.whisperText, geminiConflict: undefined } : l
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

      <LyricVideoComposer
        open={videoComposerOpen}
        onOpenChange={setVideoComposerOpen}
        lines={activeLines}
        hook={hooks[0] ?? null}
        metadata={data.metadata}
        title={data.title}
        artist={data.artist}
        audioFile={audioFile}
      />
    </motion.div>
  );
}

