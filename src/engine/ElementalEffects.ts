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
  },
): void {
  const effectQuality = options?.effectQuality ?? "high";
  const useBlur = Boolean(options?.useBlur && effectQuality === "high");
  const bubbleXPositions = options?.bubbleXPositions ?? [];
  const isHeroWord = Boolean(options?.isHeroWord);

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

        ctx.beginPath();
        ctx.arc(bx, by, 1.5 + i % 3, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(150,200,255,${opacity})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
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

        ctx.beginPath();
        ctx.arc(ex, ey, 1.5 + Math.random(), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,${100 + Math.floor(Math.random() * 100)},0,${eOpacity})`;
        ctx.fill();
      }
      break;
    }

    case "SMOKE": {
      // Base word at reduced opacity
      ctx.globalAlpha *= 0.65;
      if (useBlur) {
        ctx.filter = "blur(0.8px)";
      }
      ctx.fillStyle = colorOverride ?? "#8a8a8a";
      ctx.fillText(word, 0, 0);
      ctx.filter = "none";
      ctx.globalAlpha /= 0.65;

      // Expanding smoke rings
      const smokeAge = (currentTime * 0.4) % 1;
      ctx.beginPath();
      ctx.ellipse(
        wordWidth / 2,
        -fontSize / 2,
        (wordWidth / 2) * (1 + smokeAge * 0.5),
        (fontSize / 2) * (1 + smokeAge * 0.4),
        0,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = `rgba(140,130,120,${0.15 - smokeAge * 0.15})`;
      ctx.lineWidth = 6;
      ctx.stroke();
      break;
    }

    case "ELECTRIC":
    case "NEON": {
      // Neon glow word
      const neonColor = colorOverride ?? "#00ffff";
      ctx.shadowBlur = isHeroWord ? 15 + beatIntensity * 20 : 0;
      ctx.shadowColor = neonColor;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(word, 0, 0);
      ctx.shadowBlur = 0;

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
