export function applyKineticEffect(
  ctx: CanvasRenderingContext2D,
  kineticClass: string,
  word: string,
  wordWidth: number,
  fontSize: number,
  currentTime: number,
  beatIntensity: number,
  wordIndex: number,
  appearanceCount: number,
  evolutionSpeedMultiplier = 1,
  beatPhase = 0,
): void {
  // beatPhase is 0-1 within each beat interval (0 = on beat, 1 = just before next).
  // All oscillating effects use bp (beat-locked radian) instead of currentTime * constant
  // so word motion synchronizes to the song's BPM.
  const bp = beatPhase * Math.PI * 2;

  switch (kineticClass) {
    case "FALLING":
    case "SINKING": {
      // Sinking bob: one cycle per beat, per-word phase offset for visual variety.
      // Old: Math.sin(currentTime * 2 + wordIndex * 0.5)
      const sinkBase = 8;
      const sinkBob = Math.sin(bp + wordIndex * 0.5) * 6;
      ctx.translate(0, sinkBase + sinkBob);
      ctx.globalAlpha *= 0.2;
      ctx.fillText(word, 0, -10);
      ctx.fillText(word, 0, -20);
      ctx.globalAlpha /= 0.2;
      break;
    }

    case "RUNNING": {
      // Running is a static stretch + trail — no oscillation to beat-lock.
      // Unchanged.
      ctx.save();
      ctx.translate(wordWidth / 2, 0);
      ctx.scale(1.12, 1.0);
      ctx.translate(-wordWidth / 2, 0);
      for (let t = 1; t <= 3; t += 1) {
        ctx.globalAlpha = 0.25 / t;
        ctx.fillText(word, -(t * 8), 0);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      break;
    }

    case "FLOATING":
    case "DRIFTING": {
      // Gentle float: one sine cycle per beat with per-word offset.
      // Old: Math.sin(currentTime * 0.8 * evo + wordIndex) — wall-clock, ~0.8 rad/s.
      // At 120 BPM (12.57 rad/s) this was 15x too slow. Now beat-locked.
      const floatY = Math.sin(bp + wordIndex) * 6;
      ctx.translate(0, floatY);
      ctx.shadowBlur = 8;
      ctx.shadowColor = "rgba(255,255,255,0.3)";
      break;
    }

    case "SUBMERGING": {
      // Submerge uses beat phase to create a rhythmic emergence per beat cycle.
      // Old: (currentTime % 4) / 4 — 4-second wall-clock loop.
      // New: uses beat phase directly — rises from below once per beat.
      const submergeY = beatPhase < 0.3
        ? fontSize * (1 - beatPhase / 0.3)
        : 0;
      ctx.translate(0, submergeY);
      break;
    }

    case "ENVELOPING": {
      // Magnetic aura scale: one pulse per beat.
      // Old: Math.sin(currentTime * 1.5) — wall-clock ~1.5 rad/s.
      const envelope = 1 + Math.sin(bp) * 0.04;
      ctx.save();
      ctx.translate(wordWidth / 2, 0);
      ctx.scale(envelope, envelope);
      ctx.translate(-wordWidth / 2, 0);
      ctx.beginPath();
      ctx.ellipse(
        wordWidth / 2,
        -fontSize / 2,
        (wordWidth / 2) * (1.2 + appearanceCount * 0.08),
        (fontSize / 2) * (1.2 + appearanceCount * 0.08),
        0,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = `rgba(240,248,255,${0.15 + appearanceCount * 0.04})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      break;
    }

    case "SHAKING": {
      // Shaking uses Math.random() — deliberately not beat-locked (chaotic jitter).
      // beatIntensity already modulates amplitude. Unchanged.
      const jx = (Math.random() - 0.5) * beatIntensity * 3;
      const jy = (Math.random() - 0.5) * beatIntensity * 1;
      ctx.save();
      ctx.fillStyle = "rgba(255,0,0,0.4)";
      ctx.fillText(word, jx + 2, jy);
      ctx.fillStyle = "rgba(0,0,255,0.4)";
      ctx.fillText(word, jx - 2, jy);
      ctx.restore();
      ctx.translate(jx * 0.3, jy * 0.3);
      break;
    }

    case "RISING": {
      // Rise: one upward sweep per beat, resets on each new beat.
      // Old: ((currentTime * evo) % 3) / 3 — 3-second wall-clock loop.
      // New: beatPhase drives one rise per beat. Phase 0 = bottom, phase 1 = top.
      const riseY = -Math.min(beatPhase * fontSize * 0.3, 20);
      ctx.translate(0, riseY);
      ctx.globalAlpha *= 0.2;
      ctx.fillText(word, 0, 10);
      ctx.fillText(word, 0, 20);
      ctx.globalAlpha /= 0.2;
      break;
    }

    case "HIDING":
      ctx.filter = "blur(1.2px)";
      ctx.globalAlpha *= 0.55;
      break;

    case "STATIC":
      break;

    default:
      break;
  }
}
