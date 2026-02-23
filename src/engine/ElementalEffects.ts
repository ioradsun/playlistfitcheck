import { drawBubble, drawEmber, drawNeonOrb, drawSmoke } from "./ElementalRenderers";

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
  },
): void {
  const effectQuality = options?.effectQuality ?? "high";
  const bubbleXPositions = options?.bubbleXPositions ?? [];
  const isHeroWord = Boolean(options?.isHeroWord);

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
    case "WATER":
    case "RAIN": {
      // Draw word in blue-grey base
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

      // Bubbles rising from word
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

      // Water drip from bottom
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
      break;
    }

    case "FIRE": {
      // Dark base word
      ctx.fillStyle = "#1a0800";
      ctx.fillText(word, 0, 0);

      // Fire gradient clipped to word
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

      // Ember particles above word
      const emberCount = 4 + Math.floor(beatIntensity * 4);
      for (let i = 0; i < emberCount; i += 1) {
        const ex = (wordWidth * i / emberCount) + Math.sin(currentTime * 5 + i * 1.3) * 6;
        const eyOffset = (currentTime * 25 + i * 15) % 35;
        const ey = -fontSize - eyOffset;
        const eOpacity = Math.max(0, 0.8 - eyOffset / 35);
        drawEmber(ctx, ex, ey, 1.4 + (i % 2), eOpacity, currentTime * 1000, i);
      }
      break;
    }

    case "SMOKE": {
      // Base word at reduced opacity
      ctx.globalAlpha *= 0.65;
      ctx.fillStyle = colorOverride ?? "#8a8a8a";
      ctx.fillText(word, 0, 0);
      ctx.globalAlpha /= 0.65;

      // Expanding smoke sprite
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
      break;
    }

    case "ELECTRIC":
    case "NEON": {
      // Neon glow word
      const neonColor = colorOverride ?? "#00ffff";
      const glowAlpha = isHeroWord ? 0.18 + beatIntensity * 0.22 : 0.08;
      const glowRadius = isHeroWord ? fontSize * 1.35 : fontSize * 0.9;
      const glow = ctx.createRadialGradient(wordWidth / 2, -fontSize * 0.45, 0, wordWidth / 2, -fontSize * 0.45, glowRadius);
      glow.addColorStop(0, `rgba(${parseInt(neonColor.slice(1,3),16)},${parseInt(neonColor.slice(3,5),16)},${parseInt(neonColor.slice(5,7),16)},${glowAlpha})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(-glowRadius * 0.4, -fontSize - glowRadius * 0.6, wordWidth + glowRadius * 0.8, glowRadius * 1.4);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(word, 0, 0);

      // Neon orb glow accents
      const orbCount = isHeroWord ? 3 : 2;
      for (let i = 0; i < orbCount; i += 1) {
        const ox = (wordWidth * (i + 1)) / (orbCount + 1);
        const oy = -fontSize * (0.55 + i * 0.18);
        drawNeonOrb(ctx, ox, oy, 2.8 + beatIntensity * 2, 0.35 + beatIntensity * 0.45, currentTime * 1000, neonColor);
      }

      // Electric arc on strong beats
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
      break;
    }

    default:
      // No elemental effect — draw normally
      ctx.fillText(word, 0, 0);
      break;
  }
}
