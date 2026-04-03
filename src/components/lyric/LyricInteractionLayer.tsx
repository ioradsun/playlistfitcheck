import { useEffect, useMemo, useRef, useState } from "react";
import type { Moment } from "@/lib/buildMoments";
import { deriveMomentFireCounts } from "@/lib/momentUtils";

const FMLY_GREEN = "#00FF78";
const BAR_HEIGHT = 48;

interface FmlyBarProps {
  moments: Moment[];
  reactionData: Record<string, { line: Record<number, number>; total: number }>;
  player: any;
  onFireTap: () => void;
  onFireHoldStart: () => void;
  onFireHoldEnd: (holdMs: number) => void;
  onSeekTo: (sec: number) => void;
}

type Ember = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
};

function GlowEmbers({ width, height, fill }: { width: number; height: number; fill: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width < 1 || height < 1) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const embers: Ember[] = [];
    let frame = 0;
    let rafId = 0;

    const spawnEvery = fill > 0.7 ? 8 : fill > 0.4 ? 14 : fill > 0.15 ? 24 : 40;

    const tick = () => {
      frame += 1;

      ctx.clearRect(0, 0, width, height);

      const pulse = 0.85 + Math.sin(frame * 0.015) * 0.15;
      const glowAlpha = fill * 0.15 * pulse;
      if (glowAlpha > 0.001) {
        const gx = width / 2;
        const gy = height * 0.7;
        const radius = Math.max(width, height) * 0.95;
        const gradient = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
        gradient.addColorStop(0, `rgba(0,255,120,${glowAlpha})`);
        gradient.addColorStop(1, "rgba(0,255,120,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }

      if (frame % spawnEvery === 0 && embers.length < 20) {
        embers.push({
          x: width * (0.2 + Math.random() * 0.6),
          y: height - 2,
          vx: (Math.random() - 0.5) * 0.08,
          vy: -(0.15 + Math.random() * (0.2 + fill * 0.4)),
          life: 1,
          maxLife: 1,
          size: 1 + Math.random() * 1.4,
        });
      }

      const decay = 0.004 + (1 - fill) * 0.002;
      for (let i = embers.length - 1; i >= 0; i -= 1) {
        const e = embers[i];
        e.x += e.vx;
        e.y += e.vy;
        e.life -= decay;
        if (e.life <= 0 || e.y < -4) {
          embers.splice(i, 1);
          continue;
        }

        const lifeRatio = Math.max(0, e.life / e.maxLife);
        const haloRadius = e.size * (2 + lifeRatio * 2);
        const haloGradient = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, haloRadius);
        haloGradient.addColorStop(0, `rgba(0,255,120,${0.35 * lifeRatio})`);
        haloGradient.addColorStop(1, "rgba(0,255,120,0)");
        ctx.fillStyle = haloGradient;
        ctx.beginPath();
        ctx.arc(e.x, e.y, haloRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(90,255,165,${0.75 * lifeRatio})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, Math.max(0.7, e.size * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [width, height, fill]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    />
  );
}

function Section({
  moment,
  fill,
  isActive,
  progress,
  onPress,
}: {
  moment: Moment;
  fill: number;
  isActive: boolean;
  progress: number;
  onPress: () => void;
}) {
  const hostRef = useRef<HTMLButtonElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: BAR_HEIGHT });

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    const update = () => {
      const rect = node.getBoundingClientRect();
      setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <button
      ref={hostRef}
      type="button"
      onClick={onPress}
      style={{
        flex: Math.max(1, moment.endSec - moment.startSec),
        height: BAR_HEIGHT,
        background: "#030305",
        border: "none",
        borderRight: "1px solid rgba(255,255,255,0.025)",
        position: "relative",
        overflow: "hidden",
        padding: 0,
        margin: 0,
        cursor: "pointer",
      }}
    >
      <GlowEmbers width={size.width} height={size.height} fill={fill} />
      {isActive && (
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            height: 1,
            width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
            background: FMLY_GREEN,
          }}
        />
      )}
    </button>
  );
}

function InlineFireButton({
  onFireTap,
  onFireHoldStart,
  onFireHoldEnd,
  player,
}: {
  onFireTap: () => void;
  onFireHoldStart: () => void;
  onFireHoldEnd: (holdMs: number) => void;
  player: any;
}) {
  const holdStartRef = useRef<number | null>(null);
  const holdTickRef = useRef<number | null>(null);
  const [isActive, setIsActive] = useState(false);

  const handleDown = () => {
    holdStartRef.current = performance.now();
    setIsActive(true);
    player?.fireMoment?.();
    onFireHoldStart();
    holdTickRef.current = window.setInterval(() => {
      player?.fireMoment?.();
    }, 150);
  };

  const handleUp = () => {
    if (holdTickRef.current) {
      window.clearInterval(holdTickRef.current);
      holdTickRef.current = null;
    }
    player?.stopContinuousFire?.();

    const startedAt = holdStartRef.current;
    holdStartRef.current = null;
    if (startedAt == null) {
      setIsActive(false);
      return;
    }

    const holdMs = performance.now() - startedAt;
    if (holdMs < 180) {
      onFireTap();
    } else {
      onFireHoldEnd(holdMs);
    }

    window.setTimeout(() => setIsActive(false), 240);
  };

  useEffect(() => {
    return () => {
      if (holdTickRef.current) window.clearInterval(holdTickRef.current);
    };
  }, []);

  return (
    <button
      type="button"
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerLeave={handleUp}
      style={{
        width: BAR_HEIGHT,
        height: BAR_HEIGHT,
        flexShrink: 0,
        background: "#030305",
        border: `1px solid ${isActive ? FMLY_GREEN : "rgba(0,255,120,0.08)"}`,
        boxShadow: isActive ? "0 0 18px rgba(0,255,120,0.28)" : "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        margin: 0,
      }}
    >
      <svg viewBox="0 0 24 24" width={22} height={22} fill={isActive ? FMLY_GREEN : "none"} stroke={isActive ? FMLY_GREEN : "rgba(0,255,120,0.2)"} strokeWidth={1.5}>
        <path d="M12 23c-3.6 0-7-2.4-7-7 0-3.1 2.1-5.7 4-7.6.3-.3.8-.1.8.3v2c0 .2.2.4.4.3 2.1-1.1 4.8-3.5 4.8-7 0-.3.4-.5.6-.3C18.2 6 20 10 20 13.5c0 5.3-3.6 9.5-8 9.5z" />
      </svg>
    </button>
  );
}

export function FmlyBar({
  moments,
  reactionData,
  player,
  onFireTap,
  onFireHoldStart,
  onFireHoldEnd,
  onSeekTo,
}: FmlyBarProps) {
  const safeMoments = moments;
  const safeReactionData = reactionData;

  const [loopMomentIdx, setLoopMomentIdx] = useState(0);
  const [playheadSec, setPlayheadSec] = useState(0);

  useEffect(() => {
    if (!player?.audio) return;

    let raf = 0;
    const tick = () => {
      setPlayheadSec(player.audio.currentTime ?? 0);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [player]);

  useEffect(() => {
    if (!safeMoments.length) return;
    const idx = safeMoments.findIndex((m) => playheadSec >= m.startSec && playheadSec < m.endSec);
    if (idx >= 0 && (loopMomentIdx < 0 || loopMomentIdx >= safeMoments.length)) {
      setLoopMomentIdx(idx);
    }
  }, [safeMoments, playheadSec, loopMomentIdx]);

  const momentFireCounts = useMemo(() => deriveMomentFireCounts(safeReactionData, safeMoments), [safeReactionData, safeMoments]);
  const maxFireCount = Math.max(1, ...Object.values(momentFireCounts));

  const activeMoment = safeMoments[loopMomentIdx] ?? null;
  const activeProgress = activeMoment
    ? Math.max(0, Math.min(1, (playheadSec - activeMoment.startSec) / Math.max(0.0001, activeMoment.endSec - activeMoment.startSec)))
    : 0;

  const leftCount = Math.floor(safeMoments.length / 2);
  const leftMoments = safeMoments.slice(0, leftCount);
  const rightMoments = safeMoments.slice(leftCount);

  const onSelectMoment = (moment: Moment, index: number) => {
    setLoopMomentIdx(index);
    onSeekTo(moment.startSec);
    player?.setRegion?.(moment.startSec, moment.endSec);
  };

  return (
    <div
      style={{
        width: "100%",
        height: BAR_HEIGHT,
        background: "#030305",
        display: "flex",
        alignItems: "stretch",
        borderTop: "1px solid rgba(255,255,255,0.025)",
        borderBottom: "1px solid rgba(255,255,255,0.025)",
      }}
    >
      {leftMoments.map((moment, index) => {
        const fill = Math.max(0, Math.min(1, (momentFireCounts[index] ?? 0) / maxFireCount));
        return (
          <Section
            key={`left-${index}-${moment.startSec}`}
            moment={moment}
            fill={fill}
            isActive={loopMomentIdx === index}
            progress={loopMomentIdx === index ? activeProgress : 0}
            onPress={() => onSelectMoment(moment, index)}
          />
        );
      })}

      <InlineFireButton
        onFireTap={onFireTap}
        onFireHoldStart={onFireHoldStart}
        onFireHoldEnd={onFireHoldEnd}
        player={player}
      />

      {rightMoments.map((moment, rightIndex) => {
        const index = leftCount + rightIndex;
        const fill = Math.max(0, Math.min(1, (momentFireCounts[index] ?? 0) / maxFireCount));
        return (
          <Section
            key={`right-${index}-${moment.startSec}`}
            moment={moment}
            fill={fill}
            isActive={loopMomentIdx === index}
            progress={loopMomentIdx === index ? activeProgress : 0}
            onPress={() => onSelectMoment(moment, index)}
          />
        );
      })}
    </div>
  );
}


export { FmlyBar as LyricInteractionLayer };
