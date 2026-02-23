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
): void {
  switch (kineticClass) {
    case "FALLING":
    case "SINKING": {
      // Pure oscillation — no growth over time
      const sinkBase = 8;
      const sinkBob = Math.sin(currentTime * 2 + wordIndex * 0.5) * 6;
      ctx.translate(0, sinkBase + sinkBob);
      // Shadow copies above
      ctx.globalAlpha *= 0.2;
      ctx.fillText(word, 0, -10);
      ctx.fillText(word, 0, -20);
      ctx.globalAlpha /= 0.2;
      break;
    }

    case "RUNNING": {
      // Horizontal stretch + motion blur trail
      ctx.save();
      ctx.translate(wordWidth / 2, 0);
      ctx.scale(1.12, 1.0);
      ctx.translate(-wordWidth / 2, 0);
      // Trail copies behind
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
      // Gentle sine wave vertical drift
      const floatY = Math.sin(currentTime * (0.8 * evolutionSpeedMultiplier) + wordIndex) * 6;
      ctx.translate(0, floatY);
      // Soft glow
      ctx.shadowBlur = 8;
      ctx.shadowColor = "rgba(255,255,255,0.3)";
      break;
    }

    case "SUBMERGING": {
      // Rises from below into position
      const submergeProgress = (currentTime % 4) / 4;
      const submergeY = submergeProgress < 0.3
        ? fontSize * (1 - submergeProgress / 0.3)
        : 0;
      ctx.translate(0, submergeY);
      break;
    }

    case "ENVELOPING": {
      // Expands slightly, magnetic aura
      const envelope = 1 + Math.sin(currentTime * 1.5) * 0.04;
      ctx.save();
      ctx.translate(wordWidth / 2, 0);
      ctx.scale(envelope, envelope);
      ctx.translate(-wordWidth / 2, 0);
      // Aura ring
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
      // Random jitter + RGB split
      const jx = (Math.random() - 0.5) * beatIntensity * 6;
      const jy = (Math.random() - 0.5) * beatIntensity * 2;
      ctx.save();
      // Red channel offset
      ctx.fillStyle = "rgba(255,0,0,0.4)";
      ctx.fillText(word, jx + 2, jy);
      // Blue channel offset
      ctx.fillStyle = "rgba(0,0,255,0.4)";
      ctx.fillText(word, jx - 2, jy);
      ctx.restore();
      // Main word drawn after with normal color
      ctx.translate(jx * 0.3, jy * 0.3);
      break;
    }

    case "RISING": {
      // Fresh calculation each frame — capped drift
      const riseCycle = ((currentTime * evolutionSpeedMultiplier) % 3) / 3; // 0→1 over 3s
      const riseY = -Math.min(riseCycle * fontSize * 0.3, 20);
      ctx.translate(0, riseY);
      ctx.globalAlpha *= 0.2;
      ctx.fillText(word, 0, 10);
      ctx.fillText(word, 0, 20);
      ctx.globalAlpha /= 0.2;
      break;
    }

    case "HIDING":
      // Blur + reduced opacity
      ctx.filter = "blur(1.2px)";
      ctx.globalAlpha *= 0.55;
      break;

    case "STATIC":
      // No kinetic effect — word is still
      break;

    default:
      break;
  }
}
