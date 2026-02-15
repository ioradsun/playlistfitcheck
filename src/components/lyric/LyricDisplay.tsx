import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Play, Pause, Copy, Download, Check, FileText, Subtitles, Type, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SignUpToSaveBanner } from "@/components/SignUpToSaveBanner";

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

interface Props {
  data: LyricData;
  audioFile: File;
  savedId?: string | null;
  onBack: () => void;
  onSaved?: (id: string) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function toLRC(data: LyricData): string {
  const header = [
    `[ti:${data.title}]`,
    `[ar:${data.artist}]`,
    "",
  ].join("\n");
  const lines = data.lines.map((l) => `[${formatTime(l.start)}]${l.text}`).join("\n");
  return header + lines;
}

function toSRT(data: LyricData): string {
  return data.lines
    .map((l, i) => `${i + 1}\n${formatSrtTime(l.start)} --> ${formatSrtTime(l.end)}\n${l.text}\n`)
    .join("\n");
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

type ExportFormat = "lrc" | "srt" | "txt";

export function LyricDisplay({ data, audioFile, savedId, onBack, onSaved }: Props) {
  const { user } = useAuth();
  const [lines, setLines] = useState<LyricLine[]>(data.lines);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [copied, setCopied] = useState<ExportFormat | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentSavedId, setCurrentSavedId] = useState<string | null>(savedId ?? null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  // Create audio element
  useEffect(() => {
    const url = URL.createObjectURL(audioFile);
    audioUrlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
      URL.revokeObjectURL(url);
    };
  }, [audioFile]);

  // Auto-scroll to active line
  useEffect(() => {
    if (activeLineRef.current && lyricsContainerRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentTime]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
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

  // Build a mutable version of data for exports
  const editedData: LyricData = { ...data, lines };

  const activeLine = lines.findIndex(
    (l) => currentTime >= l.start && currentTime < l.end
  );

  const handleCopy = (format: ExportFormat) => {
    const content = format === "lrc" ? toLRC(editedData) : format === "srt" ? toSRT(editedData) : toPlainText(editedData);
    navigator.clipboard.writeText(content);
    setCopied(format);
    toast.success(`${format.toUpperCase()} copied to clipboard`);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownload = (format: ExportFormat) => {
    const baseName = editedData.title !== "Unknown" ? editedData.title : "lyrics";
    if (format === "lrc") {
      downloadFile(toLRC(editedData), `${baseName}.lrc`, "text/plain");
    } else if (format === "srt") {
      downloadFile(toSRT(editedData), `${baseName}.srt`, "text/plain");
    } else {
      downloadFile(toPlainText(editedData), `${baseName}.txt`, "text/plain");
    }
    toast.success(`${format.toUpperCase()} downloaded`);
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditText(lines[index].text);
  };

  const commitEdit = () => {
    if (editingIndex === null) return;
    setLines((prev) =>
      prev.map((l, i) => (i === editingIndex ? { ...l, text: editText } : l))
    );
    setEditingIndex(null);
  };

  const handleSave = useCallback(async () => {
    if (!user) {
      toast.error("Sign in to save lyrics to your profile");
      return;
    }
    setSaving(true);
    try {
      if (currentSavedId) {
        // Update existing
        const { error } = await supabase.from("saved_lyrics").update({
          title: editedData.title,
          artist: editedData.artist,
          lines: lines as any,
        }).eq("id", currentSavedId);
        if (error) throw error;
        toast.success("Lyrics updated");
      } else {
        // Insert new
        const { data: inserted, error } = await supabase.from("saved_lyrics").insert({
          user_id: user.id,
          title: editedData.title,
          artist: editedData.artist,
          filename: audioFile.name,
          lines: lines as any,
        }).select("id").single();
        if (error) throw error;
        if (inserted) {
          setCurrentSavedId(inserted.id);
          onSaved?.(inserted.id);
        }
        toast.success("Lyrics saved to your profile");
      }
    } catch (e) {
      console.error("Save lyrics error:", e);
      toast.error("Failed to save lyrics");
    } finally {
      setSaving(false);
    }
  }, [user, currentSavedId, editedData, lines, audioFile.name, onSaved]);

  const exportOptions: { format: ExportFormat; label: string; icon: React.ReactNode; desc: string }[] = [
    { format: "lrc", label: "LRC", icon: <Subtitles size={14} />, desc: "Synced lyrics" },
    { format: "srt", label: "SRT", icon: <FileText size={14} />, desc: "Subtitles" },
    { format: "txt", label: "TXT", icon: <Type size={14} />, desc: "Plain text" },
  ];

  return (
    <motion.div
      className="w-full max-w-2xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft size={20} />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate">
            {audioFile.name}
          </h2>
        </div>
        <div className="flex gap-2">
          {user && lines.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="gap-1.5"
            >
              <Save size={14} />
              {saving ? "Saving…" : currentSavedId ? "Update" : "Save"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={togglePlay}
            className="gap-1.5"
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            {isPlaying ? "Pause" : "Play"}
          </Button>
        </div>
      </div>

      {/* Lyrics with synced highlighting */}
      <div className="glass-card rounded-xl p-5 space-y-1">
        {lines.length > 0 && (
          <p className="text-[10px] text-muted-foreground text-right mb-2">Double-click a line to edit</p>
        )}
        <div
          ref={lyricsContainerRef}
          className="max-h-[40vh] overflow-y-auto space-y-1"
        >
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No lyrics detected — this may be an instrumental track.
          </p>
        ) : (
          lines.map((line, i) => {
            const isActive = i === activeLine;
            const isEditing = i === editingIndex;
            return (
              <div
                key={i}
                ref={isActive ? activeLineRef : undefined}
                className={`flex items-start gap-3 px-3 py-1.5 rounded-lg transition-all ${
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                }`}
              >
                <span
                  className="text-[10px] font-mono text-muted-foreground/60 pt-0.5 shrink-0 w-12 cursor-pointer"
                  onClick={() => seekTo(line.start)}
                >
                  {formatTime(line.start)}
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
                    className={`text-sm leading-relaxed cursor-text ${isActive ? "font-medium text-primary" : ""}`}
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

      {/* Export buttons */}
      {lines.length > 0 && (
        <div className="glass-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground font-mono mb-3">Export</p>
          <div className="grid grid-cols-3 gap-3">
            {exportOptions.map(({ format, label, icon, desc }) => (
              <div key={format} className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  {icon}
                  <span className="text-xs font-semibold">{label}</span>
                  <span className="text-[10px] text-muted-foreground">· {desc}</span>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1 text-xs h-7"
                    onClick={() => handleCopy(format)}
                  >
                    {copied === format ? <Check size={12} className="mr-1" /> : <Copy size={12} className="mr-1" />}
                    Copy
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1 text-xs h-7"
                    onClick={() => handleDownload(format)}
                  >
                    <Download size={12} className="mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <SignUpToSaveBanner />
    </motion.div>
  );
}
