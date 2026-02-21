import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Video, Download, Play, Pause, Loader2, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { LyricLine, LyricHook, LyricMetadata } from "./LyricDisplay";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: LyricLine[];
  hook?: LyricHook | null;
  metadata?: LyricMetadata | null;
  title: string;
  artist: string;
}

// ── Canvas dimensions (9:16 vertical for TikTok/Reels) ──────────────────────
const CW = 1080;
const CH = 1920;
const PREVIEW_SCALE = 0.22;
const FPS = 30;

// ── Gradient presets based on mood ───────────────────────────────────────────
const MOOD_GRADIENTS: Record<string, [string, string, string]> = {
  happy:      ["#FFD700", "#FF6B35", "#FF1493"],
  sad:        ["#1a1a2e", "#16213e", "#0f3460"],
  energetic:  ["#FF0000", "#FF4500", "#FF8C00"],
  chill:      ["#0d1b2a", "#1b263b", "#415a77"],
  dark:       ["#0a0a0a", "#1a1a2e", "#2d1b69"],
  romantic:   ["#8B0000", "#C71585", "#FF69B4"],
  aggressive: ["#1a0000", "#4a0000", "#8B0000"],
  dreamy:     ["#2E1065", "#7C3AED", "#C4B5FD"],
  default:    ["#0f0f23", "#1a1a3e", "#2d2d5e"],
};

function getMoodGradient(mood?: string): [string, string, string] {
  if (!mood) return MOOD_GRADIENTS.default;
  const m = mood.toLowerCase();
  for (const [key, val] of Object.entries(MOOD_GRADIENTS)) {
    if (m.includes(key)) return val;
  }
  return MOOD_GRADIENTS.default;
}

// ── Word animation helpers ───────────────────────────────────────────────────
interface WordEntry {
  word: string;
  start: number;
  lineIdx: number;
}

function buildWordTimeline(lines: LyricLine[], regionStart: number, regionEnd: number): WordEntry[] {
  const words: WordEntry[] = [];
  lines.forEach((line, lineIdx) => {
    if (line.end < regionStart || line.start > regionEnd) return;
    // Split line text into words and distribute timing
    const lineWords = line.text.split(/\s+/).filter(Boolean);
    const lineDur = line.end - line.start;
    const wordDur = lineDur / Math.max(lineWords.length, 1);
    lineWords.forEach((w, wi) => {
      const wStart = line.start + wi * wordDur;
      if (wStart >= regionStart - 0.5 && wStart <= regionEnd + 0.5) {
        words.push({ word: w, start: wStart, lineIdx });
      }
    });
  });
  return words;
}

// ── Easing ───────────────────────────────────────────────────────────────────
function bounceEase(t: number): number {
  if (t < 0) return 0;
  if (t > 1) return 1;
  // Quick overshoot bounce
  if (t < 0.5) return 4 * t * t;
  if (t < 0.8) return 1 + 0.3 * Math.sin((t - 0.5) * Math.PI / 0.3);
  return 1;
}

// ── Draw a single frame ─────────────────────────────────────────────────────
function drawFrame(
  ctx: CanvasRenderingContext2D,
  time: number,
  regionStart: number,
  words: WordEntry[],
  gradient: [string, string, string],
  bgImage?: HTMLImageElement | null,
) {
  const relTime = time - regionStart;

  // Background
  if (bgImage) {
    // Cover-fit the image
    const scale = Math.max(CW / bgImage.width, CH / bgImage.height);
    const w = bgImage.width * scale;
    const h = bgImage.height * scale;
    ctx.drawImage(bgImage, (CW - w) / 2, (CH - h) / 2, w, h);
    // Subtle Ken Burns zoom
    const zoom = 1 + 0.03 * Math.sin(relTime * 0.5);
    ctx.save();
    ctx.translate(CW / 2, CH / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-CW / 2, -CH / 2);
    ctx.drawImage(bgImage, (CW - w) / 2, (CH - h) / 2, w, h);
    ctx.restore();
    // Dark overlay for text readability
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, CW, CH);
  } else {
    const grad = ctx.createLinearGradient(0, 0, CW * 0.3, CH);
    grad.addColorStop(0, gradient[0]);
    grad.addColorStop(0.5, gradient[1]);
    grad.addColorStop(1, gradient[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CW, CH);
    // Subtle animated glow
    const glowX = CW * 0.5 + Math.sin(relTime * 0.8) * CW * 0.15;
    const glowY = CH * 0.45 + Math.cos(relTime * 0.6) * CH * 0.08;
    const radGrad = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, CW * 0.6);
    radGrad.addColorStop(0, "rgba(255,255,255,0.06)");
    radGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, CW, CH);
  }

  // Group words by line
  const lineGroups = new Map<number, WordEntry[]>();
  for (const w of words) {
    if (!lineGroups.has(w.lineIdx)) lineGroups.set(w.lineIdx, []);
    lineGroups.get(w.lineIdx)!.push(w);
  }

  // Find currently active lines (show up to 2 lines)
  const activeLineIdxs: number[] = [];
  for (const [lineIdx, lineWords] of lineGroups) {
    const lineStart = Math.min(...lineWords.map(w => w.start));
    const lineEnd = Math.max(...lineWords.map(w => w.start)) + 0.6;
    if (time >= lineStart - 0.15 && time <= lineEnd + 1.0) {
      activeLineIdxs.push(lineIdx);
    }
  }
  activeLineIdxs.sort((a, b) => a - b);
  const visibleLines = activeLineIdxs.slice(-2); // Show last 2 active lines

  // Render each visible line
  const fontSize = 72;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lineHeight = fontSize * 1.6;
  const totalHeight = visibleLines.length * lineHeight;
  const startY = CH * 0.5 - totalHeight / 2 + lineHeight / 2;

  visibleLines.forEach((lineIdx, vi) => {
    const lineWords = lineGroups.get(lineIdx) || [];
    const y = startY + vi * lineHeight;

    // Measure total line width
    ctx.font = `bold ${fontSize}px "Geist", system-ui, sans-serif`;
    const fullText = lineWords.map(w => w.word).join(" ");
    const totalWidth = ctx.measureText(fullText).width;
    let x = (CW - totalWidth) / 2;

    lineWords.forEach((w) => {
      const wordAge = time - w.start;
      const bounce = bounceEase(wordAge / 0.25); // 250ms bounce-in
      const alpha = Math.min(1, Math.max(0, wordAge * 4)); // quick fade-in
      const scale = bounce;

      ctx.save();
      const wordWidth = ctx.measureText(w.word + " ").width;
      const wx = x + wordWidth / 2;

      ctx.translate(wx, y);
      ctx.scale(scale, scale);
      ctx.translate(-wx, -y);

      // Text shadow
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 4;

      // Glow on recently appeared words
      if (wordAge < 0.5 && wordAge >= 0) {
        ctx.shadowColor = "rgba(255,255,255,0.4)";
        ctx.shadowBlur = 20;
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = wordAge >= 0 ? "#FFFFFF" : "rgba(255,255,255,0.2)";
      ctx.font = `bold ${fontSize}px "Geist", system-ui, sans-serif`;
      ctx.fillText(w.word, wx, y);

      ctx.restore();
      x += wordWidth;
    });
  });

  ctx.globalAlpha = 1;
}

export function LyricVideoComposer({ open, onOpenChange, lines, hook, metadata, title, artist }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [generatingBg, setGeneratingBg] = useState(false);
  const playStartRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);

  // Region: default to hook or first 8 seconds
  const defaultStart = hook?.start ?? 0;
  const defaultEnd = hook?.end ?? Math.min(defaultStart + 8, lines[lines.length - 1]?.end ?? 8);
  const [regionStart, setRegionStart] = useState(defaultStart);
  const [regionEnd, setRegionEnd] = useState(defaultEnd);
  const duration = regionEnd - regionStart;

  const gradient = getMoodGradient(metadata?.mood);
  const wordTimeline = buildWordTimeline(lines, regionStart, regionEnd);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setRegionStart(defaultStart);
      setRegionEnd(defaultEnd);
      setIsPlaying(false);
      setIsRecording(false);
      currentTimeRef.current = regionStart;
    }
  }, [open]);

  // Draw preview
  const drawPreview = useCallback((time: number) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.scale(PREVIEW_SCALE, PREVIEW_SCALE);
    drawFrame(ctx, time, regionStart, wordTimeline, gradient, bgImage);
    ctx.restore();
  }, [regionStart, wordTimeline, gradient, bgImage]);

  // Animation loop for preview
  useEffect(() => {
    if (!isPlaying || !open) return;
    playStartRef.current = performance.now();
    const startOffset = currentTimeRef.current - regionStart;

    const tick = () => {
      const elapsed = (performance.now() - playStartRef.current) / 1000;
      const loopedTime = ((startOffset + elapsed) % duration);
      const time = regionStart + loopedTime;
      currentTimeRef.current = time;
      drawPreview(time);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, open, drawPreview, duration, regionStart]);

  // Draw initial frame
  useEffect(() => {
    if (open && !isPlaying) {
      drawPreview(regionStart);
    }
  }, [open, isPlaying, drawPreview, regionStart]);

  // ── Generate AI background ─────────────────────────────────────────────────
  const generateBackground = useCallback(async () => {
    setGeneratingBg(true);
    try {
      const { data, error } = await supabase.functions.invoke("lyric-video-bg", {
        body: {
          title,
          artist,
          mood: metadata?.mood || "atmospheric",
          description: metadata?.description || "",
        },
      });
      if (error) throw error;
      if (!data?.imageUrl) throw new Error("No image returned");
      
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = data.imageUrl;
      });
      setBgImage(img);
      toast.success("Background generated!");
    } catch (e) {
      console.error("BG generation error:", e);
      toast.error("Failed to generate background");
    } finally {
      setGeneratingBg(false);
    }
  }, [title, artist, metadata]);

  // ── Record & Download ─────────────────────────────────────────────────────
  const handleRecord = useCallback(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = CW;
    canvas.height = CH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsRecording(true);
    setRecordingProgress(0);

    const stream = canvas.captureStream(FPS);
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9",
      videoBitsPerSecond: 8_000_000,
    });
    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const totalFrames = Math.ceil(duration * FPS);
    let frame = 0;

    mediaRecorder.start();

    // Render frame by frame
    const renderNextFrame = () => {
      if (frame >= totalFrames) {
        mediaRecorder.stop();
        return;
      }
      const time = regionStart + (frame / FPS);
      drawFrame(ctx, time, regionStart, wordTimeline, gradient, bgImage);
      frame++;
      setRecordingProgress(frame / totalFrames);
      // Pace frames at ~30fps for MediaRecorder
      setTimeout(renderNextFrame, 1000 / FPS);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}_lyric_video.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setIsRecording(false);
      setRecordingProgress(0);
      toast.success("Video downloaded!");
    };

    renderNextFrame();
  }, [duration, regionStart, wordTimeline, gradient, bgImage, title]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Video size={14} className="text-primary" />
            Lyric Video Creator
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Create a {Math.round(duration)}s looping lyric video with bouncing text
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview canvas */}
          <div className="relative mx-auto rounded-lg overflow-hidden bg-black"
            style={{ width: CW * PREVIEW_SCALE, height: CH * PREVIEW_SCALE }}>
            <canvas
              ref={previewCanvasRef}
              width={CW * PREVIEW_SCALE}
              height={CH * PREVIEW_SCALE}
              className="block"
            />
            {/* Play/Pause overlay */}
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity"
            >
              {isPlaying ? <Pause size={32} className="text-white" /> : <Play size={32} className="text-white" />}
            </button>
          </div>

          {/* Region controls */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Clip Region</span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {regionStart.toFixed(1)}s – {regionEnd.toFixed(1)}s ({duration.toFixed(1)}s)
              </span>
            </div>
            <Slider
              value={[regionStart, regionEnd]}
              min={0}
              max={lines[lines.length - 1]?.end ?? 60}
              step={0.1}
              onValueChange={([s, e]) => {
                const dur = e - s;
                if (dur >= 6 && dur <= 10) {
                  setRegionStart(s);
                  setRegionEnd(e);
                }
              }}
            />
          </div>

          {/* Background controls */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={generateBackground}
              disabled={generatingBg}
            >
              {generatingBg ? (
                <Loader2 size={12} className="animate-spin mr-1" />
              ) : (
                <ImagePlus size={12} className="mr-1" />
              )}
              {bgImage ? "Regenerate BG" : "Generate AI Background"}
            </Button>
            {bgImage && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setBgImage(null)}>
                Use Gradient
              </Button>
            )}
          </div>

          {/* Download */}
          <Button
            onClick={handleRecord}
            disabled={isRecording}
            className="w-full"
            size="sm"
          >
            {isRecording ? (
              <>
                <Loader2 size={14} className="animate-spin mr-2" />
                Recording... {Math.round(recordingProgress * 100)}%
              </>
            ) : (
              <>
                <Download size={14} className="mr-2" />
                Download Lyric Video (.webm)
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
