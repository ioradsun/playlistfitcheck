/**
 * useHookCanvas — Shared imperative canvas renderer for hook dance animations.
 * Extracted from ShareableHook so it can be reused in inline feed embeds.
 */

import { useRef, useCallback, useEffect } from "react";
import { mulberry32, hashSeed } from "@/engine/PhysicsIntegrator";
import { drawSystemBackground } from "@/engine/SystemBackgrounds";
import { getEffect } from "@/engine/EffectRegistry";
import { computeFitFontSize } from "@/engine/SystemStyles";
import { HookDanceEngine, type BeatTick } from "@/engine/HookDanceEngine";
import type { PhysicsState, PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { ArtistDNA } from "@/components/lyric/ArtistFingerprintTypes";

// ── Shared types ────────────────────────────────────────────────────────────

export interface HookData {
  id: string;
  user_id: string;
  artist_slug: string;
  song_slug: string;
  hook_slug: string;
  artist_name: string;
  song_name: string;
  hook_phrase: string;
  artist_dna: ArtistDNA | null;
  physics_spec: PhysicsSpec;
  beat_grid: { bpm: number; beats: number[]; confidence: number };
  hook_start: number;
  hook_end: number;
  lyrics: LyricLine[];
  audio_url: string;
  fire_count: number;
  vote_count: number;
  system_type: string;
  /** Override: use this system's font/typography instead of system_type's */
  font_system?: string;
  palette: string[];
  signature_line: string | null;
  battle_id: string | null;
  battle_position: number | null;
  hook_label: string | null;
}

export interface HookComment {
  id: string;
  text: string;
  submitted_at: string;
}

export interface ConstellationNode {
  id: string;
  text: string;
  submittedAt: number;
  seedX: number;
  seedY: number;
  x: number;
  y: number;
  driftSpeed: number;
  driftAngle: number;
  phase: "center" | "transitioning" | "river" | "constellation";
  phaseStartTime: number;
  riverRowIndex: number;
  currentSize: number;
  baseOpacity: number;
}

export const RIVER_ROWS = [
  { y: 0.12, speed: 0.2, opacity: 0.12, direction: -1 },
  { y: 0.20, speed: 0.3, opacity: 0.09, direction: 1 },
  { y: 0.80, speed: 0.4, opacity: 0.09, direction: -1 },
  { y: 0.88, speed: 0.55, opacity: 0.07, direction: 1 },
];

export const HOOK_COLUMNS =
  "id,user_id,artist_slug,song_slug,hook_slug,artist_name,song_name,hook_phrase,artist_dna,physics_spec,beat_grid,hook_start,hook_end,lyrics,audio_url,fire_count,vote_count,system_type,palette,signature_line,battle_id,battle_position,hook_label";

// ── Hook ────────────────────────────────────────────────────────────────────

export function useHookCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  containerRef: React.RefObject<HTMLDivElement>,
  hookData: HookData | null,
  constellationRef: React.MutableRefObject<ConstellationNode[]>,
  riverOffsetsRef: React.MutableRefObject<number[]>,
  active: boolean = true,
  onEnd?: () => void,
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const engineRef = useRef<HookDanceEngine | null>(null);
  const prngRef = useRef<(() => number) | null>(null);
  const activeRef = useRef(active);
  const progressRef = useRef(0);
  const onEndRef = useRef(onEnd);
  const firedEndRef = useRef(false);
  const frameRef = useRef<{ physState: PhysicsState | null; time: number; beats: number }>({
    physState: null, time: 0, beats: 0,
  });

  // Keep onEnd ref current
  onEndRef.current = onEnd;

  const drawCanvas = useCallback((physState: PhysicsState, ct: number, bc: number) => {
    const canvas = canvasRef.current;
    const hd = hookData;
    const rng = prngRef.current;
    if (!canvas || !hd || !rng) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const newW = Math.round(rect.width * dpr);
      const newH = Math.round(rect.height * dpr);
      if (canvas.width !== newW || canvas.height !== newH) {
        canvas.width = newW;
        canvas.height = newH;
      }
    }

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const palette = hd.palette || ["#ffffff", "#a855f7", "#ec4899"];

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawSystemBackground(ctx, {
      system: hd.system_type, physState,
      w, h, time: ct, beatCount: bc, rng, palette,
      hookStart: hd.hook_start, hookEnd: hd.hook_end,
    });

    // Comment rendering
    const nodes = constellationRef.current;
    const now = Date.now();
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    const lines = hd.lyrics as LyricLine[];
    const activeLine = lines.find(l => ct >= l.start && ct < l.end);
    const activeLineIndex = activeLine ? lines.indexOf(activeLine) : -1;
    const spec = hd.physics_spec as PhysicsSpec;
    let currentEffectKey = "STATIC_RESOLVE";
    if (activeLine && spec.effect_pool && spec.effect_pool.length > 0 && spec.logic_seed != null) {
      const isLastHookLine = activeLine.end >= hd.hook_end - 0.5;
      if (isLastHookLine) currentEffectKey = "HOOK_FRACTURE";
      else {
        const poolIdx = (spec.logic_seed + activeLineIndex * 7) % spec.effect_pool.length;
        currentEffectKey = spec.effect_pool[poolIdx];
      }
    }
    const isHookFracture = currentEffectKey === "HOOK_FRACTURE";

    // Pass 1: Constellation nodes
    for (const node of nodes) {
      if (node.phase !== "constellation") continue;
      node.x += Math.cos(node.driftAngle) * node.driftSpeed / w;
      node.y += Math.sin(node.driftAngle) * node.driftSpeed / h;
      if (node.x < -0.1) node.x = 1.1;
      if (node.x > 1.1) node.x = -0.1;
      if (node.y < -0.1) node.y = 1.1;
      if (node.y > 1.1) node.y = -0.1;

      ctx.font = "300 10px system-ui, -apple-system, sans-serif";
      ctx.globalAlpha = isHookFracture ? node.baseOpacity * 0.5 : node.baseOpacity;
      ctx.fillStyle = "#ffffff";
      const truncated = node.text.length > 40 ? node.text.slice(0, 40) + "…" : node.text;
      ctx.fillText(truncated, node.x * w, node.y * h);
    }

    // Pass 2: River rows
    if (!isHookFracture) {
      const riverNodes = nodes.filter(n => n.phase === "river");
      const offsets = riverOffsetsRef.current;
      for (let ri = 0; ri < RIVER_ROWS.length; ri++) {
        const row = RIVER_ROWS[ri];
        offsets[ri] += row.speed * row.direction;
        const rowComments = riverNodes.filter(n => n.riverRowIndex === ri);
        if (rowComments.length === 0) continue;

        ctx.font = "300 11px system-ui, -apple-system, sans-serif";
        ctx.globalAlpha = row.opacity;
        ctx.fillStyle = "#ffffff";

        const rowY = row.y * h;
        const textWidths = rowComments.map(n => {
          const t = n.text.length > 40 ? n.text.slice(0, 40) + "…" : n.text;
          return ctx.measureText(t).width;
        });
        const totalWidth = textWidths.reduce((a, tw) => a + tw + 120, 0);
        const wrapWidth = Math.max(totalWidth, w + 200);

        let xBase = offsets[ri];
        for (let ci = 0; ci < rowComments.length; ci++) {
          const truncated = rowComments[ci].text.length > 40 ? rowComments[ci].text.slice(0, 40) + "…" : rowComments[ci].text;
          let drawX = ((xBase % wrapWidth) + wrapWidth) % wrapWidth;
          if (drawX > w + 100) drawX -= wrapWidth;
          ctx.fillText(truncated, drawX, rowY);
          xBase += textWidths[ci] + 120;
        }
      }
    }

    // Pass 3: New submissions
    for (const node of nodes) {
      if (node.phase === "center") {
        const elapsed = now - node.phaseStartTime;
        ctx.font = "400 14px system-ui, -apple-system, sans-serif";
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        const truncated = node.text.length > 40 ? node.text.slice(0, 40) + "…" : node.text;
        ctx.fillText(truncated, w / 2, h / 2);
        ctx.textAlign = "start";
        if (elapsed >= 800) { node.phase = "transitioning"; node.phaseStartTime = now; }
      } else if (node.phase === "transitioning") {
        const elapsed = now - node.phaseStartTime;
        const t = Math.min(1, elapsed / 4000);
        const targetRow = RIVER_ROWS[node.riverRowIndex];
        const targetY = targetRow ? targetRow.y : node.seedY;
        const cx = 0.5, cy = 0.5;
        const curX = cx + (node.seedX - cx) * t * 0.3;
        const curY = cy + (targetY - cy) * t;
        const size = 14 - (14 - 11) * t;
        const targetOpacity = targetRow?.opacity || 0.09;
        const opacity = 0.45 - (0.45 - targetOpacity) * t;

        ctx.font = `300 ${Math.round(size)}px system-ui, -apple-system, sans-serif`;
        ctx.globalAlpha = opacity;
        ctx.fillStyle = "#ffffff";
        const truncated = node.text.length > 40 ? node.text.slice(0, 40) + "…" : node.text;
        ctx.fillText(truncated, curX * w, curY * h);
        node.x = curX; node.y = curY; node.currentSize = size;
        if (elapsed >= 4000) { node.phase = "river"; node.phaseStartTime = now; }
      }
    }
    ctx.globalAlpha = 1;

    // Lyrics — word-wrap into stacked lines when canvas is narrow
    if (activeLine) {
      const drawFn = getEffect(currentEffectKey);
      const age = (ct - activeLine.start) * 1000;
      const lineDur = activeLine.end - activeLine.start;
      const progress = Math.min(1, (ct - activeLine.start) / lineDur);

      // Narrow canvas threshold: split into multiple lines for readability
      const NARROW_THRESHOLD = 400;
      if (w < NARROW_THRESHOLD && activeLine.text.split(/\s+/).length > 2) {
        // Word-wrap: split into lines of roughly equal word count
        const words = activeLine.text.split(/\s+/);
        const lineCount = Math.min(3, Math.ceil(words.length / 2));
        const wordsPerLine = Math.ceil(words.length / lineCount);
        const wrappedLines: string[] = [];
        for (let li = 0; li < lineCount; li++) {
          wrappedLines.push(words.slice(li * wordsPerLine, (li + 1) * wordsPerLine).join(" "));
        }

        // Compute font size based on longest wrapped line
        const longest = wrappedLines.reduce((a, b) => a.length > b.length ? a : b, "");
        const { fs, effectiveLetterSpacing } = computeFitFontSize(ctx, longest, w, hd.font_system || hd.system_type);

        // Render each line at stacked y positions
        const lineH = fs * 1.15;
        const totalH = lineCount * lineH;
        const startY = (h - totalH) / 2 + fs * 0.5;

        for (let li = 0; li < wrappedLines.length; li++) {
          const lineY = startY + li * lineH;
          // Offset the virtual h so the effect draws at the correct y position
          const virtualH = lineY * 2; // centers effect at lineY
          drawFn(ctx, {
            text: wrappedLines[li], physState: physState, w, h: virtualH,
            fs, age, progress, rng, palette, system: hd.font_system || hd.system_type, effectiveLetterSpacing,
          });
        }
      } else {
        const fontSys = hd.font_system || hd.system_type;
        const { fs, effectiveLetterSpacing } = computeFitFontSize(ctx, activeLine.text, w, fontSys);
        drawFn(ctx, { text: activeLine.text, physState: physState, w, h, fs, age, progress, rng, palette, system: fontSys, effectiveLetterSpacing });
      }
    }

    // Progress — store for external HTML playbar
    const hookProgress = (ct - hd.hook_start) / (hd.hook_end - hd.hook_start);
    progressRef.current = Math.max(0, Math.min(1, hookProgress));

    // Fire onEnd once when hook reaches end (for auto-alternation)
    if (hookProgress >= 0.98 && !firedEndRef.current && onEndRef.current) {
      firedEndRef.current = true;
      // Defer to avoid calling setState during render frame
      setTimeout(() => onEndRef.current?.(), 0);
    }
    // Reset the flag when progress loops back
    if (hookProgress < 0.5) {
      firedEndRef.current = false;
    }

    ctx.restore();
  }, [hookData, canvasRef, containerRef, constellationRef, riverOffsetsRef]);

  // Setup audio + engine
  useEffect(() => {
    if (!hookData) return;
    const audio = new Audio();
    audio.muted = true;
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audio.loop = true;
    audioRef.current = audio;
    audio.src = hookData.audio_url;

    const spec = hookData.physics_spec as PhysicsSpec;
    const beats: BeatTick[] = hookData.beat_grid.beats.map((t: number, i: number) => ({
      time: t, isDownbeat: i % 4 === 0, strength: i % 4 === 0 ? 1 : 0.6,
    }));

    const lines = hookData.lyrics as LyricLine[];
    const lyricsStart = lines.length > 0 ? Math.min(hookData.hook_start, lines[0].start) : hookData.hook_start;
    const lyricsEnd = lines.length > 0 ? Math.min(hookData.hook_end, lines[lines.length - 1].end + 0.3) : hookData.hook_end;
    const effectiveStart = Math.max(hookData.hook_start, lyricsStart);
    const effectiveEnd = Math.max(effectiveStart + 1, lyricsEnd);

    const engine = new HookDanceEngine(
      { ...spec, system: hookData.system_type },
      beats, effectiveStart, effectiveEnd, audio,
      {
        onFrame: (state, time, bc) => {
          frameRef.current = { physState: state, time, beats: bc };
          drawCanvas(state, time, bc);
        },
        onEnd: () => {},
      },
      `${hookData.song_name}-${hookData.hook_start.toFixed(3)}`,
    );

    engineRef.current = engine;
    prngRef.current = engine.prng;
    activeRef.current = active;
    engine.start();

    return () => { engine.stop(); audio.pause(); };
  }, [hookData, drawCanvas]);

  // Track active prop — pause/resume engine
  useEffect(() => {
    activeRef.current = active;
    const engine = engineRef.current;
    if (!engine) return;
    if (!active) {
      engine.pause();
    } else {
      engine.resume();
    }
  }, [active]);

  // Restart from beginning — does NOT change mute state (caller controls that)
  const restart = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.stop();
    engine.start();
  }, []);

  return { audioRef, frameRef, progressRef, restart };
}
