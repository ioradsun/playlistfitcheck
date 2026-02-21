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
  audioFile?: File | null;
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

type BgStyle = "particles" | "aurora" | "nebula" | "rain" | "ai";

const BG_STYLE_OPTIONS: { key: BgStyle; label: string; sub: string }[] = [
  { key: "particles", label: "Particles", sub: "Floating light field" },
  { key: "aurora",    label: "Aurora",    sub: "Flowing wave gradients" },
  { key: "nebula",    label: "Nebula",    sub: "Deep space clouds" },
  { key: "rain",      label: "Rain",      sub: "Falling streaks" },
  { key: "ai",        label: "AI Generated", sub: "Custom from prompt" },
];

const FPS = 30;

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

// ── Seeded random for deterministic particles ───────────────────────────────
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

// ── Procedural animated backgrounds ─────────────────────────────────────────

function drawBgParticles(ctx: CanvasRenderingContext2D, t: number, cw: number, ch: number, gradient: [string, string, string]) {
  // Dark base
  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, gradient[0]);
  grad.addColorStop(1, gradient[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);

  const rng = seededRandom(42);
  const count = 80;
  for (let i = 0; i < count; i++) {
    const baseX = rng() * cw;
    const baseY = rng() * ch;
    const speed = 0.2 + rng() * 0.8;
    const size = 1 + rng() * 3;
    const phase = rng() * Math.PI * 2;

    const x = (baseX + Math.sin(t * speed * 0.3 + phase) * 40) % cw;
    const y = (baseY + t * speed * 15) % ch;
    const alpha = 0.2 + 0.6 * Math.sin(t * speed + phase);

    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0.05, alpha)})`;
    ctx.fill();

    // Glow
    if (size > 2) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 6);
      glow.addColorStop(0, `rgba(255,255,255,${alpha * 0.15})`);
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - size * 6, y - size * 6, size * 12, size * 12);
    }
  }
}

function drawBgAurora(ctx: CanvasRenderingContext2D, t: number, cw: number, ch: number, gradient: [string, string, string]) {
  // Deep dark base
  ctx.fillStyle = "#050510";
  ctx.fillRect(0, 0, cw, ch);

  // Draw flowing aurora bands
  for (let band = 0; band < 4; band++) {
    const bandY = ch * (0.25 + band * 0.15);
    const hue = (band * 60 + t * 15) % 360;
    ctx.beginPath();
    ctx.moveTo(0, bandY);

    for (let x = 0; x <= cw; x += 4) {
      const wave1 = Math.sin(x * 0.003 + t * 0.5 + band) * ch * 0.08;
      const wave2 = Math.sin(x * 0.007 + t * 0.3 + band * 2) * ch * 0.04;
      const wave3 = Math.sin(x * 0.001 + t * 0.8) * ch * 0.06;
      ctx.lineTo(x, bandY + wave1 + wave2 + wave3);
    }

    ctx.lineTo(cw, ch);
    ctx.lineTo(0, ch);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, bandY - ch * 0.1, 0, bandY + ch * 0.3);
    grad.addColorStop(0, `hsla(${hue}, 80%, 50%, 0)`);
    grad.addColorStop(0.3, `hsla(${hue}, 80%, 50%, 0.15)`);
    grad.addColorStop(0.5, `hsla(${hue}, 70%, 60%, 0.08)`);
    grad.addColorStop(1, `hsla(${hue}, 80%, 50%, 0)`);
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

function drawBgNebula(ctx: CanvasRenderingContext2D, t: number, cw: number, ch: number, gradient: [string, string, string]) {
  // Very deep base
  ctx.fillStyle = gradient[0];
  ctx.fillRect(0, 0, cw, ch);

  // Multiple overlapping radial gradients that shift
  const clouds = [
    { cx: 0.3, cy: 0.4, r: 0.5, hue: 270, speed: 0.2 },
    { cx: 0.7, cy: 0.3, r: 0.4, hue: 200, speed: 0.15 },
    { cx: 0.5, cy: 0.7, r: 0.6, hue: 320, speed: 0.1 },
    { cx: 0.2, cy: 0.6, r: 0.35, hue: 240, speed: 0.25 },
    { cx: 0.8, cy: 0.5, r: 0.45, hue: 180, speed: 0.18 },
  ];

  for (const cloud of clouds) {
    const cx = (cloud.cx + Math.sin(t * cloud.speed) * 0.08) * cw;
    const cy = (cloud.cy + Math.cos(t * cloud.speed * 0.7) * 0.06) * ch;
    const r = cloud.r * Math.max(cw, ch);
    const hue = (cloud.hue + t * 5) % 360;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `hsla(${hue}, 60%, 40%, 0.2)`);
    grad.addColorStop(0.4, `hsla(${hue}, 50%, 30%, 0.1)`);
    grad.addColorStop(1, `hsla(${hue}, 50%, 20%, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);
  }

  // Stars
  const rng = seededRandom(99);
  for (let i = 0; i < 60; i++) {
    const x = rng() * cw;
    const y = rng() * ch;
    const size = 0.5 + rng() * 1.5;
    const twinkle = 0.3 + 0.7 * Math.sin(t * (1 + rng() * 2) + rng() * 10);
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${twinkle * 0.6})`;
    ctx.fill();
  }
}

function drawBgRain(ctx: CanvasRenderingContext2D, t: number, cw: number, ch: number, gradient: [string, string, string]) {
  // Dark moody base
  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, "#0a0a1a");
  grad.addColorStop(1, "#1a1a2e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);

  // Subtle city glow at bottom
  const glowGrad = ctx.createRadialGradient(cw * 0.5, ch, 0, cw * 0.5, ch, ch * 0.5);
  glowGrad.addColorStop(0, `${gradient[1]}33`);
  glowGrad.addColorStop(1, "transparent");
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, cw, ch);

  // Rain streaks
  const rng = seededRandom(77);
  ctx.strokeStyle = "rgba(180,200,255,0.15)";
  ctx.lineWidth = 1;

  for (let i = 0; i < 150; i++) {
    const baseX = rng() * cw;
    const speed = 400 + rng() * 600;
    const len = 20 + rng() * 40;
    const phase = rng() * ch;

    const y = (phase + t * speed) % (ch + len) - len;
    const x = baseX + Math.sin(t * 0.5 + i) * 3; // slight wind sway

    ctx.globalAlpha = 0.1 + rng() * 0.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 1, y + len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawAnimatedBackground(
  ctx: CanvasRenderingContext2D,
  style: BgStyle,
  time: number,
  cw: number,
  ch: number,
  gradient: [string, string, string],
  bgImage?: HTMLImageElement | null,
) {
  switch (style) {
    case "particles": return drawBgParticles(ctx, time, cw, ch, gradient);
    case "aurora":    return drawBgAurora(ctx, time, cw, ch, gradient);
    case "nebula":    return drawBgNebula(ctx, time, cw, ch, gradient);
    case "rain":      return drawBgRain(ctx, time, cw, ch, gradient);
    case "ai":
      if (bgImage) {
        const scale = Math.max(cw / bgImage.width, ch / bgImage.height);
        const w = bgImage.width * scale;
        const h = bgImage.height * scale;
        const zoom = 1 + 0.03 * Math.sin(time * 0.5);
        ctx.save();
        ctx.translate(cw / 2, ch / 2);
        ctx.scale(zoom, zoom);
        ctx.translate(-cw / 2, -ch / 2);
        ctx.drawImage(bgImage, (cw - w) / 2, (ch - h) / 2, w, h);
        ctx.restore();
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, cw, ch);
      } else {
        // Fallback gradient
        drawBgNebula(ctx, time, cw, ch, gradient);
      }
      return;
  }
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
      words.push({ word: w, start: line.start + wi * wordDur, lineIdx });
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
  bgStyle: BgStyle,
  bgImage?: HTMLImageElement | null,
) {
  const relTime = time - regionStart;

  // Background
  drawAnimatedBackground(ctx, bgStyle, relTime, cw, ch, gradient, bgImage);

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

  const lineHeight = fontSize * 1.6;
  const safeZoneHeight = ch * 0.6;
  const maxVisibleLines = Math.max(1, Math.floor(safeZoneHeight / lineHeight));
  const visibleLines = activeLineIdxs.slice(-maxVisibleLines);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const totalHeight = visibleLines.length * lineHeight;
  const startY = ch * 0.5 - totalHeight / 2 + lineHeight / 2;
  const maxTextWidth = cw * 0.85;

  visibleLines.forEach((lineIdx, vi) => {
    const lineWords = lineGroups.get(lineIdx) || [];
    ctx.font = `bold ${fontSize}px ${fontCss}`;

    // Word-wrap
    const wrappedRows: WordEntry[][] = [];
    let currentRow: WordEntry[] = [];
    let currentRowWidth = 0;

    lineWords.forEach((w) => {
      const wordWidth = ctx.measureText(w.word + " ").width;
      if (currentRow.length > 0 && currentRowWidth + wordWidth > maxTextWidth) {
        wrappedRows.push(currentRow);
        currentRow = [w];
        currentRowWidth = wordWidth;
      } else {
        currentRow.push(w);
        currentRowWidth += wordWidth;
      }
    });
    if (currentRow.length > 0) wrappedRows.push(currentRow);

    const rowHeight = fontSize * 1.3;
    const lineBlockHeight = wrappedRows.length * rowHeight;
    const lineBaseY = startY + vi * lineHeight;
    const lineStartY = lineBaseY - (lineBlockHeight - rowHeight) / 2;

    wrappedRows.forEach((rowWords, ri) => {
      const rowY = lineStartY + ri * rowHeight;
      if (rowY < fontSize || rowY > ch - fontSize) return;

      const rowText = rowWords.map(w => w.word).join(" ");
      const rowWidth = ctx.measureText(rowText).width;
      let x = (cw - rowWidth) / 2;

      rowWords.forEach((w) => {
        const wordAge = time - w.start;
        const bounce = bounceEase(wordAge / 0.25);
        const alpha = Math.min(1, Math.max(0, wordAge * 4));

        ctx.save();
        const wordWidth = ctx.measureText(w.word + " ").width;
        const wx = x + wordWidth / 2;

        ctx.translate(wx, rowY);
        ctx.scale(bounce, bounce);
        ctx.translate(-wx, -rowY);

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
        ctx.fillText(w.word, wx, rowY);

        ctx.restore();
        x += wordWidth;
      });
    });
  });

  ctx.globalAlpha = 1;
}

// ── Component ───────────────────────────────────────────────────────────────
export function LyricVideoComposer({ open, onOpenChange, lines, hook, metadata, title, artist, audioFile }: Props) {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const playStartRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [bgStyle, setBgStyle] = useState<BgStyle>("particles");
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
    drawFrame(ctx, time, regionStart, wordTimeline, gradient, cw, ch, fontCss, fontSize, title, artist, bgStyle, bgImage);
    ctx.restore();
  }, [regionStart, wordTimeline, gradient, cw, ch, fontCss, fontSize, title, artist, bgStyle, bgImage, previewScale]);

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

  // ── Generate AI background ────────────────────────────────────────────────
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

    // Set up audio source for mixing
    let audioCtx: AudioContext | null = null;
    let audioDest: MediaStreamAudioDestinationNode | null = null;
    let audioEl: HTMLAudioElement | null = null;

    if (audioFile) {
      try {
        audioCtx = new AudioContext();
        audioDest = audioCtx.createMediaStreamDestination();
        const audioUrl = URL.createObjectURL(audioFile);
        audioEl = new Audio(audioUrl);
        audioEl.crossOrigin = "anonymous";
        audioEl.currentTime = regionStart;

        await new Promise<void>((resolve) => {
          audioEl!.addEventListener("canplaythrough", () => resolve(), { once: true });
          audioEl!.load();
        });

        const sourceNode = audioCtx.createMediaElementSource(audioEl);
        sourceNode.connect(audioDest);

        const muteGain = audioCtx.createGain();
        muteGain.gain.value = 0;
        sourceNode.connect(muteGain);
        muteGain.connect(audioCtx.destination);
      } catch (e) {
        console.warn("Could not set up audio for recording:", e);
      }
    }

    const videoStream = canvas.captureStream(FPS);
    const combinedStream = new MediaStream();
    videoStream.getVideoTracks().forEach(t => combinedStream.addTrack(t));
    if (audioDest) {
      audioDest.stream.getAudioTracks().forEach(t => combinedStream.addTrack(t));
    }

    const mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: "video/webm;codecs=vp9,opus",
      videoBitsPerSecond: 8_000_000,
    });
    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const totalFrames = Math.ceil(duration * FPS);
    let frame = 0;

    if (audioEl) {
      try { await audioEl.play(); } catch (e) { console.warn("Audio play failed:", e); }
    }

    mediaRecorder.start();

    const renderNextFrame = () => {
      if (frame >= totalFrames) {
        mediaRecorder.stop();
        if (audioEl) { audioEl.pause(); audioEl.src = ""; }
        if (audioCtx) audioCtx.close();
        return;
      }
      const time = regionStart + (frame / FPS);
      drawFrame(ctx, time, regionStart, wordTimeline, gradient, cw, ch, fontCss, fontSize, title, artist, bgStyle, bgImage);
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
  }, [duration, regionStart, wordTimeline, gradient, cw, ch, fontCss, fontSize, title, artist, bgStyle, bgImage, audioFile]);

  // ── Wizard navigation ─────────────────────────────────────────────────────
  const canGoNext = () => {
    if (step === 1) return true;
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

        {/* ── Step 1: Background ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground block mb-2">
                Background Style
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {BG_STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setBgStyle(opt.key)}
                    className={`py-2 px-1 rounded-md text-center transition-colors ${
                      bgStyle === opt.key
                        ? "bg-foreground text-background"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="text-[12px] font-semibold tracking-[0.1em] uppercase block leading-tight">{opt.label}</span>
                    <span className="text-[9px] font-mono tracking-widest opacity-60 block mt-0.5 leading-tight">{opt.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* AI prompt — only when AI style selected */}
            {bgStyle === "ai" && (
              <div className="space-y-3">
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
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">{artist}</p>
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
              </div>
            )}

            {/* Song metadata — shown for non-AI styles */}
            {bgStyle !== "ai" && (
              <div className="border-t border-border/30 pt-3">
                <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">{artist}</p>
                <p className="text-sm font-medium mt-0.5">{title}</p>
              </div>
            )}

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
              {duration.toFixed(1)}s • {aspectRatio} • {fontFamily} {fontSize}px • {bgStyle}
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
                {duration.toFixed(1)}s • {aspectRatio} • {cw}×{ch} • {fontFamily} • {bgStyle}
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
