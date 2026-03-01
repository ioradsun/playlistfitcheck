import { drawBubble, drawEmber, drawNeonOrb, drawSmoke } from "./ElementalRenderers";

/**
 * Cinematic elemental effects for hero words.
 *
 * Two lighting modes (same animation engine, different visual language):
 *   DARK  — elements emit light: glow, bloom, particles, additive blending
 *   BRIGHT — elements are distortion: heat shimmer, desaturation, shadows, displacement
 */
export function drawElementalWord(
  ctx: CanvasRenderingContext2D,
  word: string,
  fontSize: number,
  wordWidth: number,
  elementalClass: string,
  currentTime: number,
  beatIntensity: number,
  appearanceCount: number,
  colorOverride: string | null,
  options?: {
    bubbleXPositions?: number[];
    useBlur?: boolean;
    isHeroWord?: boolean;
    effectQuality?: "low" | "high";
    wordX?: number;
    wordY?: number;
    canvasWidth?: number;
    canvasHeight?: number;
    lightingMode?: "dark" | "bright";
  },
): void {
  const effectQuality = options?.effectQuality ?? "high";
  const bubbleXPositions = options?.bubbleXPositions ?? [];
  const isHeroWord = Boolean(options?.isHeroWord);
  const mode = options?.lightingMode ?? "dark";

  const wordX = options?.wordX ?? 0;
  const wordY = options?.wordY ?? 0;
  const canvasWidth = options?.canvasWidth;
  const canvasHeight = options?.canvasHeight;
  if (
    typeof canvasWidth === "number" &&
    typeof canvasHeight === "number" &&
    (wordX + wordWidth < 0 ||
      wordX > canvasWidth ||
      wordY < -fontSize * 2 ||
      wordY > canvasHeight + fontSize)
  ) {
    return;
  }

  switch (elementalClass) {
    // ═══════════════════════════════════════
    // WATER / RAIN
    // ═══════════════════════════════════════
    case "WATER":
    case "RAIN": {
      if (mode === "bright") {
        // Bright: clear refraction distortion + soft shadow ripple
        ctx.fillStyle = colorOverride ?? "#1a3a5c";
        ctx.fillText(word, 0, 0);

        // Refractive displacement — subtle horizontal wave
        ctx.save();
        ctx.globalAlpha *= 0.12;
        const waveAmp = 1.5 + beatIntensity * 1.5;
        const waveOff = Math.sin(currentTime * 2.5) * waveAmp;
        ctx.fillStyle = colorOverride ?? "#1a3a5c";
        ctx.fillText(word, waveOff, 0.5);
        ctx.globalAlpha /= 0.12;
        ctx.restore();

        // Soft shadow ripple beneath word
        const rippleCount = 2;
        for (let i = 0; i < rippleCount; i++) {
          const rippleT = (currentTime * 0.4 + i * 0.5) % 1;
          const rippleW = wordWidth * (0.6 + rippleT * 0.5);
          const rippleAlpha = Math.max(0, 0.08 - rippleT * 0.08);
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(wordWidth / 2, fontSize * 0.15 + rippleT * 8, rippleW / 2, 2, 0, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0,40,80,${rippleAlpha})`;
          ctx.fill();
          ctx.restore();
        }
      } else {
        // Dark: blue glow, bubbles, drips
        ctx.fillStyle = colorOverride ?? "#4A6B8C";
        ctx.fillText(word, 0, 0);

        // Wet sheen overlay
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, -fontSize, wordWidth, fontSize * 1.2);
        ctx.clip();
        const sheen = ctx.createLinearGradient(0, -fontSize, 0, 0);
        sheen.addColorStop(0, "rgba(255,255,255,0.2)");
        sheen.addColorStop(0.4, "rgba(255,255,255,0)");
        ctx.fillStyle = sheen;
        ctx.fillRect(0, -fontSize, wordWidth, fontSize);
        ctx.restore();

        // Bubbles rising
        const bubbleCount = Math.max(1, bubbleXPositions.length || (3 + appearanceCount * 2));
        const bubbleSpeed = 1 + appearanceCount * 0.4;
        const cappedBubbles = Math.min(bubbleCount, effectQuality === "high" ? 12 : 8);
        for (let i = 0; i < cappedBubbles; i += 1) {
          const fixedX = bubbleXPositions[i] ?? (wordWidth * i / cappedBubbles);
          const bx = fixedX + Math.sin(currentTime * 3 + i) * 2;
          const byBase = -fontSize;
          const byOffset = (currentTime * (15 * bubbleSpeed) + i * 20) % 40;
          const by = byBase - byOffset;
          const opacity = Math.max(0, 0.6 - byOffset / 40);
          drawBubble(ctx, bx, by, 1.5 + i % 3, opacity);
        }

        // Water drips
        const dropCount = Math.floor(wordWidth / 25);
        for (let i = 0; i < dropCount; i += 1) {
          const dx = (i / dropCount) * wordWidth + wordWidth / (dropCount * 2);
          const dropProgress = (currentTime * 0.6 + i * 0.4) % 1;
          const dy = dropProgress * 30;
          const dropSize = 1.5 + dropProgress * 2;
          const dropOpacity = 0.6 - dropProgress * 0.6;
          ctx.beginPath();
          ctx.arc(dx, dy, dropSize, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(100,160,220,${dropOpacity})`;
          ctx.fill();
        }
      }
      break;
    }

    // ═══════════════════════════════════════
    // FIRE
    // ═══════════════════════════════════════
    case "FIRE": {
      if (mode === "bright") {
        // Bright: heat shimmer + red tint edges. No particles. Feels like temperature.
        ctx.fillStyle = colorOverride ?? "#2a0a00";
        ctx.fillText(word, 0, 0);

        // Heat shimmer — vertical displacement oscillation
        ctx.save();
        ctx.globalAlpha *= 0.08 + beatIntensity * 0.06;
        const shimmerY = Math.sin(currentTime * 6) * 1.2;
        ctx.fillStyle = colorOverride ?? "#2a0a00";
        ctx.fillText(word, 0, shimmerY);
        ctx.globalAlpha /= (0.08 + beatIntensity * 0.06);
        ctx.restore();

        // Red tint at edges
        ctx.save();
        ctx.beginPath();
        ctx.rect(-2, -fontSize - 2, wordWidth + 4, fontSize + 4);
        ctx.clip();
        const heatGrad = ctx.createLinearGradient(0, 0, 0, -fontSize);
        heatGrad.addColorStop(0, "rgba(180,40,0,0.12)");
        heatGrad.addColorStop(0.5, "rgba(180,40,0,0)");
        heatGrad.addColorStop(1, "rgba(180,40,0,0.08)");
        ctx.fillStyle = heatGrad;
        ctx.fillText(word, 0, 0);
        ctx.restore();

        // Rising heat distortion lines (very faint)
        if (beatIntensity > 0.3) {
          ctx.save();
          ctx.globalAlpha = 0.04 + beatIntensity * 0.03;
          ctx.strokeStyle = "rgba(180,60,0,0.3)";
          ctx.lineWidth = 0.5;
          for (let i = 0; i < 3; i++) {
            const hx = wordWidth * (i + 0.5) / 3;
            const hProgress = (currentTime * 0.8 + i * 0.33) % 1;
            ctx.beginPath();
            ctx.moveTo(hx, -fontSize * hProgress);
            ctx.bezierCurveTo(
              hx + Math.sin(currentTime * 4 + i) * 4, -fontSize * (hProgress + 0.15),
              hx - Math.sin(currentTime * 3 + i) * 3, -fontSize * (hProgress + 0.3),
              hx + Math.sin(currentTime * 5 + i) * 2, -fontSize * (hProgress + 0.5),
            );
            ctx.stroke();
          }
          ctx.restore();
        }
      } else {
        // Dark: orange bloom, embers, additive flame gradient
        ctx.fillStyle = "#1a0800";
        ctx.fillText(word, 0, 0);

        ctx.save();
        ctx.beginPath();
        ctx.rect(-2, -fontSize - 4, wordWidth + 4, fontSize + 8);
        ctx.clip();
        const flicker = Math.sin(currentTime * 8 + Math.random()) * 0.1;
        const fireGrad = ctx.createLinearGradient(0, 0, 0, -fontSize);
        fireGrad.addColorStop(0, "#cc1100");
        fireGrad.addColorStop(0.3 + flicker, "#ff6600");
        fireGrad.addColorStop(0.7 + flicker, "#ffaa00");
        fireGrad.addColorStop(1, "#ffffff");
        ctx.fillStyle = fireGrad;
        ctx.globalAlpha *= 0.85;
        ctx.fillText(word, 0, 0);
        ctx.globalAlpha /= 0.85;
        ctx.restore();

        // Ember particles
        const emberCount = 4 + Math.floor(beatIntensity * 4);
        for (let i = 0; i < emberCount; i += 1) {
          const ex = (wordWidth * i / emberCount) + Math.sin(currentTime * 5 + i * 1.3) * 6;
          const eyOffset = (currentTime * 25 + i * 15) % 35;
          const ey = -fontSize - eyOffset;
          const eOpacity = Math.max(0, 0.8 - eyOffset / 35);
          drawEmber(ctx, ex, ey, 1.4 + (i % 2), eOpacity, currentTime * 1000, i);
        }
      }
      break;
    }

    // ═══════════════════════════════════════
    // SMOKE
    // ═══════════════════════════════════════
    case "SMOKE": {
      if (mode === "bright") {
        // Bright: subtle displacement + shadow depth. No visible particles.
        ctx.fillStyle = colorOverride ?? "#333";
        ctx.fillText(word, 0, 0);

        // Shadow depth
        ctx.save();
        ctx.globalAlpha *= 0.06;
        ctx.fillStyle = "#000";
        ctx.fillText(word, 1.5, 1.5);
        ctx.globalAlpha /= 0.06;
        ctx.restore();

        // Horizontal drift — word gently sways
        ctx.save();
        ctx.globalAlpha *= 0.05;
        const drift = Math.sin(currentTime * 1.5) * 2;
        ctx.fillStyle = colorOverride ?? "#333";
        ctx.fillText(word, drift, -0.5);
        ctx.globalAlpha /= 0.05;
        ctx.restore();
      } else {
        // Dark: expanding smoke, reduced opacity base
        ctx.globalAlpha *= 0.65;
        ctx.fillStyle = colorOverride ?? "#8a8a8a";
        ctx.fillText(word, 0, 0);
        ctx.globalAlpha /= 0.65;

        const smokeAge = (currentTime * 0.4) % 1;
        drawSmoke(
          ctx,
          wordWidth / 2,
          -fontSize / 2,
          (wordWidth / 2) * (1 + smokeAge * 0.5),
          Math.max(0, 0.3 - smokeAge * 0.25),
          currentTime * 1000,
          appearanceCount,
        );
      }
      break;
    }

    // ═══════════════════════════════════════
    // ELECTRIC / NEON
    // ═══════════════════════════════════════
    case "ELECTRIC":
    case "NEON": {
      if (mode === "bright") {
        // Bright: sharp contrast, inner shadow, subtle ambient tint. No bloom.
        ctx.fillStyle = colorOverride ?? "#0a0a0a";
        ctx.fillText(word, 0, 0);

        // Inner shadow
        ctx.save();
        ctx.globalAlpha *= 0.08;
        ctx.fillStyle = "#000";
        ctx.fillText(word, 0.8, 0.8);
        ctx.globalAlpha /= 0.08;
        ctx.restore();

        // Ambient electric tint — faint colored edge
        ctx.save();
        ctx.globalAlpha *= 0.06 + beatIntensity * 0.04;
        ctx.fillStyle = "#0066cc";
        ctx.fillText(word, -0.5, 0);
        ctx.fillText(word, 0.5, 0);
        ctx.globalAlpha /= (0.06 + beatIntensity * 0.04);
        ctx.restore();

        // Sharp flicker on strong beat
        if (beatIntensity > 0.6 && Math.sin(currentTime * 30) > 0.8) {
          ctx.save();
          ctx.globalAlpha *= 0.7;
          ctx.fillStyle = colorOverride ?? "#0a0a0a";
          ctx.fillText(word, 0, 0);
          ctx.globalAlpha /= 0.7;
          ctx.restore();
        }
      } else {
        // Dark: neon glow, orbs, electric arcs
        const neonColor = colorOverride ?? "#00ffff";
        const glowAlpha = isHeroWord ? 0.18 + beatIntensity * 0.22 : 0.08;
        const glowRadius = isHeroWord ? fontSize * 1.35 : fontSize * 0.9;
        const glow = ctx.createRadialGradient(wordWidth / 2, -fontSize * 0.45, 0, wordWidth / 2, -fontSize * 0.45, glowRadius);
        glow.addColorStop(0, `rgba(${parseInt(neonColor.slice(1, 3), 16)},${parseInt(neonColor.slice(3, 5), 16)},${parseInt(neonColor.slice(5, 7), 16)},${glowAlpha})`);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(-glowRadius * 0.4, -fontSize - glowRadius * 0.6, wordWidth + glowRadius * 0.8, glowRadius * 1.4);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(word, 0, 0);

        const orbCount = isHeroWord ? 3 : 2;
        for (let i = 0; i < orbCount; i += 1) {
          const ox = (wordWidth * (i + 1)) / (orbCount + 1);
          const oy = -fontSize * (0.55 + i * 0.18);
          drawNeonOrb(ctx, ox, oy, 2.8 + beatIntensity * 2, 0.35 + beatIntensity * 0.45, currentTime * 1000, neonColor);
        }

        if (beatIntensity > 0.55) {
          ctx.save();
          ctx.strokeStyle = `rgba(100,200,255,${beatIntensity * 0.8})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          let lx = wordWidth / 2;
          let ly = -fontSize;
          ctx.moveTo(lx, ly);
          for (let s = 0; s < 5; s += 1) {
            lx += (Math.random() - 0.5) * 18;
            ly -= 7 + Math.random() * 7;
            ctx.lineTo(lx, ly);
          }
          ctx.stroke();
          ctx.restore();
        }
      }
      break;
    }

    // ═══════════════════════════════════════
    // ICE / FROST
    // ═══════════════════════════════════════
    case "ICE":
    case "FROST": {
      if (mode === "bright") {
        // Bright: desaturation sweep + crystalline white edge. Minimal particles.
        ctx.fillStyle = colorOverride ?? "#1a3040";
        ctx.fillText(word, 0, 0);

        // Desaturation sweep — moving white wash
        ctx.save();
        ctx.beginPath();
        ctx.rect(-2, -fontSize - 2, wordWidth + 4, fontSize + 4);
        ctx.clip();
        const sweepX = (Math.sin(currentTime * 0.6) * 0.5 + 0.5) * wordWidth;
        const sweepGrad = ctx.createLinearGradient(sweepX - wordWidth * 0.3, 0, sweepX + wordWidth * 0.3, 0);
        sweepGrad.addColorStop(0, "rgba(255,255,255,0)");
        sweepGrad.addColorStop(0.5, "rgba(240,248,255,0.15)");
        sweepGrad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = sweepGrad;
        ctx.fillText(word, 0, 0);
        ctx.restore();

        // Crystalline white edge
        ctx.save();
        ctx.globalAlpha *= 0.06;
        ctx.fillStyle = "#a0c8e0";
        ctx.fillText(word, -0.5, -0.5);
        ctx.fillText(word, 0.5, 0.5);
        ctx.globalAlpha /= 0.06;
        ctx.restore();

        // Very sparse crystals (2-3)
        const fewCrystals = isHeroWord ? 3 : 2;
        for (let i = 0; i < fewCrystals; i++) {
          const angle = (Math.PI * 2 * i) / fewCrystals + currentTime * 0.1;
          const radius = wordWidth * 0.45 + Math.sin(currentTime * 0.4 + i * 2) * 5;
          const cx = wordWidth / 2 + Math.cos(angle) * radius;
          const cy = -fontSize / 2 + Math.sin(angle) * fontSize * 0.3;
          const size = 1.5 + Math.sin(currentTime * 1.5 + i) * 0.8;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(0, -size);
          ctx.lineTo(size * 0.5, 0);
          ctx.lineTo(0, size);
          ctx.lineTo(-size * 0.5, 0);
          ctx.closePath();
          ctx.fillStyle = "rgba(100,140,170,0.15)";
          ctx.fill();
          ctx.restore();
        }
      } else {
        // Dark: blue outer glow, crystals, cold breath mist
        ctx.fillStyle = colorOverride ?? "#A8D8EA";
        ctx.fillText(word, 0, 0);

        // Frost shimmer overlay
        ctx.save();
        ctx.beginPath();
        ctx.rect(-2, -fontSize - 4, wordWidth + 4, fontSize + 8);
        ctx.clip();
        const frostShimmer = ctx.createLinearGradient(
          Math.sin(currentTime * 0.8) * wordWidth * 0.3, -fontSize,
          wordWidth + Math.cos(currentTime * 0.6) * wordWidth * 0.3, 0,
        );
        frostShimmer.addColorStop(0, "rgba(255,255,255,0.0)");
        frostShimmer.addColorStop(0.3 + Math.sin(currentTime * 1.2) * 0.1, "rgba(200,230,255,0.25)");
        frostShimmer.addColorStop(0.5, "rgba(255,255,255,0.35)");
        frostShimmer.addColorStop(0.7 + Math.cos(currentTime * 0.9) * 0.1, "rgba(200,230,255,0.25)");
        frostShimmer.addColorStop(1, "rgba(255,255,255,0.0)");
        ctx.fillStyle = frostShimmer;
        ctx.fillText(word, 0, 0);
        ctx.restore();

        // Ice crystals
        const crystalCount = isHeroWord ? 8 : 4;
        for (let i = 0; i < crystalCount; i += 1) {
          const angle = (Math.PI * 2 * i) / crystalCount + currentTime * 0.15;
          const radius = (wordWidth * 0.55) + Math.sin(currentTime * 0.5 + i * 1.7) * 8;
          const cx = wordWidth / 2 + Math.cos(angle) * radius;
          const cy = -fontSize / 2 + Math.sin(angle) * (fontSize * 0.4 + Math.sin(currentTime * 0.3 + i) * 4);
          const size = 2 + Math.sin(currentTime * 2 + i * 2.1) * 1.5;
          const crystalOpacity = 0.3 + Math.sin(currentTime * 1.5 + i * 0.8) * 0.2;

          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(angle + currentTime * 0.3);
          ctx.beginPath();
          ctx.moveTo(0, -size);
          ctx.lineTo(size * 0.6, 0);
          ctx.lineTo(0, size);
          ctx.lineTo(-size * 0.6, 0);
          ctx.closePath();
          ctx.fillStyle = `rgba(180,220,255,${crystalOpacity})`;
          ctx.fill();
          ctx.restore();
        }

        // Cold breath mist
        if (beatIntensity > 0.3 || isHeroWord) {
          const mistCount = isHeroWord ? 5 : 3;
          for (let i = 0; i < mistCount; i += 1) {
            const mx = wordWidth * (i / mistCount) + Math.sin(currentTime * 0.7 + i) * 8;
            const mistProgress = (currentTime * 0.35 + i * 0.2) % 1;
            const my = -fontSize - mistProgress * 25;
            const mistSize = 6 + mistProgress * 12;
            const mistAlpha = Math.max(0, (0.2 - mistProgress * 0.2));
            ctx.beginPath();
            ctx.arc(mx, my, mistSize, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200,230,255,${mistAlpha})`;
            ctx.fill();
          }
        }
      }
      break;
    }

    default:
      ctx.fillText(word, 0, 0);
      break;
  }
}
