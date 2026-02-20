import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Zap, Play, Pause, Copy, Repeat2, MoreHorizontal } from "lucide-react";
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
import { LyricWaveform } from "./LyricWaveform";
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
}

export interface LyricHook {
  start: number;
  end: number;
  score: number;
  reasonCodes: string[];
  previewText: string;
}

export interface LyricMetadata {
  mood?: string;
  bpm_estimate?: number;
  confidence?: number;
  key?: string;
  genre_hint?: string;
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
  const TIMING_OFFSET_MAX = 2.0;

  // Clip loop state
  const [activeHookIndex, setActiveHookIndex] = useState<number | null>(null);
  const [clipProgress, setClipProgress] = useState(0); // 0-1 for the progress ring
  const clipProgressRafRef = useRef<number | null>(null);
  const loopRegionRef = useRef<{ start: number; end: number } | null>(null);

  // Version state
  const [activeVersion, setActiveVersion] = useState<ActiveVersion>("explicit");
  const [explicitLines, setExplicitLines] = useState<LyricLine[]>(data.lines);
  const [fmlyLines, setFmlyLines] = useState<LyricLine[] | null>(initFmlyLines ?? null);
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

  // ── Audio setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    const url = URL.createObjectURL(audioFile);
    audioUrlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;

    // Bug 1: RAF loop at 60fps instead of timeupdate (~4fps) for smooth highlight/waveform
    let rafId: number;
    const tick = () => {
      setCurrentTime(audio.currentTime);
      rafId = requestAnimationFrame(tick);
    };

    const handlePlay = () => {
      rafId = requestAnimationFrame(tick);
    };
    const handlePause = () => {
      cancelAnimationFrame(rafId);
    };

    // Keep timeupdate only for loop-region enforcement (doesn't need 60fps accuracy)
    const handleTimeUpdate = () => {
      const region = loopRegionRef.current;
      if (region && audio.currentTime >= region.end) {
        audio.currentTime = region.start;
      }
    };
    const handleEnded = () => {
      cancelAnimationFrame(rafId);
      setIsPlaying(false);
      loopRegionRef.current = null;
      setActiveHookIndex(null);
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    if (audioFile.size > 0) {
      decodeFile(audioFile).then(({ waveform }) => setWaveform(waveform)).catch(() => {});
    }

    return () => {
      cancelAnimationFrame(rafId);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
      URL.revokeObjectURL(url);
    };
  }, [audioFile, decodeFile]);

  // ── Auto-scroll active lyric ──────────────────────────────────────────────
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
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

  // ── Tag toggle ────────────────────────────────────────────────────────────
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
              <div className="absolute right-0 top-full mt-2 w-[420px] z-50 glass-card rounded-xl p-4 border border-border/40 shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">Gemini Debug</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground/40">
                      {debugData.model} · {Math.round(debugData.inputBytes / 1024)}KB · {debugData.outputLines} lines
                    </span>
                    <button
                      onClick={() => {
                        const full = JSON.stringify(debugData, null, 2);
                        navigator.clipboard.writeText(full);
                        toast.success("Debug data copied");
                      }}
                      className="text-[10px] font-mono text-muted-foreground/50 hover:text-foreground border border-border/30 rounded px-1.5 py-0.5 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider mb-1">Raw Lines (pre-sanitize)</p>
                    <pre className="text-[10px] font-mono text-muted-foreground bg-secondary/30 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">
                      {JSON.stringify(debugData.rawLines, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider mb-1">Raw Gemini Response</p>
                    <pre className="text-[10px] font-mono text-muted-foreground bg-secondary/30 rounded p-2 overflow-auto max-h-60 whitespace-pre-wrap">
                      {debugData.rawResponse}
                    </pre>
                  </div>
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
          {metadata.confidence !== undefined && (
            <span className="text-[11px] text-muted-foreground ml-auto">
              <span className="text-foreground/50 font-mono">Confidence</span>{" "}
              <span className={`font-medium ${metadata.confidence >= 0.8 ? "text-green-400" : metadata.confidence >= 0.5 ? "text-yellow-400" : "text-red-400"}`}>
                {Math.round(metadata.confidence * 100)}%
              </span>
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
                  onSeek={seekTo}
                  onTogglePlay={togglePlay}
                  loopRegion={activeHookIndex !== null && hooks[activeHookIndex]
                    ? { start: hooks[activeHookIndex].start, end: hooks[activeHookIndex].end, duration: waveform?.duration ?? 1 }
                    : null}
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
                {/* Timing Offset Control (Bug 3: processing offset adjustment) */}
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
                  <span className="text-[10px] text-muted-foreground/40 font-mono ml-auto">sync lyrics ↔ audio</span>
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
            <div ref={lyricsContainerRef} className="max-h-[45vh] overflow-y-auto space-y-0.5">
              {activeLines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {activeVersion === "fmly"
                    ? "Click \"Make FMLY Friendly\" above to generate the clean version."
                    : "No lyrics detected — this may be an instrumental track."}
                </p>
              ) : (
                activeLines.map((line, i) => {
                  const isAdlib = line.tag === "adlib";
                  const isActive = activeLineIndices.has(i);
                  const isPrimary = i === primaryActiveLine;
                  const isEditing = i === editingIndex;
                  // Highlight lines that fall within the active looping hook
                  const activeHook = activeHookIndex !== null ? hooks[activeHookIndex] : null;
                  const isInHook = activeHook
                    ? line.start >= activeHook.start && line.start < activeHook.end
                    : false;
                  const isSelected = selectionLineIndex === i;
                  return (
                    <div
                      key={`${line.start}-${line.tag ?? "main"}-${i}`}
                      ref={isPrimary ? activeLineRef : undefined}
                      className={`group flex items-start gap-3 px-3 py-1 rounded-lg transition-all ${
                        isAdlib ? "ml-6 opacity-70" : ""
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
                      ) : (
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
            const r = 20;
            const circ = 2 * Math.PI * r;
            const dashOffset = circ * (1 - (isLooping ? clipProgress : 0));
            const clipDuration = hook ? hook.end - hook.start : 0;

            return (
              <div
                className={`glass-card rounded-xl p-4 space-y-3 transition-all duration-300 ${
                  hook && isLooping
                    ? "border border-primary/60 shadow-[0_0_18px_4px_hsl(var(--primary)/0.22)]"
                    : "border border-border/30"
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap size={11} className="text-primary" />
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                      {hook ? "Hottest Hook" : "Hook Analysis"}
                    </span>
                  </div>
                  {hook && (
                    <span className={`text-sm font-mono font-bold ${hookScoreColor(hook.score)}`}>
                      {hook.score}
                    </span>
                  )}
                </div>

                {hook ? (
                  <>
                    {/* Preview text — large & featured */}
                    <p className="text-sm font-medium text-foreground leading-snug">
                      "{hook.previewText}"
                    </p>

                    {/* Timestamp row */}
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

    </motion.div>
  );
}
