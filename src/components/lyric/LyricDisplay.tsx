import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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
}

export interface LyricData {
  title: string;
  artist: string;
  lines: LyricLine[];
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

function toLRC(data: LyricData): string {
  return [`[ti:${data.title}]`, `[ar:${data.artist}]`, "", ...data.lines.map((l) => `[${formatTimeLRC(l.start)}]${l.text}`)].join("\n");
}

function toSRT(data: LyricData): string {
  return data.lines.map((l, i) => `${i + 1}\n${formatTimeSRT(l.start)} --> ${formatTimeSRT(l.end)}\n${l.text}\n`).join("\n");
}

function toPlainText(data: LyricData): string {
  return data.lines.map((l) => l.text).join("\n");
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

/** Re-split lines by format while preserving timestamps */
function applyLineFormat(lines: LyricLine[], format: LineFormat): LyricLine[] {
  if (format === "natural") return lines;

  const result: LyricLine[] = [];

  lines.forEach((line) => {
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
      // Simple heuristic: split at punctuation
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

// ── Component ─────────────────────────────────────────────────────────────────

export function LyricDisplay({ data, audioFile, hasRealAudio = true, savedId, fmlyLines: initFmlyLines, versionMeta: initVersionMeta, onBack, onSaved, onReuploadAudio }: Props) {
  const { user } = useAuth();
  const { decodeFile, play, stop, playingId, getPlayheadPosition } = useAudioEngine();

  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveform, setWaveform] = useState<WaveformData | null>(null);
  const rafRef = useRef<number | null>(null);

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

  // ── Audio setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    const url = URL.createObjectURL(audioFile);
    audioUrlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => { setIsPlaying(false); };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    // Decode waveform (real audio only, not dummy files)
    if (audioFile.size > 0) {
      decodeFile(audioFile).then(({ waveform }) => setWaveform(waveform)).catch(() => {});
    }

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
      URL.revokeObjectURL(url);
    };
  }, [audioFile, decodeFile]);

  // ── Auto-scroll active lyric ──────────────────────────────────────────────
  const activeLine = activeLines.findIndex((l) => currentTime >= l.start && currentTime < l.end);

  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeLine]);

  // ── Playback controls ─────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const seekTo = useCallback((time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setCurrentTime(time);
    if (!isPlaying) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

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

  // Debounced autosave trigger
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
        prev.map((l) => (l.start === editedLine.start ? { ...l, text: updatedText } : l))
      );
      setExplicitLastEdited(new Date());
    } else {
      setFmlyLines((prev) =>
        prev
          ? prev.map((l) => (l.start === editedLine.start ? { ...l, text: updatedText } : l))
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
        {/* Autosave status */}
        {user && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {saveStatus === "saving" ? "● Saving…" : saveStatus === "saved" ? "✓ Saved" : ""}
          </span>
        )}
      </div>

      {/* Two-column layout */}
      <div className="flex gap-4 items-start">

        {/* ── LEFT: Waveform + Lyrics + Export ── */}
        <div className="flex-1 min-w-0 space-y-3">

          {/* Waveform */}
          <div className="glass-card rounded-xl p-3">
            {hasRealAudio ? (
              <LyricWaveform
                waveform={waveform}
                isPlaying={isPlaying}
                currentTime={currentTime}
                onSeek={seekTo}
                onTogglePlay={togglePlay}
              />
            ) : (
              <div className="h-16 flex items-center justify-between gap-3 px-1">
                <span className="text-[11px] text-muted-foreground font-mono">No audio — reupload to enable playback</span>
                <label className="cursor-pointer">
                  <span className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors border border-border/40 rounded px-2 py-1">
                    Reupload
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
              </div>
            )}
          </div>

          {/* Lyrics editor */}
          <div className="glass-card rounded-xl p-4 space-y-1">
            {activeLines.length > 0 && (
              <p className="text-[10px] text-muted-foreground text-right mb-2">Double-click a line to edit</p>
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
                  const isActive = i === activeLine;
                  const isEditing = i === editingIndex;
                  return (
                    <div
                      key={`${line.start}-${i}`}
                      ref={isActive ? activeLineRef : undefined}
                      className={`flex items-start gap-3 px-3 py-1.5 rounded-lg transition-all ${
                        isActive ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
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
                          className={`text-sm leading-relaxed cursor-text flex-1 ${isActive ? "font-medium text-primary" : ""}`}
                          onDoubleClick={() => startEditing(i)}
                        >
                          {line.text}
                        </span>
                      )}
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
        <div className="w-56 shrink-0 space-y-4">

          {/* Version toggle */}
          <div className="glass-card rounded-xl p-3">
            <VersionToggle
              active={activeVersion}
              explicitLastEdited={explicitLastEdited}
              fmlyLastEdited={fmlyLastEdited}
              hasFmly={fmlyLines !== null}
              onChange={setActiveVersion}
            />
            {/* FMLY generate button — only shown on FMLY tab */}
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
        </div>
      </div>

      <SignUpToSaveBanner />
    </motion.div>
  );
}

