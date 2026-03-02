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
        // Bright: visible wave distortion + water drops + ripples
        ctx.fillStyle = colorOverride ?? "#1a3a5c";
        ctx.fillText(word, 0, 0);

        // Refractive wave — visible
        ctx.save();
        ctx.globalAlpha *= 0.25;
        const waveAmp = 2.5 + beatIntensity * 2;
        const waveOff = Math.sin(currentTime * 2.5) * waveAmp;
        ctx.fillStyle = "#2255aa";
        ctx.fillText(word, waveOff, 0.8);
        ctx.restore();

        // Visible ripples beneath word
        const rippleCount = 3;
        for (let i = 0; i < rippleCount; i++) {
          const rippleT = (currentTime * 0.4 + i * 0.33) % 1;
          const rippleW = wordWidth * (0.5 + rippleT * 0.6);
          const rippleAlpha = Math.max(0, 0.25 - rippleT * 0.25);
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(wordWidth / 2, fontSize * 0.2 + rippleT * 12, rippleW / 2, 2.5, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(30,100,200,${rippleAlpha})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }

        // Water drops falling
        for (let i = 0; i < 3; i++) {
          const dx = wordWidth * (i + 0.5) / 3;
          const dropProgress = (currentTime * 0.7 + i * 0.33) % 1;
          const dy = dropProgress * 25;
          const dropSize = 2 + dropProgress * 2;
          const dropOpacity = 0.4 - dropProgress * 0.4;
          ctx.beginPath();
          ctx.arc(dx, dy, dropSize, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(50,120,200,${dropOpacity})`;
          ctx.fill();
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
        // Bright: visible heat shimmer + red/orange tint
        ctx.fillStyle = colorOverride ?? "#2a0a00";
        ctx.fillText(word, 0, 0);

        // Heat shimmer — visible displacement
        ctx.save();
        ctx.globalAlpha *= 0.2 + beatIntensity * 0.15;
        const shimmerY = Math.sin(currentTime * 6) * 2.5;
        ctx.fillStyle = "#cc3300";
        ctx.fillText(word, 0, shimmerY);
        ctx.restore();

        // Red-orange tint at edges
        ctx.save();
        ctx.beginPath();
        ctx.rect(-2, -fontSize - 2, wordWidth + 4, fontSize + 4);
        ctx.clip();
        const heatGrad = ctx.createLinearGradient(0, 0, 0, -fontSize);
        heatGrad.addColorStop(0, "rgba(220,60,0,0.30)");
        heatGrad.addColorStop(0.5, "rgba(220,60,0,0.05)");
        heatGrad.addColorStop(1, "rgba(255,120,0,0.20)");
        ctx.fillStyle = heatGrad;
        ctx.fillText(word, 0, 0);
        ctx.restore();

        // Rising heat lines — visible
        ctx.save();
        ctx.globalAlpha = 0.15 + beatIntensity * 0.10;
        ctx.strokeStyle = "rgba(220,80,0,0.6)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const hx = wordWidth * (i + 0.5) / 4;
          const hProgress = (currentTime * 0.8 + i * 0.25) % 1;
          ctx.beginPath();
          ctx.moveTo(hx, -fontSize * hProgress);
          ctx.bezierCurveTo(
            hx + Math.sin(currentTime * 4 + i) * 6, -fontSize * (hProgress + 0.15),
            hx - Math.sin(currentTime * 3 + i) * 5, -fontSize * (hProgress + 0.3),
            hx + Math.sin(currentTime * 5 + i) * 3, -fontSize * (hProgress + 0.5),
          );
          ctx.stroke();
        }
        ctx.restore();

        // Embers even in bright mode
        const brightEmberCount = 3 + Math.floor(beatIntensity * 3);
        for (let i = 0; i < brightEmberCount; i += 1) {
          const ex = (wordWidth * i / brightEmberCount) + Math.sin(currentTime * 5 + i * 1.3) * 6;
          const eyOffset = (currentTime * 20 + i * 12) % 30;
          const ey = -fontSize - eyOffset;
          const eOpacity = Math.max(0, 0.6 - eyOffset / 30);
          drawEmber(ctx, ex, ey, 1.8 + (i % 2), eOpacity, currentTime * 1000, i);
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
        // Bright: visible shadow depth + drift + smoke wisps
        ctx.fillStyle = colorOverride ?? "#333";
        ctx.fillText(word, 0, 0);

        // Deep shadow
        ctx.save();
        ctx.globalAlpha *= 0.25;
        ctx.fillStyle = "#553388";
        ctx.fillText(word, 2, 2);
        ctx.restore();

        // Drifting echo
        ctx.save();
        const drift = Math.sin(currentTime * 1.5) * 4;
        const driftAlpha = 0.15 + 0.08 * Math.sin(currentTime * 2.5);
        ctx.globalAlpha *= driftAlpha;
        ctx.fillStyle = "#6644aa";
        ctx.fillText(word, drift, -1);
        ctx.restore();

        // Rising wisps (visible in bright mode too)
        for (let i = 0; i < 3; i++) {
          const wispX = wordWidth * (i + 0.3) / 3 + Math.sin(currentTime * 2 + i * 2.1) * 8;
          const wispProgress = (currentTime * 0.5 + i * 0.33) % 1;
          const wispY = -fontSize * wispProgress * 1.5;
          const wispAlpha = Math.max(0, 0.25 - wispProgress * 0.25);
          ctx.save();
          ctx.globalAlpha *= wispAlpha;
          ctx.beginPath();
          ctx.arc(wispX, wispY, 6 + wispProgress * 12, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(100,70,160,0.3)";
          ctx.fill();
          ctx.restore();
        }
      } else {
        // Dark: expanding smoke, visible base
        ctx.globalAlpha *= 0.85;
        ctx.fillStyle = colorOverride ?? "#aa99cc";
        ctx.fillText(word, 0, 0);
        ctx.globalAlpha /= 0.85;

        const smokeAge = (currentTime * 0.4) % 1;
        drawSmoke(
          ctx,
          wordWidth / 2,
          -fontSize / 2,
          (wordWidth / 2) * (1 + smokeAge * 0.8),
          Math.max(0, 0.5 - smokeAge * 0.35),
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
        // Bright: visible electric tint, flicker, spark particles
        ctx.fillStyle = colorOverride ?? "#0a0a0a";
        ctx.fillText(word, 0, 0);

        // Strong inner shadow
        ctx.save();
        ctx.globalAlpha *= 0.2;
        ctx.fillStyle = "#003366";
        ctx.fillText(word, 1, 1);
        ctx.restore();

        // Visible electric tint — colored edge glow
        ctx.save();
        ctx.globalAlpha *= 0.2 + beatIntensity * 0.15;
        ctx.fillStyle = "#0088ff";
        ctx.fillText(word, -0.8, 0);
        ctx.fillText(word, 0.8, 0);
        ctx.restore();

        // Flicker — random bright flash
        if (Math.sin(currentTime * 25 + Math.sin(currentTime * 7) * 5) > 0.7) {
          ctx.save();
          ctx.globalAlpha *= 0.4;
          ctx.fillStyle = "#4488ff";
          ctx.fillText(word, 0, 0);
          ctx.restore();
        }

        // Spark particles
        for (let i = 0; i < 3; i++) {
          const sparkX = wordWidth * Math.abs(Math.sin(currentTime * 3 + i * 2.1));
          const sparkY = -fontSize * 0.5 + Math.cos(currentTime * 4 + i * 1.7) * fontSize * 0.4;
          const sparkAlpha = 0.3 + 0.3 * Math.abs(Math.sin(currentTime * 8 + i * 3));
          ctx.save();
          ctx.globalAlpha *= sparkAlpha;
          ctx.fillStyle = "#66aaff";
          ctx.beginPath();
          ctx.arc(sparkX, sparkY, 2, 0, Math.PI * 2);
          ctx.fill();
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
        // Bright: visible frost sweep + crystalline edges + ice crystals
        ctx.fillStyle = colorOverride ?? "#1a3040";
        ctx.fillText(word, 0, 0);

        // Desaturation sweep — visible white wash
        ctx.save();
        ctx.beginPath();
        ctx.rect(-2, -fontSize - 2, wordWidth + 4, fontSize + 4);
        ctx.clip();
        const sweepX = (Math.sin(currentTime * 0.6) * 0.5 + 0.5) * wordWidth;
        const sweepGrad = ctx.createLinearGradient(sweepX - wordWidth * 0.3, 0, sweepX + wordWidth * 0.3, 0);
        sweepGrad.addColorStop(0, "rgba(255,255,255,0)");
        sweepGrad.addColorStop(0.5, "rgba(200,230,255,0.35)");
        sweepGrad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = sweepGrad;
        ctx.fillText(word, 0, 0);
        ctx.restore();

        // Visible crystalline edge
        ctx.save();
        ctx.globalAlpha *= 0.2;
        ctx.fillStyle = "#66aadd";
        ctx.fillText(word, -0.7, -0.7);
        ctx.fillText(word, 0.7, 0.7);
        ctx.restore();

        // Ice crystals — visible
        const crystalCount = isHeroWord ? 5 : 3;
        for (let i = 0; i < crystalCount; i++) {
          const angle = (Math.PI * 2 * i) / crystalCount + currentTime * 0.15;
          const radius = wordWidth * 0.45 + Math.sin(currentTime * 0.4 + i * 2) * 8;
          const cx = wordWidth / 2 + Math.cos(angle) * radius;
          const cy = -fontSize / 2 + Math.sin(angle) * fontSize * 0.4;
          const size = 3 + Math.sin(currentTime * 1.5 + i) * 1.5;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(0, -size);
          ctx.lineTo(size * 0.5, 0);
          ctx.lineTo(0, size);
          ctx.lineTo(-size * 0.5, 0);
          ctx.closePath();
          ctx.fillStyle = "rgba(100,180,230,0.35)";
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
