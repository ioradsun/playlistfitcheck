/**
 * useHookCanvas — Shared imperative canvas renderer for hook dance animations.
 * Extracted from ShareableHook so it can be reused in inline feed embeds.
 */

import { useRef, useCallback, useEffect } from "react";
import { mulberry32, hashSeed } from "@/engine/PhysicsIntegrator";
import { drawSystemBackground } from "@/engine/SystemBackgrounds";
import { computeFitFontSize, computeStackedLayout, ensureTypographyProfileReady, getSystemStyle } from "@/engine/SystemStyles";
import { HookDanceEngine, type BeatTick } from "@/engine/HookDanceEngine";
import type { PhysicsState, PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { SceneManifest } from "@/engine/SceneManifest";
import { animationResolver, type WordAnimation } from "@/engine/AnimationResolver";
import { applyEntrance, applyExit, applyModEffect, applyWordMark, getWordMarkColor } from "@/engine/LyricAnimations";
import { deriveCanvasManifest, logManifestDiagnostics } from "@/engine/deriveCanvasManifest";
import { resolveEffectKey } from "@/engine/EffectRegistry";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { ArtistDNA } from "@/components/lyric/ArtistFingerprintTypes";
import { useBeatIntensity } from "@/hooks/useBeatIntensity";


function applyLyricShadow(
  ctx: CanvasRenderingContext2D,
  palette: [string, string, string],
  typographyPersonality?: string,
): void {
  const isHeavy =
    typographyPersonality === "MONUMENTAL" ||
    typographyPersonality === "SHATTERED DISPLAY";
  const shadowBase = (palette?.[0] ?? "#000000").replace(/\s+/g, "");
  const shadowColor = /^#[0-9a-fA-F]{6}$/.test(shadowBase)
    ? `${shadowBase}cc`
    : "rgba(0,0,0,0.8)";

  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = isHeavy ? 14 : 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = isHeavy ? 3 : 2;
}

function clearLyricShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

// Animation helpers (applyEntrance, applyExit, applyModEffect, applyWordMark, getWordMarkColor)
// are now in src/engine/LyricAnimations.ts



type AudioElementWithAnalyser = HTMLAudioElement & {
  __analyserNode?: AnalyserNode;
  __audioContext?: AudioContext;
  __mediaElementSource?: MediaElementAudioSourceNode;
};

export const HOOK_CANVAS_COMPOSITING_HINTS = {
  maskUsesPaletteShadow: true,
  kenBurnsFollowsLightSource: true,
  beatAffectsBloomOnly: true,
} as const;

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
  hottest_hooks?: Array<{ start_sec?: number; start?: number; duration_sec?: number; duration?: number }>;
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
  analyserNode?: AnalyserNode | null,
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const engineRef = useRef<HookDanceEngine | null>(null);
  const prngRef = useRef<(() => number) | null>(null);
  const activeRef = useRef(active);
  const progressRef = useRef(0);
  const onEndRef = useRef(onEnd);
  const firedEndRef = useRef(false);
  const orbitalWordPositionsRef = useRef<Record<string, Array<{ x: number; y: number }>>>({});
  const frameRef = useRef<{ physState: PhysicsState | null; time: number; beats: number }>({
    physState: null, time: 0, beats: 0,
  });
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const beatIntensity = useBeatIntensity(analyserNode ?? localAnalyserRef.current, active);
  const beatIntensityRef = useRef(beatIntensity);
  beatIntensityRef.current = beatIntensity;

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
    const safePad = Math.max(16, Math.min(w, h) * 0.06);
    const safeW = Math.max(1, w - safePad * 2);
    const safeH = Math.max(1, h - safePad * 2);
    const palette = hd.palette || ["#ffffff", "#a855f7", "#ec4899"];
    const { manifest, textColor, contrastRatio, textPalette } = deriveCanvasManifest({
      physicsSpec: hd.physics_spec as PhysicsSpec,
      fallbackPalette: palette,
      systemType: hd.system_type,
    });

    // Keep physics motion budgets tied to real lyric container dimensions.
    engineRef.current?.setViewportBounds(w, h);

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
        currentEffectKey = resolveEffectKey(spec.effect_pool[poolIdx]);
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
      ctx.fillStyle = textColor;
      const truncated = node.text.length > 40 ? node.text.slice(0, 40) + "…" : node.text;
      applyLyricShadow(ctx, [palette[0], palette[1], palette[2]], spec.typographyProfile?.personality);
      ctx.fillText(truncated, node.x * w, node.y * h);
      clearLyricShadow(ctx);
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
        ctx.fillStyle = textColor;

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
          applyLyricShadow(ctx, [palette[0], palette[1], palette[2]], spec.typographyProfile?.personality);
          ctx.fillText(truncated, drawX, rowY);
          clearLyricShadow(ctx);
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
        ctx.fillStyle = textColor;
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
        ctx.fillStyle = textColor;
        const truncated = node.text.length > 40 ? node.text.slice(0, 40) + "…" : node.text;
        ctx.fillText(truncated, curX * w, curY * h);
        node.x = curX; node.y = curY; node.currentSize = size;
        if (elapsed >= 4000) { node.phase = "river"; node.phaseStartTime = now; }
      }
    }
    ctx.globalAlpha = 1;

    // Lyrics — word-wrap into stacked lines when canvas is narrow
    if (activeLine) {
      const fontSys = hd.font_system || hd.system_type;
      const stackedLayout = computeStackedLayout(ctx, activeLine.text, w, h, fontSys, w < h ? "9:16" : undefined);
      const baseFit = computeFitFontSize(ctx, activeLine.text, safeW, fontSys);
      const baseFs = stackedLayout.isStacked ? stackedLayout.fs : baseFit.fs;
      const st = getSystemStyle(fontSys);
      const lineCount = stackedLayout.isStacked ? stackedLayout.lines.length : 1;
      const sampleText = stackedLayout.isStacked ? stackedLayout.lines.reduce((a, b) => (a.length > b.length ? a : b), "") : activeLine.text;
      ctx.font = `${st.weight} ${baseFs}px ${st.font}`;
      const measuredW = ctx.measureText(sampleText).width;
      const measuredH = baseFs * st.lineHeight * lineCount;

      const layoutResult = engineRef.current?.validateLayout({
        textWidth: measuredW,
        textHeight: measuredH,
        safeWidth: safeW,
        safeHeight: safeH,
        fontSize: baseFs,
        lineHeight: st.lineHeight,
      });

      const fs = layoutResult?.fontSize ?? baseFs;

      // Use shared manifest derived at the top of drawCanvas
      // (manifest variable is already available from deriveCanvasManifest)

      // AnimationResolver is a singleton — always available after loadFromDna()
      const anim = animationResolver.resolveLine(
        activeLine.start,
        activeLine.start,
        activeLine.end,
        ct,
        beatIntensityRef.current,
        manifest.palette,
      );
      // 1Hz diagnostic log
      logManifestDiagnostics("HookDance", {
        palette: manifest.palette as string[],
        fontFamily: manifest.typographyProfile?.fontFamily ?? "—",
        particleSystem: manifest.particleConfig?.system ?? "none",
        beatIntensity: beatIntensityRef.current,
        activeMod: anim.activeMod,
        entryProgress: anim.entryProgress,
        exitProgress: anim.exitProgress,
        textColor,
        contrastRatio,
        effectKey: currentEffectKey,
      });

      ctx.save();
      const lineX = w / 2;
      const lineY = h / 2;
      ctx.translate(lineX, lineY);
      ctx.scale(anim.scale, anim.scale);
      ctx.translate(-lineX, -lineY);
      let workingFontSize = fs;
      const words = activeLine.text.split(/\s+/).filter(Boolean);
      const wordSpacingRatio = 0.25;
      const maxTextWidth = w * 0.85;
      const measureLineWidth = (fontSize: number) => {
        ctx.font = `${st.weight} ${fontSize}px ${st.font}`;
        const widths = words.map((word) => ctx.measureText(word).width);
        const spacing = fontSize * wordSpacingRatio;
        const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * spacing;
        return { widths, spacing, total };
      };

      let measuredLayout = measureLineWidth(workingFontSize);
      while (measuredLayout.total > maxTextWidth && workingFontSize > 12) {
        workingFontSize -= 1;
        measuredLayout = measureLineWidth(workingFontSize);
      }

      ctx.font = `${st.weight} ${workingFontSize}px ${st.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const entryAlpha = applyEntrance(ctx, anim.entryProgress, manifest.lyricEntrance);
      const exitAlpha = anim.exitProgress > 0 ? applyExit(ctx, anim.exitProgress, manifest.lyricExit) : 1;
      ctx.globalAlpha = Math.min(entryAlpha, exitAlpha);

      if (anim.activeMod) {
        applyModEffect(ctx, anim.activeMod, ct, beatIntensityRef.current);
      }

      applyLyricShadow(ctx, manifest.palette, manifest.typographyProfile?.personality);
      const isOrbitalLayout = (hd.font_system || hd.system_type) === "orbit";
      const wordPadding = 24;
      const orbitRadius = Math.min(w, h) * 0.2;
      const lineDuration = Math.max(0.001, activeLine.end - activeLine.start);
      const activeWordIndex = Math.max(0, Math.min(words.length - 1, Math.floor(((ct - activeLine.start) / lineDuration) * words.length)));

      const positions: Array<{ x: number; y: number }> = [];
      if (isOrbitalLayout) {
        let angleAccumulator = -Math.PI / 2;
        measuredLayout.widths.forEach((width) => {
          const angleForWord = (width + wordPadding) / Math.max(1, orbitRadius);
          positions.push({
            x: lineX + Math.cos(angleAccumulator) * orbitRadius,
            y: lineY + Math.sin(angleAccumulator) * orbitRadius,
          });
          angleAccumulator += angleForWord;
        });

        for (let i = 0; i < positions.length - 1; i += 1) {
          const minDist = (measuredLayout.widths[i] + measuredLayout.widths[i + 1]) / 2 + wordPadding;
          const actualDist = Math.abs(positions[i + 1].x - positions[i].x);
          if (actualDist < minDist) {
            const push = (minDist - actualDist) / 2;
            positions[i].x -= push;
            positions[i + 1].x += push;
          }
        }

        if (positions[activeWordIndex]) {
          const activeTarget = positions[activeWordIndex];
          const shiftX = lineX - activeTarget.x;
          const shiftY = lineY - activeTarget.y;
          for (let i = 0; i < positions.length; i += 1) {
            positions[i].x += shiftX;
            positions[i].y += shiftY;
          }
        }

        const lineKey = `${activeLine.start}:${activeLine.end}:${activeLine.text}`;
        const previousPositions = orbitalWordPositionsRef.current[lineKey] ?? positions;
        const smoothed = positions.map((target, idx) => {
          const current = previousPositions[idx] ?? target;
          return {
            x: current.x + (target.x - current.x) * 0.08,
            y: current.y + (target.y - current.y) * 0.08,
          };
        });
        orbitalWordPositionsRef.current = { [lineKey]: smoothed };
      } else {
        let currentX = lineX - measuredLayout.total / 2;
        measuredLayout.widths.forEach((width) => {
          positions.push({ x: currentX + width / 2, y: lineY });
          currentX += width + measuredLayout.spacing;
        });
      }

      words.forEach((word, wi) => {
        const wordAnim = animationResolver.resolveWord(activeLine.start, wi, beatIntensityRef.current);
        ctx.save();
        if (wordAnim) {
          applyWordMark(ctx, wordAnim, ct, manifest);
        }
        ctx.fillStyle = wordAnim
          ? getWordMarkColor(wordAnim.mark, manifest)
          : anim.lineColor;
        const p = positions[wi] ?? { x: lineX, y: lineY };
        ctx.fillText(word, p.x, p.y);
        ctx.restore();
      });
      clearLyricShadow(ctx);
      ctx.restore();

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

    const audio = new Audio() as AudioElementWithAnalyser;
    audio.muted = true;
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audio.loop = true;
    audioRef.current = audio;
    audio.src = hookData.audio_url;

    let beatCtx: AudioContext | null = null;
    let beatSource: MediaElementAudioSourceNode | null = null;
    if (!analyserNode) {
      try {
        if (audio.__analyserNode) {
          localAnalyserRef.current = audio.__analyserNode;
          beatCtx = audio.__audioContext ?? null;
          beatSource = audio.__mediaElementSource ?? null;
        } else {
          beatCtx = new AudioContext();
          const analyser = beatCtx.createAnalyser();
          beatSource = beatCtx.createMediaElementSource(audio);
          beatSource.connect(analyser);
          analyser.connect(beatCtx.destination);
          void beatCtx.resume().catch(() => {});
          audio.__analyserNode = analyser;
          audio.__audioContext = beatCtx;
          audio.__mediaElementSource = beatSource;
          localAnalyserRef.current = analyser;
        }
      } catch {
        localAnalyserRef.current = null;
      }
    }

    const spec = hookData.physics_spec as PhysicsSpec;
    const beats: BeatTick[] = hookData.beat_grid.beats.map((t: number, i: number) => ({
      time: t, isDownbeat: i % 4 === 0, strength: i % 4 === 0 ? 1 : 0.6,
    }));

    const lines = hookData.lyrics as LyricLine[];
    const lyricsStart = lines.length > 0 ? Math.min(hookData.hook_start, lines[0].start) : hookData.hook_start;
    const lyricsEnd = lines.length > 0 ? Math.min(hookData.hook_end, lines[lines.length - 1].end + 0.3) : hookData.hook_end;
    const effectiveStart = Math.max(hookData.hook_start, lyricsStart);
    const effectiveEnd = Math.max(effectiveStart + 1, lyricsEnd);

    let cancelled = false;

    (async () => {
      const typographyProfile = spec.typographyProfile;
      if (typographyProfile?.fontFamily) {
        await ensureTypographyProfileReady(typographyProfile);
      }
      if (cancelled) return;

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
    })();

    return () => {
      cancelled = true;
      engineRef.current?.stop();
      audio.pause();
      if (!analyserNode) {
        if (beatSource) {
          try { beatSource.disconnect(); } catch {}
        }
        if (beatCtx) {
          beatCtx.close().catch(() => {});
        }
        delete audio.__analyserNode;
        delete audio.__audioContext;
        delete audio.__mediaElementSource;
        localAnalyserRef.current = null;
      }
    };
  }, [hookData, drawCanvas, active, analyserNode]);

  useEffect(() => {
    if (!hookData) return;
    animationResolver.loadFromDna(
      {
        physics_spec: hookData.physics_spec,
        hottest_hooks: hookData.hottest_hooks ?? [],
      },
      hookData.lyrics,
    );
  }, [hookData]);

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
