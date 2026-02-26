import type { FrameRenderState } from "@/engine/presetDerivation";

export function getBackgroundSystemForTime(
  manifest: FrameRenderState,
  songProgress: number,
  _beatIntensity: number,
): string {
  const base = manifest.backgroundSystem as string;

  if (base === "burn") {
    if (songProgress < 0.15) return "haze";
    if (songProgress < 0.55) return "burn";
    if (songProgress < 0.75) return "haze";
    return "ember";
  }

  if (base === "rain" || base === "breath") {
    if (songProgress < 0.2) return "mist";
    if (songProgress < 0.5) return "rain";
    if (songProgress < 0.7) return "downpour";
    return "mist";
  }

  if (base === "frost" || base === "winter") {
    if (songProgress < 0.3) return "frost";
    if (songProgress < 0.6) return "blizzard";
    return "frost";
  }

  return base;
}
