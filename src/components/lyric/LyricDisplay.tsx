import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Play, Pause, Copy, Download, Check, FileText, Subtitles, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
  onBack: () => void;
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

export function LyricDisplay({ data, audioFile, onBack }: Props) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [copied, setCopied] = useState<ExportFormat | null>(null);
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

  const activeLine = data.lines.findIndex(
    (l) => currentTime >= l.start && currentTime < l.end
  );

  const handleCopy = (format: ExportFormat) => {
    const content = format === "lrc" ? toLRC(data) : format === "srt" ? toSRT(data) : toPlainText(data);
    navigator.clipboard.writeText(content);
    setCopied(format);
    toast.success(`${format.toUpperCase()} copied to clipboard`);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownload = (format: ExportFormat) => {
    const baseName = data.title !== "Unknown" ? data.title : "lyrics";
    if (format === "lrc") {
      downloadFile(toLRC(data), `${baseName}.lrc`, "text/plain");
    } else if (format === "srt") {
      downloadFile(toSRT(data), `${baseName}.srt`, "text/plain");
    } else {
      downloadFile(toPlainText(data), `${baseName}.txt`, "text/plain");
    }
    toast.success(`${format.toUpperCase()} downloaded`);
  };

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
            {data.title !== "Unknown" ? data.title : audioFile.name}
          </h2>
          {data.artist !== "Unknown" && (
            <p className="text-sm text-muted-foreground">{data.artist}</p>
          )}
        </div>
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

      {/* Lyrics with synced highlighting */}
      <div
        ref={lyricsContainerRef}
        className="glass-card rounded-xl p-5 max-h-[400px] overflow-y-auto space-y-1"
      >
        {data.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No lyrics detected — this may be an instrumental track.
          </p>
        ) : (
          data.lines.map((line, i) => {
            const isActive = i === activeLine;
            return (
              <div
                key={i}
                ref={isActive ? activeLineRef : undefined}
                className={`flex items-start gap-3 px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                }`}
                onClick={() => seekTo(line.start)}
              >
                <span className="text-[10px] font-mono text-muted-foreground/60 pt-0.5 shrink-0 w-12">
                  {formatTime(line.start)}
                </span>
                <span className={`text-sm leading-relaxed ${isActive ? "font-medium text-primary" : ""}`}>
                  {line.text}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Export buttons */}
      {data.lines.length > 0 && (
        <div className="glass-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-3 font-mono">Export</p>
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
    </motion.div>
  );
}
