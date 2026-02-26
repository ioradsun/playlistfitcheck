import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
// safeManifest removed — V3 derives state from cinematicDirection via presetDerivation
import type { LyricLine, LyricHook, LyricMetadata } from "./LyricDisplay";

interface FrameRenderState {
  world: string;
  backgroundSystem:
    | "fracture"
    | "pressure"
    | "breath"
    | "static"
    | "burn"
    | "void";
  lightSource: string;
  tension: number;
  palette: [string, string, string];
  coreEmotion: string;
}

function buildFrameRenderState(metadata?: LyricMetadata | null): FrameRenderState {
  const mood = metadata?.mood?.toLowerCase() || "brooding";
  const description = metadata?.description || "dark emotional space";

  const moodToSystem: Record<string, FrameRenderState["backgroundSystem"]> = {
    aggressive: "fracture",
    energetic: "pressure",
    melancholic: "breath",
    chill: "breath",
    dark: "void",
    haunted: "void",
    romantic: "breath",
    happy: "breath",
  };

  let backgroundSystem: FrameRenderState["backgroundSystem"] = "void";
  for (const [key, value] of Object.entries(moodToSystem)) {
    if (mood.includes(key)) {
      backgroundSystem = value;
      break;
    }
  }

  const lightBySystem: Record<FrameRenderState["backgroundSystem"], string> = {
    fracture: "harsh overhead",
    pressure: "fluorescent",
    breath: "golden hour",
    static: "fluorescent",
    burn: "flickering left",
    void: "moonlight",
  };

  const moodPalette = getMoodGradient(metadata?.mood);

  return {
    world: description,
    backgroundSystem,
    lightSource: lightBySystem[backgroundSystem],
    tension: 0.5,
    palette: moodPalette,
    coreEmotion: metadata?.mood || "brooding",
  };
}
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
  "1:1": [1080, 1080],
  "16:9": [1920, 1080],
};

const ASPECT_OPTIONS = [
  { key: "9:16", label: "9:16", sub: "TikTok / Reels" },
  { key: "1:1", label: "1:1", sub: "Instagram" },
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
  { key: "aurora", label: "Aurora", sub: "Flowing wave gradients" },
  { key: "nebula", label: "Nebula", sub: "Deep space clouds" },
  { key: "rain", label: "Rain", sub: "Falling streaks" },
  { key: "ai", label: "AI Generated", sub: "Custom from prompt" },
];

const FPS = 30;

// ── Gradient presets ────────────────────────────────────────────────────────
const MOOD_GRADIENTS: Record<string, [string, string, string]> = {
  happy: ["#FFD700", "#FF6B35", "#FF1493"],
  sad: ["#1a1a2e", "#16213e", "#0f3460"],
  energetic: ["#FF0000", "#FF4500", "#FF8C00"],
  chill: ["#0d1b2a", "#1b263b", "#415a77"],
  dark: ["#0a0a0a", "#1a1a2e", "#2d1b69"],
  romantic: ["#8B0000", "#C71585", "#FF69B4"],
  aggressive: ["#1a0000", "#4a0000", "#8B0000"],
  dreamy: ["#2E1065", "#7C3AED", "#C4B5FD"],
  default: ["#0f0f23", "#1a1a3e", "#2d2d5e"],
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

function drawBgParticles(
  ctx: CanvasRenderingContext2D,
  t: number,
  cw: number,
  ch: number,
  gradient: [string, string, string],
) {
  // Slowly rotating gradient base
  ctx.save();
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(Math.sin(t * 0.15) * 0.08);
  ctx.translate(-cw / 2, -ch / 2);
  const grad = ctx.createLinearGradient(0, 0, cw * Math.sin(t * 0.2), ch);
  grad.addColorStop(0, gradient[0]);
  grad.addColorStop(0.5, gradient[2]);
  grad.addColorStop(1, gradient[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(-cw * 0.1, -ch * 0.1, cw * 1.2, ch * 1.2);
  ctx.restore();

  const rng = seededRandom(42);
  const count = 160;
  for (let i = 0; i < count; i++) {
    const baseX = rng() * cw;
    const baseY = rng() * ch;
    const speed = 0.5 + rng() * 1.5;
    const size = 1 + rng() * 4;
    const phase = rng() * Math.PI * 2;
    const orbitRadius = 30 + rng() * 80;

    const x =
      (baseX +
        Math.sin(t * speed * 0.6 + phase) * orbitRadius +
        Math.cos(t * 0.3 + i) * 20) %
      cw;
    const y = (baseY + t * speed * 40 + Math.sin(t * 0.4 + phase) * 30) % ch;
    const alpha = 0.3 + 0.7 * Math.sin(t * speed * 1.5 + phase);

    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0.08, alpha)})`;
    ctx.fill();

    // Bright glow
    if (size > 1.5) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 8);
      glow.addColorStop(0, `rgba(255,255,255,${alpha * 0.25})`);
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - size * 8, y - size * 8, size * 16, size * 16);
    }
  }

  // Shooting stars
  for (let i = 0; i < 3; i++) {
    const cycle = (t * 0.3 + i * 1.7) % 4;
    if (cycle < 1) {
      const progress = cycle;
      const sx = cw * (0.2 + i * 0.3);
      const sy = ch * 0.1;
      const ex = sx + cw * 0.4;
      const ey = sy + ch * 0.3;
      const cx = sx + (ex - sx) * progress;
      const cy = sy + (ey - sy) * progress;
      const tailLen = 60;
      const tailGrad = ctx.createLinearGradient(
        cx - tailLen * 0.7,
        cy - tailLen * 0.3,
        cx,
        cy,
      );
      tailGrad.addColorStop(0, "rgba(255,255,255,0)");
      tailGrad.addColorStop(1, `rgba(255,255,255,${0.6 * (1 - progress)})`);
      ctx.strokeStyle = tailGrad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - tailLen * 0.7, cy - tailLen * 0.3);
      ctx.lineTo(cx, cy);
      ctx.stroke();
    }
  }
}

function drawBgAurora(
  ctx: CanvasRenderingContext2D,
  t: number,
  cw: number,
  ch: number,
  gradient: [string, string, string],
) {
  ctx.fillStyle = "#030308";
  ctx.fillRect(0, 0, cw, ch);

  // Multiple flowing aurora bands with heavy wave motion
  for (let band = 0; band < 6; band++) {
    const bandY = ch * (0.15 + band * 0.12);
    const hue = (band * 50 + t * 30) % 360;
    ctx.beginPath();
    ctx.moveTo(0, bandY);

    for (let x = 0; x <= cw; x += 3) {
      const wave1 = Math.sin(x * 0.004 + t * 1.2 + band * 0.8) * ch * 0.12;
      const wave2 = Math.sin(x * 0.009 + t * 0.8 + band * 1.5) * ch * 0.06;
      const wave3 = Math.sin(x * 0.002 + t * 1.8) * ch * 0.09;
      const wave4 = Math.cos(x * 0.006 + t * 0.5 + band) * ch * 0.04;
      ctx.lineTo(x, bandY + wave1 + wave2 + wave3 + wave4);
    }

    ctx.lineTo(cw, ch);
    ctx.lineTo(0, ch);
    ctx.closePath();

    const bandGrad = ctx.createLinearGradient(
      0,
      bandY - ch * 0.15,
      0,
      bandY + ch * 0.35,
    );
    bandGrad.addColorStop(0, `hsla(${hue}, 85%, 55%, 0)`);
    bandGrad.addColorStop(0.2, `hsla(${hue}, 85%, 55%, 0.2)`);
    bandGrad.addColorStop(0.5, `hsla(${hue}, 75%, 60%, 0.12)`);
    bandGrad.addColorStop(1, `hsla(${hue}, 85%, 55%, 0)`);
    ctx.fillStyle = bandGrad;
    ctx.fill();
  }

  // Pulsing bright spots
  for (let i = 0; i < 5; i++) {
    const px = cw * (0.15 + i * 0.18);
    const py = ch * (0.3 + Math.sin(t * 0.8 + i * 2) * 0.15);
    const pr = ch * 0.08 * (0.5 + 0.5 * Math.sin(t * 1.5 + i));
    const hue2 = (i * 70 + t * 25) % 360;
    const spotGrad = ctx.createRadialGradient(px, py, 0, px, py, pr);
    spotGrad.addColorStop(0, `hsla(${hue2}, 80%, 70%, 0.15)`);
    spotGrad.addColorStop(1, `hsla(${hue2}, 80%, 50%, 0)`);
    ctx.fillStyle = spotGrad;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }
}

function drawBgNebula(
  ctx: CanvasRenderingContext2D,
  t: number,
  cw: number,
  ch: number,
  gradient: [string, string, string],
) {
  ctx.fillStyle = gradient[0];
  ctx.fillRect(0, 0, cw, ch);

  // Orbiting, pulsing cloud masses
  const clouds = [
    { cx: 0.3, cy: 0.4, r: 0.55, hue: 270, speed: 0.5, orbit: 0.12 },
    { cx: 0.7, cy: 0.3, r: 0.45, hue: 200, speed: 0.4, orbit: 0.1 },
    { cx: 0.5, cy: 0.7, r: 0.65, hue: 320, speed: 0.3, orbit: 0.15 },
    { cx: 0.2, cy: 0.6, r: 0.4, hue: 240, speed: 0.6, orbit: 0.08 },
    { cx: 0.8, cy: 0.5, r: 0.5, hue: 180, speed: 0.45, orbit: 0.11 },
    { cx: 0.4, cy: 0.2, r: 0.35, hue: 300, speed: 0.55, orbit: 0.09 },
    { cx: 0.6, cy: 0.8, r: 0.4, hue: 160, speed: 0.35, orbit: 0.13 },
  ];

  for (const cloud of clouds) {
    const cx =
      (cloud.cx +
        Math.sin(t * cloud.speed) * cloud.orbit +
        Math.cos(t * cloud.speed * 0.6) * cloud.orbit * 0.5) *
      cw;
    const cy =
      (cloud.cy +
        Math.cos(t * cloud.speed * 0.7) * cloud.orbit +
        Math.sin(t * cloud.speed * 0.4) * cloud.orbit * 0.3) *
      ch;
    const pulse = 1 + 0.2 * Math.sin(t * cloud.speed * 2);
    const r = cloud.r * Math.max(cw, ch) * pulse;
    const hue = (cloud.hue + t * 12) % 360;

    const cloudGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    cloudGrad.addColorStop(0, `hsla(${hue}, 70%, 45%, 0.25)`);
    cloudGrad.addColorStop(0.3, `hsla(${hue}, 60%, 35%, 0.15)`);
    cloudGrad.addColorStop(0.6, `hsla(${hue}, 50%, 25%, 0.05)`);
    cloudGrad.addColorStop(1, `hsla(${hue}, 50%, 20%, 0)`);
    ctx.fillStyle = cloudGrad;
    ctx.fillRect(0, 0, cw, ch);
  }

  // Twinkling stars with drift
  const rng = seededRandom(99);
  for (let i = 0; i < 120; i++) {
    const baseX = rng() * cw;
    const baseY = rng() * ch;
    const drift = rng() * 0.3;
    const x = (baseX + Math.sin(t * drift + i) * 8) % cw;
    const y = (baseY + Math.cos(t * drift * 0.7 + i) * 6) % ch;
    const size = 0.5 + rng() * 2;
    const twinkle = 0.2 + 0.8 * Math.sin(t * (1.5 + rng() * 3) + rng() * 10);
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${twinkle * 0.7})`;
    ctx.fill();

    // Cross sparkle for larger stars
    if (size > 1.5 && twinkle > 0.7) {
      ctx.strokeStyle = `rgba(255,255,255,${twinkle * 0.3})`;
      ctx.lineWidth = 0.5;
      const sLen = size * 4;
      ctx.beginPath();
      ctx.moveTo(x - sLen, y);
      ctx.lineTo(x + sLen, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - sLen);
      ctx.lineTo(x, y + sLen);
      ctx.stroke();
    }
  }
}

function drawBgRain(
  ctx: CanvasRenderingContext2D,
  t: number,
  cw: number,
  ch: number,
  gradient: [string, string, string],
) {
  // Dark moody base with pulsing glow
  const baseGrad = ctx.createLinearGradient(0, 0, 0, ch);
  baseGrad.addColorStop(0, "#080818");
  baseGrad.addColorStop(0.6, "#0d0d28");
  baseGrad.addColorStop(1, "#1a1a30");
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, cw, ch);

  // Animated city glow at bottom — shifting
  for (let i = 0; i < 3; i++) {
    const gx = cw * (0.2 + i * 0.3 + Math.sin(t * 0.3 + i) * 0.1);
    const pulse = 0.7 + 0.3 * Math.sin(t * 0.8 + i * 2);
    const glowGrad = ctx.createRadialGradient(
      gx,
      ch,
      0,
      gx,
      ch,
      ch * 0.45 * pulse,
    );
    glowGrad.addColorStop(0, `${gradient[1]}44`);
    glowGrad.addColorStop(0.5, `${gradient[2]}22`);
    glowGrad.addColorStop(1, "transparent");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, cw, ch);
  }

  // Lightning flash
  const lightningCycle = (t * 0.4) % 6;
  if (lightningCycle < 0.08) {
    ctx.fillStyle = `rgba(200,210,255,${0.15 * (1 - lightningCycle / 0.08)})`;
    ctx.fillRect(0, 0, cw, ch);
  }

  // Heavy rain streaks
  const rng = seededRandom(77);
  ctx.lineWidth = 1.5;

  for (let i = 0; i < 300; i++) {
    const baseX = rng() * cw;
    const speed = 600 + rng() * 900;
    const len = 30 + rng() * 60;
    const phase = rng() * ch;
    const windSway = Math.sin(t * 0.4 + i * 0.1) * 8 + Math.sin(t * 1.2) * 4;

    const y = ((phase + t * speed) % (ch + len)) - len;
    const x = baseX + windSway;

    const rainAlpha = 0.08 + rng() * 0.25;
    ctx.strokeStyle = `rgba(160,190,255,${rainAlpha})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 2 + windSway * 0.1, y + len);
    ctx.stroke();
  }

  // Splashes at bottom
  for (let i = 0; i < 20; i++) {
    const sx = (seededRandom(i + 200)() * cw + t * 50 * ((i % 3) + 1)) % cw;
    const cycle = (t * 2 + i * 0.5) % 1;
    if (cycle < 0.3) {
      const progress = cycle / 0.3;
      const splashY = ch - ch * 0.05;
      const splashR = 3 + progress * 8;
      ctx.beginPath();
      ctx.arc(sx, splashY, splashR, Math.PI, 0);
      ctx.strokeStyle = `rgba(160,190,255,${0.2 * (1 - progress)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
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
    case "particles":
      return drawBgParticles(ctx, time, cw, ch, gradient);
    case "aurora":
      return drawBgAurora(ctx, time, cw, ch, gradient);
    case "nebula":
      return drawBgNebula(ctx, time, cw, ch, gradient);
    case "rain":
      return drawBgRain(ctx, time, cw, ch, gradient);
    case "ai":
      if (bgImage) {
        const scale = Math.max(cw / bgImage.width, ch / bgImage.height);
        const w = bgImage.width * scale;
        const h = bgImage.height * scale;
        // Ken Burns: slow pan + zoom
        const zoom = 1.05 + 0.06 * Math.sin(time * 0.4);
        const panX = Math.sin(time * 0.25) * cw * 0.03;
        const panY = Math.cos(time * 0.18) * ch * 0.03;
        ctx.save();
        ctx.translate(cw / 2 + panX, ch / 2 + panY);
        ctx.scale(zoom, zoom);
        ctx.translate(-cw / 2, -ch / 2);
        ctx.drawImage(bgImage, (cw - w) / 2, (ch - h) / 2, w, h);
        ctx.restore();
        // Animated vignette
        const vignetteAlpha = 0.35 + 0.1 * Math.sin(time * 0.6);
        ctx.fillStyle = `rgba(0,0,0,${vignetteAlpha})`;
        ctx.fillRect(0, 0, cw, ch);
        // Edge vignette
        const vig = ctx.createRadialGradient(
          cw / 2,
          ch / 2,
          Math.min(cw, ch) * 0.3,
          cw / 2,
          ch / 2,
          Math.max(cw, ch) * 0.7,
        );
        vig.addColorStop(0, "rgba(0,0,0,0)");
        vig.addColorStop(1, "rgba(0,0,0,0.5)");
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, cw, ch);
      } else {
        drawBgNebula(ctx, time, cw, ch, gradient);
      }
      return;
  }
}

// ── Word animation helpers ──────────────────────────────────────────────────
interface WordEntry {
  word: string;
  start: number;
  lineIdx: number;
}

function buildWordTimeline(
  lines: LyricLine[],
  regionStart: number,
  regionEnd: number,
): WordEntry[] {
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
  if (t < 0.8) return 1 + 0.3 * Math.sin(((t - 0.5) * Math.PI) / 0.3);
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

  // ── Safe Zone (90% inset to avoid TikTok/Reels UI overlays) ───────────────
  const safeInsetX = cw * 0.05;
  const safeInsetY = ch * 0.05;
  const safeW = cw - safeInsetX * 2;
  const safeH = ch - safeInsetY * 2;

  // ── Artist / Title metadata (inside safe zone) ─────────────────────────────
  const metaSize = Math.round(cw * 0.02);
  ctx.font = `500 ${metaSize}px "Geist Mono", monospace`;
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 4;

  ctx.textAlign = "left";
  ctx.letterSpacing = "0.15em";
  ctx.fillText(artistText.toUpperCase(), safeInsetX, safeInsetY);
  ctx.textAlign = "right";
  ctx.fillText(titleText.toUpperCase(), cw - safeInsetX, safeInsetY);

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
    const lineStart = Math.min(...lineWords.map((w) => w.start));
    const lineEnd = Math.max(...lineWords.map((w) => w.start)) + 0.6;
    if (time >= lineStart - 0.15 && time <= lineEnd + 1.0) {
      activeLineIdxs.push(lineIdx);
    }
  }
  activeLineIdxs.sort((a, b) => a - b);

  // ── Dynamic font scaling: min(baseSize, safeWidth / maxCharCount * K) ─────
  let maxCharCount = 1;
  for (const lineIdx of activeLineIdxs) {
    const lineWords = lineGroups.get(lineIdx) || [];
    const charCount =
      lineWords.reduce((s, w) => s + w.word.length, 0) + lineWords.length - 1;
    if (charCount > maxCharCount) maxCharCount = charCount;
  }
  const dynamicFs = Math.min(fontSize, (safeW / maxCharCount) * 1.6);
  const fs = Math.max(Math.round(dynamicFs), 12);

  const rowHeight = fs * 1.4;
  const maxTextWidth = safeW;
  const safeZoneHeight = safeH * 0.65;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${fs}px ${fontCss}`;

  // Pre-compute wrapped rows for each active line
  const lineWraps: { lineIdx: number; rows: WordEntry[][] }[] = [];
  for (const lineIdx of activeLineIdxs) {
    const lineWords = lineGroups.get(lineIdx) || [];
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
    lineWraps.push({ lineIdx, rows: wrappedRows });
  }

  // Trim from the top until total height fits the safe zone
  let totalRows = lineWraps.reduce((s, lw) => s + lw.rows.length, 0);
  let visibleWraps = [...lineWraps];
  while (visibleWraps.length > 1 && totalRows * rowHeight > safeZoneHeight) {
    totalRows -= visibleWraps[0].rows.length;
    visibleWraps.shift();
  }

  // Add spacing between lines
  const lineGap = fs * 0.5;
  const totalHeight =
    visibleWraps.reduce((s, lw) => s + lw.rows.length * rowHeight, 0) +
    (visibleWraps.length - 1) * lineGap;
  let curY = ch * 0.5 - totalHeight / 2 + rowHeight / 2;

  visibleWraps.forEach((lw, li) => {
    ctx.font = `bold ${fs}px ${fontCss}`;

    lw.rows.forEach((rowWords, ri) => {
      const rowY = curY;
      curY += rowHeight;
      if (rowY < safeInsetY || rowY > ch - safeInsetY) return;

      const rowText = rowWords.map((w) => w.word).join(" ");
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
        ctx.font = `bold ${fs}px ${fontCss}`;
        ctx.fillText(w.word, wx, rowY);

        ctx.restore();
        x += wordWidth;
      });
    });
    if (li < visibleWraps.length - 1) curY += lineGap;
  });

  ctx.globalAlpha = 1;
}

// ── Component ───────────────────────────────────────────────────────────────
export function LyricVideoComposer({
  open,
  onOpenChange,
  lines,
  hook,
  metadata,
  title,
  artist,
  audioFile,
}: Props) {
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
  const fontCss =
    FONT_OPTIONS.find((f) => f.key === fontFamily)?.css ?? FONT_OPTIONS[0].css;

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
  const drawPreview = useCallback(
    (time: number) => {
      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.scale(previewScale, previewScale);
      drawFrame(
        ctx,
        time,
        regionStart,
        wordTimeline,
        gradient,
        cw,
        ch,
        fontCss,
        fontSize,
        title,
        artist,
        bgStyle,
        bgImage,
      );
      ctx.restore();
    },
    [
      regionStart,
      wordTimeline,
      gradient,
      cw,
      ch,
      fontCss,
      fontSize,
      title,
      artist,
      bgStyle,
      bgImage,
      previewScale,
    ],
  );

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
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, open, step, drawPreview, duration, regionStart]);

  // Draw initial frame on step 3
  useEffect(() => {
    if (open && step === 3 && !isPlaying) {
      drawPreview(regionStart);
    }
  }, [open, step, isPlaying, drawPreview, regionStart]);

  // lyric-video-bg removed — V3 uses section images from cinematic direction

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
          audioEl!.addEventListener("canplaythrough", () => resolve(), {
            once: true,
          });
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

    const videoStream = canvas.captureStream(0); // 0 = manual frame capture
    const combinedStream = new MediaStream();
    videoStream.getVideoTracks().forEach((t) => combinedStream.addTrack(t));
    if (audioDest) {
      audioDest.stream
        .getAudioTracks()
        .forEach((t) => combinedStream.addTrack(t));
    }

    const mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: "video/webm;codecs=vp9,opus",
      videoBitsPerSecond: 8_000_000,
    });
    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const totalFrames = Math.ceil(duration * FPS);
    let frame = 0;

    if (audioEl) {
      try {
        await audioEl.play();
      } catch (e) {
        console.warn("Audio play failed:", e);
      }
    }

    mediaRecorder.start();

    const videoTrack = videoStream.getVideoTracks()[0] as any;

    const renderNextFrame = () => {
      if (frame >= totalFrames) {
        mediaRecorder.stop();
        if (audioEl) {
          audioEl.pause();
          audioEl.src = "";
        }
        if (audioCtx) audioCtx.close();
        return;
      }
      const time = regionStart + frame / FPS;
      drawFrame(
        ctx,
        time,
        regionStart,
        wordTimeline,
        gradient,
        cw,
        ch,
        fontCss,
        fontSize,
        title,
        artist,
        bgStyle,
        bgImage,
      );
      // Manually request a frame capture so the recorder gets this exact frame
      if (videoTrack && typeof videoTrack.requestFrame === "function") {
        videoTrack.requestFrame();
      }
      frame++;
      setRecordingProgress(frame / totalFrames);
      requestAnimationFrame(renderNextFrame);
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
  }, [
    duration,
    regionStart,
    wordTimeline,
    gradient,
    cw,
    ch,
    fontCss,
    fontSize,
    title,
    artist,
    bgStyle,
    bgImage,
    audioFile,
  ]);

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
                    <span className="text-[12px] font-semibold tracking-[0.1em] uppercase block leading-tight">
                      {opt.label}
                    </span>
                    <span className="text-[9px] font-mono tracking-widest opacity-60 block mt-0.5 leading-tight">
                      {opt.sub}
                    </span>
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
                    placeholder={
                      metadata?.mood
                        ? `e.g. ${metadata.mood} atmosphere, abstract shapes, deep colors`
                        : "neon rain on dark streets, cinematic haze"
                    }
                    className="min-h-[80px] text-sm resize-none"
                    rows={3}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                      {artist}
                    </p>
                    <p className="text-sm font-medium mt-0.5">{title}</p>
                  </div>
                  {/* AI background generation removed — V3 uses section images */}
                </div>
              </div>
            )}

            {/* Song metadata — shown for non-AI styles */}
            {bgStyle !== "ai" && (
              <div className="border-t border-border/30 pt-3">
                <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                  {artist}
                </p>
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
                    <span className="text-[13px] font-semibold tracking-[0.15em] uppercase block">
                      {opt.label}
                    </span>
                    <span className="text-[10px] font-mono tracking-widest opacity-60 block mt-0.5">
                      {opt.sub}
                    </span>
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
                    {regionStart.toFixed(1)}s – {regionEnd.toFixed(1)}s (
                    {duration.toFixed(1)}s)
                  </span>
                  <button
                    onClick={() => {
                      setRegionStart(0);
                      setRegionEnd(songEnd);
                    }}
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
                <span className="text-[10px] font-mono text-muted-foreground">
                  {fontSize}px
                </span>
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
              <Button
                variant="ghost"
                size="sm"
                onClick={prevStep}
                className="text-[13px] font-semibold tracking-[0.15em] uppercase"
              >
                Back
              </Button>
              <Button
                size="sm"
                onClick={nextStep}
                disabled={!canGoNext()}
                className="text-[13px] font-semibold tracking-[0.15em] uppercase"
              >
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
              • {bgStyle}
            </div>

            <div className="flex justify-between pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsPlaying(false);
                  prevStep();
                }}
                className="text-[13px] font-semibold tracking-[0.15em] uppercase"
              >
                Back
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setIsPlaying(false);
                  nextStep();
                }}
                className="text-[13px] font-semibold tracking-[0.15em] uppercase"
              >
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
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                {artist}
              </p>
              <p className="text-[10px] font-mono text-muted-foreground mt-2">
                {duration.toFixed(1)}s • {aspectRatio} • {cw}×{ch} •{" "}
                {fontFamily} • {bgStyle}
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsRecording(false);
                  prevStep();
                }}
                disabled={isRecording}
                className="text-[13px] font-semibold tracking-[0.15em] uppercase"
              >
                Back
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
