export function renderSectionLighting(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  section: { lightBehavior: string; intensity: number },
  activeWordPosition: { x: number; y: number },
  songProgress: number,
  beatIntensity: number,
  _currentTime: number,
): void {
  const lightBehavior = section.lightBehavior.toLowerCase();
  const intensity = section.intensity;

  if (
    lightBehavior.includes("bioluminescent") ||
    lightBehavior.includes("lyrics") ||
    lightBehavior.includes("words")
  ) {
    const glow = ctx.createRadialGradient(
      activeWordPosition.x, activeWordPosition.y, 0,
      activeWordPosition.x, activeWordPosition.y, canvas.height * 0.35,
    );
    glow.addColorStop(0, `rgba(140,160,200,${0.12 + intensity * 0.1})`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (
    lightBehavior.includes("surface") ||
    lightBehavior.includes("above") ||
    lightBehavior.includes("distant")
  ) {
    const beamOpacity = Math.max(0, 0.12 - songProgress * 0.15);
    if (beamOpacity > 0) {
      const beam = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.6);
      beam.addColorStop(0, `rgba(180,200,230,${beamOpacity})`);
      beam.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = beam;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  if (
    lightBehavior.includes("scarce") ||
    lightBehavior.includes("oppressive") ||
    lightBehavior.includes("disappears")
  ) {
    ctx.fillStyle = `rgba(0,0,0,${intensity * 0.25})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (
    lightBehavior.includes("intense") ||
    lightBehavior.includes("desperate") ||
    lightBehavior.includes("luminescen")
  ) {
    const desperateGlow = ctx.createRadialGradient(
      activeWordPosition.x, activeWordPosition.y, 0,
      activeWordPosition.x, activeWordPosition.y, canvas.height * 0.5,
    );
    desperateGlow.addColorStop(0, `rgba(200,220,255,${0.15 + beatIntensity * 0.1})`);
    desperateGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = desperateGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (
    beatIntensity > 0.85 &&
    (lightBehavior.includes("flash") ||
      lightBehavior.includes("lightning") ||
      lightBehavior.includes("storm"))
  ) {
    ctx.fillStyle = `rgba(255,255,255,${(beatIntensity - 0.85) * 0.6})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

/** @deprecated Use renderSectionLighting */
export function renderChapterLighting(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  chapter: { lightBehavior: string; intensity: number },
  activeWordPosition: { x: number; y: number },
  songProgress: number,
  beatIntensity: number,
  currentTime: number,
): void {
  return renderSectionLighting(ctx, canvas, chapter, activeWordPosition, songProgress, beatIntensity, currentTime);
}
