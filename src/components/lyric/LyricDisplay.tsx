import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Zap, Play, Pause, Copy, Repeat2, MoreHorizontal, Anchor, AlertCircle } from "lucide-react";
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
import { SignUpToSaveBanner } from "@/components/SignUpToSaveBanner";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { LyricWaveform, type DiagnosticDot } from "./LyricWaveform";
import { VersionToggle, type ActiveVersion } from "./VersionToggle";
import { LyricFormatControls, type LineFormat, type SocialPreset } from "./LyricFormatControls";
import { FmlyFriendlyPanel } from "./FmlyFriendlyPanel";
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
  bpm_estimate?: number;
  confidence?: number;
  key?: string;
  genre_hint?: string;
  // v2.2: per-field confidence scores
  bpm_confidence?: number;
  key_confidence?: number;
  mood_confidence?: number;
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
  onBack: () => void;
  onSaved?: (id: string) => void;
  onReuploadAudio?: (file: File) => void;
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

export function LyricDisplay({ data, audioFile, hasRealAudio = true, savedId, fmlyLines: initFmlyLines, versionMeta: initVersionMeta, debugData, onBack, onSaved, onReuploadAudio }: Props) {
  const { user } = useAuth();
  const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email);
  const [showDebug, setShowDebug] = useState(false);
  const { decodeFile, play, stop, playingId, getPlayheadPosition } = useAudioEngine();

  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveform, setWaveform] = useState<WaveformData | null>(null);
  const rafRef = useRef<number | null>(null);

  // Timing offset (Bug 3: MP3 codec / processing offset correction)
  const [timingOffset, setTimingOffset] = useState(0);
  const TIMING_OFFSET_STEP = 0.1;
  const TIMING_OFFSET_MAX = 10.0;

  // Clip loop state
  const [activeHookIndex, setActiveHookIndex] = useState<number | null>(null);
  const [clipProgress, setClipProgress] = useState(0); // 0-1 for the progress ring
  const clipProgressRafRef = useRef<number | null>(null);
  const loopRegionRef = useRef<{ start: number; end: number } | null>(null);

  // Version state
  const [activeVersion, setActiveVersion] = useState<ActiveVersion>("explicit");
  const [explicitLines, setExplicitLines] = useState<LyricLine[]>(data.lines);
  const [fmlyLines, setFmlyLines] = useState<LyricLine[] | null>(initFmlyLines ?? null);
  // Store the original AI-generated lines so users can reset after manual edits/anchors
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

  // Auto-Anchor state — tracks which raw line indices have been manually snapped
  const [anchoredLines, setAnchoredLines] = useState<Set<number>>(new Set());

  // v2.2: Conflict resolution modal
  const [conflictLine, setConflictLine] = useState<{ lineIndex: number; whisperText: string; geminiText: string } | null>(null);

  // ── Active lines (format applied) ─────────────────────────────────────────
  const activeLinesRaw = activeVersion === "explicit" ? explicitLines : (fmlyLines ?? explicitLines);
  const activeMeta = activeVersion === "explicit" ? explicitMeta : fmlyMeta;
  const activeLines = applyLineFormat(activeLinesRaw, activeMeta.lineFormat);

  // Bug 3: adjustedTime accounts for MP3 codec/processing offset
  const adjustedTime = currentTime - timingOffset;

  // Bug 2: epsilon prevents flickering at floating-point boundaries
  const HIGHLIGHT_EPSILON = 0.08;

  // ── Multi-active highlighting — supports overlapping adlibs ───────────────
  const activeLineIndices = new Set<number>(
    activeLines.reduce<number[]>((acc, l, i) => {
      if (adjustedTime >= l.start && adjustedTime < l.end + HIGHLIGHT_EPSILON) acc.push(i);
      return acc;
    }, [])
  );
  // Sticky: if no line is active, highlight the most recently passed main line
  if (activeLineIndices.size === 0) {
    let lastPassed = -1;
    for (let i = 0; i < activeLines.length; i++) {
      if (activeLines[i].tag !== "adlib" && adjustedTime >= activeLines[i].start) lastPassed = i;
    }
    if (lastPassed !== -1) activeLineIndices.add(lastPassed);
  }
  const primaryActiveLine = Math.min(...(activeLineIndices.size > 0 ? [...activeLineIndices] : [-1]));

  // ── Sync Diagnostic: confidence heatmap dots ───────────────────────────────
  const diagnosticDots: DiagnosticDot[] = (() => {
    const mainLines = activeLinesRaw.filter((l) => l.tag !== "adlib");
    return mainLines.map((line, i) => {
      // Gap detection: flag if gap to next line > 1s (potential drift region)
      const nextLine = mainLines[i + 1];
      const gap = nextLine ? nextLine.start - line.end : 0;
      let color: DiagnosticDot["color"] = "green";
      if (gap > 1.0) color = "red";
      else if (gap > 0.4) color = "yellow";
      return { time: line.start, color, label: line.text.slice(0, 20) };
    });
  })();

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
      decodeFile(audioFile).then(({ waveform }) => setWaveform(waveform)).catch(() => {});
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

  // ── Auto-Anchor: snap current line to playhead ────────────────────────────
  const snapCurrentLine = useCallback(() => {
    if (!isPlaying) {
      toast.error("Press S while the song is playing to sync a line");
      return;
    }
    const snapTime = audioRef.current?.currentTime ?? currentTime;
    const adjustedSnap = snapTime - timingOffset;

    // Find the primary active main line index in the raw (unformatted) lines
    const rawLines = activeVersion === "explicit" ? explicitLines : (fmlyLines ?? explicitLines);
    // Find which raw line is currently highlighted
    let targetRawIdx = -1;
    for (let i = 0; i < rawLines.length; i++) {
      const l = rawLines[i];
      if (l.tag === "adlib") continue;
      if (adjustedSnap >= l.start && adjustedSnap < l.end + HIGHLIGHT_EPSILON) {
        targetRawIdx = i;
      }
    }
    // Fallback: last passed main line
    if (targetRawIdx === -1) {
      for (let i = 0; i < rawLines.length; i++) {
        if (rawLines[i].tag !== "adlib" && adjustedSnap >= rawLines[i].start) targetRawIdx = i;
      }
    }
    if (targetRawIdx === -1) {
      toast.error("No lyric line active — seek to a lyric first");
      return;
    }

    const targetLine = rawLines[targetRawIdx];
    const delta = Math.round((snapTime - targetLine.start) * 100) / 100;

    if (Math.abs(delta) < 0.05) {
      toast("Already in sync ✓", { description: `Line "${targetLine.text.slice(0, 30)}…" is accurate` });
      return;
    }

    // Shift the snapped line
    const applyShift = (lines: LyricLine[], shift: boolean): LyricLine[] => {
      if (!shift) {
        return lines.map((l, i) =>
          i === targetRawIdx ? { ...l, start: Math.round((l.start + delta) * 100) / 100 } : l
        );
      }
      // Ripple: shift this line + all subsequent lines
      return lines.map((l, i) =>
        i >= targetRawIdx
          ? { ...l, start: Math.round((l.start + delta) * 100) / 100, end: Math.round((l.end + delta) * 100) / 100 }
          : l
      );
    };

    const confirmRipple = () => {
      const updater = (lines: LyricLine[]) => applyShift(lines, true);
      if (activeVersion === "explicit") {
        setExplicitLines(updater);
        setExplicitLastEdited(new Date());
      } else {
        setFmlyLines((prev) => (prev ? updater(prev) : prev));
        setFmlyLastEdited(new Date());
      }
      setAnchoredLines((prev) => new Set([...prev, targetRawIdx]));
      toast.dismiss("anchor-ripple");
      toast.success(`All lines from here shifted by ${delta > 0 ? "+" : ""}${delta.toFixed(2)}s`);
    };

    // Snap only this line first; offer ripple as a toast action
    const snapOnly = (lines: LyricLine[]) => applyShift(lines, false);
    if (activeVersion === "explicit") {
      setExplicitLines(snapOnly);
      setExplicitLastEdited(new Date());
    } else {
      setFmlyLines((prev) => (prev ? snapOnly(prev) : prev));
      setFmlyLastEdited(new Date());
    }
    setAnchoredLines((prev) => new Set([...prev, targetRawIdx]));

    toast(`⚓ Line anchored (${delta > 0 ? "+" : ""}${delta.toFixed(2)}s)`, {
      id: "anchor-ripple",
      description: `"${targetLine.text.slice(0, 35)}${targetLine.text.length > 35 ? "…" : ""}"`,
      action: {
        label: "Ripple all →",
        onClick: confirmRipple,
      },
      duration: 6000,
    });
  }, [isPlaying, currentTime, timingOffset, activeVersion, explicitLines, fmlyLines, HIGHLIGHT_EPSILON, setExplicitLastEdited, setFmlyLastEdited]);

  // ── S key listener for Auto-Anchor ───────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't fire when typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        snapCurrentLine();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [snapCurrentLine]);

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
  }, [user, currentSavedId, data, explicitLines, fmlyLines, explicitMeta, fmlyMeta, audioFile.name, onSaved]);

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
  }, [explicitLines, fmlyLines, explicitMeta, fmlyMeta]);

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

  // ── Reset timestamps to original AI output ────────────────────────────────
  const resetToOriginal = useCallback(() => {
    setExplicitLines([...originalLines.current]);
    setTimingOffset(0);
    setAnchoredLines(new Set());
    toast.success("Timestamps restored to original AI output");
  }, []);

  // ── Linear drift correction (clock skew) ──────────────────────────────────
  // If drift = currentTime - activeLine.start at some point T into the track,
  // it means the AI clock ran at rate: activeLine.start / currentTime.
  // We stretch all timestamps by the inverse: currentTime / activeLine.start.
  const applyDriftCorrection = useCallback(() => {
    const activeLine = activeLines.find((_, i) => activeLineIndices.has(i));
    if (!activeLine) {
      toast.error("Play the song until you see a lyric highlighted, then press Fix Drift");
      return;
    }
    const realTime = audioRef.current?.currentTime ?? currentTime;
    const lyricTime = activeLine.start;
    if (lyricTime < 1) {
      toast.error("Seek further into the track — need a reference point past the intro");
      return;
    }
    const stretchFactor = realTime / lyricTime;
    if (Math.abs(stretchFactor - 1) < 0.001) {
      toast("Already in sync — no correction needed ✓");
      return;
    }
    const stretch = (lines: LyricLine[]): LyricLine[] =>
      lines.map((l) => ({
        ...l,
        start: Math.round(l.start * stretchFactor * 100) / 100,
        end: Math.round(l.end * stretchFactor * 100) / 100,
      }));
    setExplicitLines((prev) => stretch(prev));
    if (fmlyLines) setFmlyLines((prev) => (prev ? stretch(prev) : prev));
    setAnchoredLines(new Set());
    const pct = ((stretchFactor - 1) * 100).toFixed(2);
    toast.success(`Drift corrected — timestamps stretched by ${pct}%`, {
      description: `Factor: ${stretchFactor.toFixed(4)} (measured at ${realTime.toFixed(2)}s audio / ${lyricTime.toFixed(2)}s lyric)`,
    });
  }, [activeLines, activeLineIndices, currentTime, fmlyLines]);

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


  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <motion.div
      className="w-full space-y-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header bar */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft size={18} strokeWidth={1.5} />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold truncate">{audioFile.name.replace(/\.[^.]+$/, "")}</h2>
          <p className="text-[10px] text-muted-foreground">{data.artist !== "Unknown" ? data.artist : ""}</p>
        </div>
        {user && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {saveStatus === "saving" ? "● Saving…" : saveStatus === "saved" ? "✓ Saved" : ""}
          </span>
        )}
        {/* Admin debug toggle */}
        {isAdmin && debugData && (
          <div className="relative shrink-0">
            <button
              onClick={() => setShowDebug((v) => !v)}
              className="text-[10px] font-mono text-muted-foreground/50 hover:text-foreground border border-border/30 rounded px-2 py-1 transition-colors"
            >
              ⚙ Debug
            </button>
            {showDebug && (
              <div className="absolute right-0 top-full mt-2 w-[600px] z-50 glass-card rounded-xl p-4 border border-border/40 shadow-lg max-h-[85vh] overflow-y-auto">
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
          </div>
        )}


      </div>

      {/* Metadata strip */}
      {metadata && (metadata.mood || metadata.bpm_estimate || metadata.confidence !== undefined || metadata.key) && (
        <div className="glass-card rounded-xl px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1 items-center">
          {metadata.mood && (
            <span className="text-[11px] text-muted-foreground">
              <span className="text-foreground/50 font-mono">Mood</span>{" "}
              <span className="capitalize font-medium text-foreground">{metadata.mood}</span>
            </span>
          )}
          {metadata.bpm_estimate && (
            <span className="text-[11px] text-muted-foreground">
              <span className="text-foreground/50 font-mono">BPM</span>{" "}
              <span className="font-medium text-foreground">{metadata.bpm_estimate}</span>
            </span>
          )}
          {metadata.key && (
            <span className="text-[11px] text-muted-foreground">
              <span className="text-foreground/50 font-mono">Key</span>{" "}
              <span className="font-medium text-foreground">{metadata.key}</span>
            </span>
          )}
          {metadata.genre_hint && (
            <span className="text-[11px] text-muted-foreground">
              <span className="text-foreground/50 font-mono">Genre</span>{" "}
              <span className="font-medium text-foreground capitalize">{metadata.genre_hint}</span>
            </span>
          )}
          {/* v2.2: per-field confidence scores or overall confidence */}
          {(metadata.mood_confidence !== undefined || metadata.confidence !== undefined) && (
            <span className="text-[11px] text-muted-foreground ml-auto flex items-center gap-1.5">
              <span className="text-foreground/50 font-mono">AI</span>{" "}
              {(() => {
                const conf = metadata.mood_confidence ?? metadata.confidence ?? 0;
                const cls = conf >= 0.8 ? "text-green-400" : conf >= 0.5 ? "text-yellow-400" : "text-red-400";
                return <span className={`font-medium ${cls}`} title={`Mood: ${Math.round((metadata.mood_confidence ?? 0) * 100)}% · BPM: ${Math.round((metadata.bpm_confidence ?? 0) * 100)}% · Key: ${Math.round((metadata.key_confidence ?? 0) * 100)}%`}>{Math.round(conf * 100)}%</span>;
              })()}
            </span>
          )}
        </div>
      )}

      {/* Two-column layout */}
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
                  adjustedTime={adjustedTime}
                  onSeek={seekTo}
                  onTogglePlay={togglePlay}
                  loopRegion={activeHookIndex !== null && hooks[activeHookIndex]
                    ? { start: hooks[activeHookIndex].start, end: hooks[activeHookIndex].end, duration: waveform?.duration ?? 1 }
                    : null}
                  diagnosticDots={diagnosticDots}
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
                {/* Live sync delta — shows gap between playhead and current lyric */}
                {(() => {
                  const activeLine = activeLines.find((_, i) => activeLineIndices.has(i));
                  if (!activeLine) return null;
                  const delta = adjustedTime - activeLine.start;
                  const absDelta = Math.abs(delta);
                  const color = absDelta < 0.3 ? "text-green-400" : absDelta < 1.5 ? "text-yellow-400" : "text-red-400";
                  return (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/20">
                      <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">Live sync</span>
                      <span className={`text-[10px] font-mono tabular-nums ${color} flex-1`}>
                        ▶ {adjustedTime.toFixed(2)}s · lyric {activeLine.start.toFixed(2)}s · drift {delta > 0 ? "+" : ""}{delta.toFixed(2)}s
                      </span>
                      {absDelta > 0.5 && isPlaying && (
                        <button
                          onClick={applyDriftCorrection}
                          className="text-[10px] font-mono text-primary hover:text-primary/80 border border-primary/30 hover:border-primary/50 rounded px-1.5 py-0.5 shrink-0 transition-colors"
                          title="Stretch all timestamps to correct progressive clock skew"
                        >
                          Fix Drift ↗
                        </button>
                      )}
                    </div>
                  );
                })()}
                {/* Timing Offset Control */}
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/20">
                  <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">Offset</span>
                  <button
                    onClick={() => setTimingOffset((v) => Math.max(-TIMING_OFFSET_MAX, +(v - TIMING_OFFSET_STEP).toFixed(1)))}
                    className="text-[10px] font-mono w-5 h-5 flex items-center justify-center rounded border border-border/40 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                  >
                    −
                  </button>
                  <span className="text-[10px] font-mono text-foreground w-16 text-center tabular-nums">
                    {timingOffset === 0 ? "0.0s" : `${timingOffset > 0 ? "+" : ""}${timingOffset.toFixed(1)}s`}
                  </span>
                  <button
                    onClick={() => setTimingOffset((v) => Math.min(TIMING_OFFSET_MAX, +(v + TIMING_OFFSET_STEP).toFixed(1)))}
                    className="text-[10px] font-mono w-5 h-5 flex items-center justify-center rounded border border-border/40 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                  >
                    +
                  </button>
                  {timingOffset !== 0 && (
                    <button
                      onClick={() => setTimingOffset(0)}
                      className="text-[10px] font-mono text-muted-foreground/50 hover:text-foreground transition-colors ml-1"
                    >
                      Reset
                    </button>
                  )}
                  <span className="text-[10px] text-muted-foreground/40 font-mono">lyrics ↔ audio · ±10s</span>
                  {/* Restore original timestamps */}
                  <button
                    onClick={resetToOriginal}
                    className="ml-auto text-[10px] font-mono text-muted-foreground/40 hover:text-destructive transition-colors border border-border/20 rounded px-1.5 py-0.5 shrink-0"
                    title="Undo all manual anchor shifts and restore original AI timestamps"
                  >
                    Restore original
                  </button>
                </div>
                {/* Sync Diagnostic legend */}
                {diagnosticDots.length > 0 && (
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">Sync</span>
                    <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/50">
                      <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: "rgba(74,222,128,0.8)" }} />tight
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/50">
                      <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: "rgba(251,191,36,0.8)" }} />gap
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/50">
                      <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: "rgba(248,113,113,0.8)" }} />drift risk
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground/30 ml-auto">
                      {diagnosticDots.filter(d => d.color === "red").length} drift risk{diagnosticDots.filter(d => d.color === "red").length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
                {/* Auto-Anchor hint */}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Anchor size={9} className="text-muted-foreground/40 shrink-0" />
                  <span className="text-[10px] text-muted-foreground/40 font-mono">
                    Press <kbd className="px-1 py-0.5 rounded bg-secondary/60 text-muted-foreground/60 text-[9px] font-mono">S</kbd> while playing to snap a line to the playhead
                  </span>
                  <button
                    onClick={snapCurrentLine}
                    className="ml-auto text-[10px] font-mono text-muted-foreground/50 hover:text-primary transition-colors border border-border/30 rounded px-1.5 py-0.5 shrink-0"
                  >
                    Sync Now
                  </button>
                </div>
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
                <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground/50">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-foreground/20 inline-block" /> main</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary/20 inline-block" /> adlib</span>
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
                  // Check if this line has been manually anchored
                  const rawLinesForCheck = activeVersion === "explicit" ? explicitLines : (fmlyLines ?? explicitLines);
                  const rawIdx = rawLinesForCheck.findIndex((rl) => rl.start === line.start && rl.tag === line.tag && rl.text === line.text);
                  const isAnchored = rawIdx !== -1 && anchoredLines.has(rawIdx);

                  // v3.8: Orphaned adlib — explicitly floating (intro/outro) OR no overlapping main line
                  // Render as standalone centered chip instead of indented overlay.
                  const isOrphanedAdlib = isAdlib && (
                    line.isFloating ||
                    !activeLines.some(
                      (other) => other.tag !== "adlib" && other.start <= line.start && other.end >= line.start
                    )
                  );

                  if (isOrphanedAdlib && !isEditing) {
                    return (
                      <div
                        key={`${line.start}-${line.tag ?? "main"}-${i}`}
                        ref={isPrimary ? activeLineRef : undefined}
                        className={`flex justify-center py-1 transition-all ${isActive ? "opacity-100" : "opacity-60 hover:opacity-90"}`}
                      >
                        <button
                          onClick={() => seekTo(line.start)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono italic transition-all ${
                            isActive
                              ? "border-primary/60 bg-primary/10 text-primary"
                              : "border-primary/20 bg-primary/5 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                          }`}
                          title={`Orphaned adlib @ ${formatTimeLRC(line.start)}`}
                        >
                          <span className="text-primary/50">◆</span>
                          <span>{line.text}</span>
                          <span className="text-muted-foreground/40 not-italic">{formatTimeLRC(line.start)}</span>
                        </button>
                      </div>
                    );
                  }

                  // v3.7: render corrected word with purple underline
                  const renderLineText = () => {
                    if (!isEditing && !isAdlib && line.isCorrection && line.correctedWord && line.text.includes(line.correctedWord)) {
                      const parts = line.text.split(line.correctedWord);
                      return (
                        <span
                          className={`leading-relaxed cursor-text flex-1 select-text text-sm ${isActive ? "font-medium text-primary" : ""} ${isSelected ? "bg-primary/10 rounded px-0.5" : ""}`}
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
                    return (
                      <span
                        className={`leading-relaxed cursor-text flex-1 select-text ${
                          isAdlib
                            ? "text-xs italic text-muted-foreground/80"
                            : `text-sm ${isActive ? "font-medium text-primary" : ""}`
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
                        {line.text}
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
                        className="text-[10px] font-mono text-muted-foreground/60 pt-0.5 shrink-0 w-12 cursor-pointer hover:text-primary flex items-center gap-0.5"
                        onClick={() => seekTo(line.start)}
                      >
                        {formatTimeLRC(line.start)}
                        {isAnchored && <Anchor size={7} className="text-primary/70 ml-0.5 shrink-0" />}
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

          {/* Export — below lyrics */}
          {activeLines.length > 0 && (
            <div className="glass-card rounded-xl p-4">
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

          {/* Hottest Hook Hero */}
          {(() => {
            const hook = hooks[0] ?? null;
            const isLooping = activeHookIndex === 0;
            const isCandidate = hook?.status === "candidate";
            const r = 20;
            const circ = 2 * Math.PI * r;
            const dashOffset = circ * (1 - (isLooping ? clipProgress : 0));
            const clipDuration = hook ? hook.end - hook.start : 0;

            return (
              <div
                className={`glass-card rounded-xl p-4 space-y-3 transition-all duration-300 ${
                  hook && isLooping
                    ? "border border-primary/60 shadow-[0_0_18px_4px_hsl(var(--primary)/0.22)]"
                    : isCandidate
                    ? "border border-yellow-500/30"
                    : "border border-border/30"
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap size={11} className={isCandidate ? "text-yellow-500" : "text-primary"} />
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                      {hook ? (isCandidate ? "Hook Candidate" : "Hottest Hook") : "Hook Analysis"}
                    </span>
                  </div>
                  {hook && (
                    <span className={`text-sm font-mono font-bold ${hookScoreColor(hook.score)}`}>
                      {hook.score}
                    </span>
                  )}
                </div>

                {/* v2.2: Candidate notice */}
                {isCandidate && (
                  <p className="text-[10px] text-yellow-500/80 font-mono border border-yellow-500/20 rounded px-2 py-1">
                    Low confidence — confirm or skip this hook
                  </p>
                )}

                {hook ? (
                  <>
                    {/* Preview text — large & featured */}
                    {hook.previewText && (
                      <p className="text-sm font-medium text-foreground leading-snug">
                        "{hook.previewText}"
                      </p>
                    )}

                    {/* Timestamp row — v2.2: always shows 10s duration */}
                    <p className="text-[10px] font-mono text-muted-foreground">
                      {formatTimeShort(hook.start)} – {formatTimeShort(hook.end)}
                      <span className="ml-1 text-muted-foreground/40">({Math.round(clipDuration)}s)</span>
                    </p>

                    {/* Reason codes */}
                    {hook.reasonCodes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {hook.reasonCodes.slice(0, 4).map((code) => (
                          <span key={code} className="text-[9px] font-mono bg-secondary/50 text-muted-foreground rounded px-1.5 py-0.5">
                            {code}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Play Clip CTA — centred, prominent */}
                    <div className="flex flex-col items-center gap-2 pt-1">
                      <button
                        onClick={() => playClip(hook, 0)}
                        className={`relative flex items-center justify-center w-14 h-14 rounded-full transition-all duration-300 ${
                          isLooping
                            ? "text-primary bg-primary/10"
                            : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                        }`}
                        title={isLooping ? "Stop clip" : "Preview clip"}
                      >
                        <svg
                          width="56"
                          height="56"
                          viewBox="0 0 56 56"
                          className="absolute inset-0"
                          style={{ transform: "rotate(-90deg)" }}
                        >
                          <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth="2.5" />
                          {isLooping && (
                            <circle
                              cx="28" cy="28" r={r}
                              fill="none"
                              stroke="currentColor"
                              strokeOpacity={0.9}
                              strokeWidth="2.5"
                              strokeDasharray={circ}
                              strokeDashoffset={dashOffset}
                              strokeLinecap="round"
                              style={{ transition: "stroke-dashoffset 0.1s linear" }}
                            />
                          )}
                        </svg>
                        {isLooping ? <Pause size={16} /> : <Play size={16} />}
                      </button>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {isLooping ? "Looping…" : "Play Clip"}
                      </span>
                    </div>

                    {/* Copy clip info */}
                    <button
                      onClick={() => copyClipInfo(hook)}
                      className="w-full flex items-center justify-center gap-1.5 text-[10px] font-mono text-muted-foreground/60 hover:text-foreground transition-colors border border-border/30 rounded-lg py-1.5"
                    >
                      <Copy size={10} />
                      <span>Copy Clip Info</span>
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground py-2">
                    No definitive hook detected for this track.
                  </p>
                )}
              </div>
            );
          })()}
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

    </motion.div>
  );
}

