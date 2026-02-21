import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
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

// ── Aspect ratio → canvas dimensions ────────────────────────────────────────
const ASPECT_DIMS: Record<string, [number, number]> = {
  "9:16": [1080, 1920],
  "1:1":  [1080, 1080],
  "16:9": [1920, 1080],
};

const ASPECT_OPTIONS = [
  { key: "9:16", label: "9:16", sub: "TikTok / Reels" },
  { key: "1:1",  label: "1:1",  sub: "Instagram" },
  { key: "16:9", label: "16:9", sub: "YouTube" },
];

const FONT_OPTIONS = [
  { key: "Geist", label: "Geist", css: '"Geist", system-ui, sans-serif' },
  { key: "Mono", label: "Mono", css: '"Geist Mono", monospace' },
  { key: "Serif", label: "Serif", css: 'Georgia, "Times New Roman", serif' },
  { key: "Impact", label: "Impact", css: 'Impact, "Arial Black", sans-serif' },
];

const FPS = 30;
const BG_LOOP_SECONDS = 6;

// ── Gradient presets ────────────────────────────────────────────────────────
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

// ── Word animation helpers ──────────────────────────────────────────────────
interface WordEntry { word: string; start: number; lineIdx: number; }

function buildWordTimeline(lines: LyricLine[], regionStart: number, regionEnd: number): WordEntry[] {
  const words: WordEntry[] = [];
  lines.forEach((line, lineIdx) => {
    if (line.end < regionStart || line.start > regionEnd) return;
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

function bounceEase(t: number): number {
  if (t < 0) return 0;
  if (t > 1) return 1;
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
  cw: number,
  ch: number,
  fontCss: string,
  fontSize: number,
  titleText: string,
  artistText: string,
  bgImage?: HTMLImageElement | null,
) {
  const relTime = time - regionStart;
  // Looping background animation time
  const bgTime = relTime % BG_LOOP_SECONDS;

  // Background
  if (bgImage) {
    const scale = Math.max(cw / bgImage.width, ch / bgImage.height);
    const w = bgImage.width * scale;
    const h = bgImage.height * scale;
    const zoom = 1 + 0.03 * Math.sin(bgTime * 0.5);
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cw / 2, -ch / 2);
    ctx.drawImage(bgImage, (cw - w) / 2, (ch - h) / 2, w, h);
    ctx.restore();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, cw, ch);
  } else {
    const grad = ctx.createLinearGradient(0, 0, cw * 0.3, ch);
    grad.addColorStop(0, gradient[0]);
    grad.addColorStop(0.5, gradient[1]);
    grad.addColorStop(1, gradient[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);
    const glowX = cw * 0.5 + Math.sin(bgTime * 0.8) * cw * 0.15;
    const glowY = ch * 0.45 + Math.cos(bgTime * 0.6) * ch * 0.08;
    const radGrad = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, cw * 0.6);
    radGrad.addColorStop(0, "rgba(255,255,255,0.06)");
    radGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, cw, ch);
  }

  // ── Artist / Title metadata (top corners) ──────────────────────────────────
  const metaSize = Math.round(cw * 0.02);
  ctx.font = `500 ${metaSize}px "Geist Mono", monospace`;
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 4;

  const pad = Math.round(cw * 0.04);
  ctx.textAlign = "left";
  ctx.letterSpacing = "0.15em";
  ctx.fillText(artistText.toUpperCase(), pad, pad);
  ctx.textAlign = "right";
  ctx.fillText(titleText.toUpperCase(), cw - pad, pad);

  ctx.shadowBlur = 0;
  ctx.letterSpacing = "0em";

  // ── Lyrics ─────────────────────────────────────────────────────────────────
  const lineGroups = new Map<number, WordEntry[]>();
  for (const w of words) {
    if (!lineGroups.has(w.lineIdx)) lineGroups.set(w.lineIdx, []);
    lineGroups.get(w.lineIdx)!.push(w);
  }

  const activeLineIdxs: number[] = [];
  for (const [lineIdx, lineWords] of lineGroups) {
    const lineStart = Math.min(...lineWords.map(w => w.start));
    const lineEnd = Math.max(...lineWords.map(w => w.start)) + 0.6;
    if (time >= lineStart - 0.15 && time <= lineEnd + 1.0) {
      activeLineIdxs.push(lineIdx);
    }
  }
  activeLineIdxs.sort((a, b) => a - b);
  const visibleLines = activeLineIdxs.slice(-2);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lineHeight = fontSize * 1.6;
  const totalHeight = visibleLines.length * lineHeight;
  const startY = ch * 0.5 - totalHeight / 2 + lineHeight / 2;

  visibleLines.forEach((lineIdx, vi) => {
    const lineWords = lineGroups.get(lineIdx) || [];
    const y = startY + vi * lineHeight;

    ctx.font = `bold ${fontSize}px ${fontCss}`;
    const fullText = lineWords.map(w => w.word).join(" ");
    const totalWidth = ctx.measureText(fullText).width;
    let x = (cw - totalWidth) / 2;

    lineWords.forEach((w) => {
      const wordAge = time - w.start;
      const bounce = bounceEase(wordAge / 0.25);
      const alpha = Math.min(1, Math.max(0, wordAge * 4));
      const scale = bounce;

      ctx.save();
      const wordWidth = ctx.measureText(w.word + " ").width;
      const wx = x + wordWidth / 2;

      ctx.translate(wx, y);
      ctx.scale(scale, scale);
      ctx.translate(-wx, -y);

      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 4;

      if (wordAge < 0.5 && wordAge >= 0) {
        ctx.shadowColor = "rgba(255,255,255,0.4)";
        ctx.shadowBlur = 20;
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = wordAge >= 0 ? "#FFFFFF" : "rgba(255,255,255,0.2)";
      ctx.font = `bold ${fontSize}px ${fontCss}`;
      ctx.fillText(w.word, wx, y);

      ctx.restore();
      x += wordWidth;
    });
  });

  ctx.globalAlpha = 1;
}

// ── Component ───────────────────────────────────────────────────────────────
export function LyricVideoComposer({ open, onOpenChange, lines, hook, metadata, title, artist }: Props) {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const playStartRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [bgPrompt, setBgPrompt] = useState("");
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [generatingBg, setGeneratingBg] = useState(false);

  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [fontFamily, setFontFamily] = useState("Geist");
  const [fontSize, setFontSize] = useState(72);

  const songEnd = lines[lines.length - 1]?.end ?? 60;
  const defaultStart = hook?.start ?? 0;
  const defaultEnd = hook?.end ?? Math.min(defaultStart + 15, songEnd);
  const [regionStart, setRegionStart] = useState(defaultStart);
  const [regionEnd, setRegionEnd] = useState(defaultEnd);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);

  const duration = regionEnd - regionStart;
  const [cw, ch] = ASPECT_DIMS[aspectRatio] || ASPECT_DIMS["9:16"];
  const gradient = getMoodGradient(metadata?.mood);
  const wordTimeline = buildWordTimeline(lines, regionStart, regionEnd);
  const fontCss = FONT_OPTIONS.find(f => f.key === fontFamily)?.css ?? FONT_OPTIONS[0].css;

  // Preview scale — fit to max 480px wide or 420px tall
  const previewScale = Math.min(480 / cw, 420 / ch);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setBgPrompt("");
      setIsPlaying(false);
      setIsRecording(false);
      setRegionStart(defaultStart);
      setRegionEnd(defaultEnd);
      currentTimeRef.current = defaultStart;
    }
  }, [open]);

  // ── Draw preview ──────────────────────────────────────────────────────────
  const drawPreview = useCallback((time: number) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.scale(previewScale, previewScale);
    drawFrame(ctx, time, regionStart, wordTimeline, gradient, cw, ch, fontCss, fontSize, title, artist, bgImage);
    ctx.restore();
  }, [regionStart, wordTimeline, gradient, cw, ch, fontCss, fontSize, title, artist, bgImage, previewScale]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !open || step !== 3) return;
    playStartRef.current = performance.now();
    const startOffset = currentTimeRef.current - regionStart;

    const tick = () => {
      const elapsed = (performance.now() - playStartRef.current) / 1000;
      const loopedTime = (startOffset + elapsed) % duration;
      const time = regionStart + loopedTime;
      currentTimeRef.current = time;
      drawPreview(time);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isPlaying, open, step, drawPreview, duration, regionStart]);

  // Draw initial frame on step 3
  useEffect(() => {
    if (open && step === 3 && !isPlaying) {
      drawPreview(regionStart);
    }
  }, [open, step, isPlaying, drawPreview, regionStart]);

  // ── Generate background ────────────────────────────────────────────────────
  const generateBackground = useCallback(async () => {
    setGeneratingBg(true);
    try {
      const { data, error } = await supabase.functions.invoke("lyric-video-bg", {
        body: {
          title, artist,
          mood: metadata?.mood || "atmospheric",
          description: metadata?.description || "",
          userPrompt: bgPrompt,
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
      toast.success("Background generated");
    } catch (e) {
      console.error("BG generation error:", e);
      toast.error("Failed to generate background");
    } finally {
      setGeneratingBg(false);
    }
  }, [title, artist, metadata, bgPrompt]);

  // ── Record & download ──────────────────────────────────────────────────────
  const handleRecord = useCallback(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
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

    const renderNextFrame = () => {
      if (frame >= totalFrames) {
        mediaRecorder.stop();
        return;
      }
      const time = regionStart + (frame / FPS);
      drawFrame(ctx, time, regionStart, wordTimeline, gradient, cw, ch, fontCss, fontSize, title, artist, bgImage);
      frame++;
      setRecordingProgress(frame / totalFrames);
      setTimeout(renderNextFrame, 1000 / FPS);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${artist.replace(/[^a-zA-Z0-9]/g, "_")}_${title.replace(/[^a-zA-Z0-9]/g, "_")}_lyric_video.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setIsRecording(false);
      setRecordingProgress(0);
      toast.success("Video downloaded!");
    };

    renderNextFrame();
  }, [duration, regionStart, wordTimeline, gradient, cw, ch, fontCss, fontSize, title, artist, bgImage]);

  // ── Wizard navigation ─────────────────────────────────────────────────────
  const canGoNext = () => {
    if (step === 1) return true; // prompt is optional
    if (step === 2) return duration >= 6;
    if (step === 3) return true;
    return false;
  };

  const nextStep = () => {
    if (step < 4) setStep((step + 1) as 1 | 2 | 3 | 4);
  };
  const prevStep = () => {
    if (step > 1) setStep((step - 1) as 1 | 2 | 3 | 4);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground font-medium">
            Lyric Video Creator
          </DialogTitle>
          <DialogDescription className="sr-only">
            Create a lyric video with custom background, font, and clip region
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex gap-1 mt-1">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-[2px] flex-1 rounded-full transition-colors ${
                s <= step ? "bg-foreground" : "bg-border/30"
              }`}
            />
          ))}
        </div>

        {/* ── Step 1: Describe ───────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground block mb-2">
                Describe the visual vibe
              </label>
              <Textarea
                value={bgPrompt}
                onChange={(e) => setBgPrompt(e.target.value)}
                placeholder={metadata?.mood ? `e.g. ${metadata.mood} atmosphere, abstract shapes, deep colors` : "neon rain on dark streets, cinematic haze"}
                className="min-h-[80px] text-sm resize-none"
                rows={3}
              />
            </div>

            <div className="border-t border-border/30 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                    {artist}
                  </p>
                  <p className="text-sm font-medium mt-0.5">{title}</p>
                </div>
                <Button
                  size="sm"
                  onClick={generateBackground}
                  disabled={generatingBg}
                  className="text-[13px] font-semibold tracking-[0.15em] uppercase"
                >
                  {generatingBg ? (
                    <><Loader2 size={12} className="animate-spin mr-2" />Generating</>
                  ) : (
                    bgImage ? "Regenerate" : "Generate Background"
                  )}
                </Button>
              </div>
              {bgImage && (
                <button
                  onClick={() => setBgImage(null)}
                  className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/60 hover:text-muted-foreground mt-2 transition-colors"
                >
                  Use gradient instead
                </button>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                size="sm"
                onClick={nextStep}
                className="text-[13px] font-semibold tracking-[0.15em] uppercase"
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Configure ──────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5 mt-2">
            {/* Aspect ratio */}
            <div>
              <label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground block mb-2">
                Aspect Ratio
              </label>
              <div className="flex gap-2">
                {ASPECT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setAspectRatio(opt.key)}
                    className={`flex-1 py-2 rounded-md text-center transition-colors ${
                      aspectRatio === opt.key
                        ? "bg-foreground text-background"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="text-[13px] font-semibold tracking-[0.15em] uppercase block">{opt.label}</span>
                    <span className="text-[10px] font-mono tracking-widest opacity-60 block mt-0.5">{opt.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-border/30" />

            {/* Clip region */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                  Clip Region
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {regionStart.toFixed(1)}s – {regionEnd.toFixed(1)}s ({duration.toFixed(1)}s)
                  </span>
                  <button
                    onClick={() => { setRegionStart(0); setRegionEnd(songEnd); }}
                    className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60 hover:text-foreground transition-colors"
                  >
                    Full Song
                  </button>
                </div>
              </div>
              <Slider
                value={[regionStart, regionEnd]}
                min={0}
                max={songEnd}
                step={0.1}
                onValueChange={([s, e]) => {
                  if (e - s >= 6) {
                    setRegionStart(s);
                    setRegionEnd(e);
                  }
                }}
              />
            </div>

            <div className="border-t border-border/30" />

            {/* Font */}
            <div>
              <label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground block mb-2">
                Font
              </label>
              <div className="flex gap-2">
                {FONT_OPTIONS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFontFamily(f.key)}
                    className={`flex-1 py-2 rounded-md text-center transition-colors ${
                      fontFamily === f.key
                        ? "bg-foreground text-background"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                    style={{ fontFamily: f.css }}
                  >
                    <span className="text-sm font-semibold">{f.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                  Font Size
                </label>
                <span className="text-[10px] font-mono text-muted-foreground">{fontSize}px</span>
              </div>
              <Slider
                value={[fontSize]}
                min={48}
                max={96}
                step={2}
                onValueChange={([v]) => setFontSize(v)}
              />
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={prevStep}
                className="text-[13px] font-semibold tracking-[0.15em] uppercase">
                Back
              </Button>
              <Button size="sm" onClick={nextStep} disabled={!canGoNext()}
                className="text-[13px] font-semibold tracking-[0.15em] uppercase">
                Preview
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Preview ────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4 mt-2">
            <div
              className="relative mx-auto rounded-lg overflow-hidden bg-black"
              style={{ width: cw * previewScale, height: ch * previewScale }}
            >
              <canvas
                ref={previewCanvasRef}
                width={cw * previewScale}
                height={ch * previewScale}
                className="block"
              />
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity"
              >
                <span className="text-white text-[13px] font-semibold tracking-[0.15em] uppercase">
                  {isPlaying ? "Pause" : "Play"}
                </span>
              </button>
            </div>

            <div className="text-center text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
              {duration.toFixed(1)}s • {aspectRatio} • {fontFamily} {fontSize}px
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={() => { setIsPlaying(false); prevStep(); }}
                className="text-[13px] font-semibold tracking-[0.15em] uppercase">
                Back
              </Button>
              <Button size="sm" onClick={() => { setIsPlaying(false); nextStep(); }}
                className="text-[13px] font-semibold tracking-[0.15em] uppercase">
                Export
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Export ──────────────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-4 mt-2">
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">{title}</p>
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">{artist}</p>
              <p className="text-[10px] font-mono text-muted-foreground mt-2">
                {duration.toFixed(1)}s • {aspectRatio} • {cw}×{ch} • {fontFamily}
              </p>
            </div>

            {isRecording && (
              <div className="space-y-1">
                <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-foreground transition-all"
                    style={{ width: `${Math.round(recordingProgress * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] font-mono text-center text-muted-foreground">
                  {Math.round(recordingProgress * 100)}%
                </p>
              </div>
            )}

            <Button
              onClick={handleRecord}
              disabled={isRecording}
              className="w-full text-[13px] font-semibold tracking-[0.15em] uppercase"
              size="sm"
            >
              {isRecording ? "Recording..." : "Download Video"}
            </Button>

            <div className="flex justify-start">
              <Button variant="ghost" size="sm" onClick={() => { setIsRecording(false); prevStep(); }}
                disabled={isRecording}
                className="text-[13px] font-semibold tracking-[0.15em] uppercase">
                Back
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
