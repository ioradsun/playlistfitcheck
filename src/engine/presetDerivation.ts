/**
 * presetDerivation.ts — Legacy type for particle system compatibility.
 */

type ToneValue = "dark" | "light";

export interface FrameRenderState {
  fontFamily: string;
  fontWeight: number;
  letterSpacing: string;
  textTransform: "uppercase" | "none";
  lineHeight: number;

  gravity: string;
  tension: number;
  damping: number;
  beatResponse: string;
  beatResponseScale: number;

  particleSystem: string;
  particleDensity: number;
  particleSpeed: number;
  particleOpacity: number;
  particleBeatReactive: boolean;
  particleDirection: string;

  imageOpacity: number;
  vignetteStrength: number;
  blurRadius: number;
  grainOpacity: number;
  tintStrength: number;
  tone: ToneValue;

  intensity: number;

  transitionType: "hard-cut" | "cross-dissolve" | "flash-cut";

  // ── Legacy manifest fields (used by ParticleEngine) ──
  world?: string;
  coreEmotion?: string;
  backgroundSystem?: string;
  lightSource?: string;
  palette?: string[];
  contrastMode?: string;
  backgroundIntensity?: number;
  letterPersonality?: string;
  decay?: number;
  stackBehavior?: string;
  lyricEntrance?: string;
  lyricExit?: string;
  typographyProfile?: {
    fontFamily?: string;
    fontWeight?: number;
    personality?: string;
    letterSpacing?: string;
    textTransform?: string;
  };
  particleConfig?: {
    system?: string;
    density?: number;
    speed?: number;
    opacity?: number;
    beatReactive?: boolean;
    direction?: string;
  };
}
