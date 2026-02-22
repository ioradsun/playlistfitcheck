export interface TypographyProfile {
  fontFamily: string;
  fontWeight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  letterSpacing: string;
  textTransform: "uppercase" | "lowercase" | "none";
  lineHeightMultiplier: number;
  hasSerif: boolean;
  personality:
    | "MONUMENTAL"
    | "ELEGANT DECAY"
    | "RAW TRANSCRIPT"
    | "HANDWRITTEN MEMORY"
    | "SHATTERED DISPLAY"
    | "INVISIBLE INK";
}

export interface SceneManifest {
  world: string;
  coreEmotion: string;
  gravity: "normal" | "inverted" | "sideways" | "slow-float" | "slammed";
  tension: number;
  decay: "sudden" | "linger" | "breath" | "echo";
  lightSource: string;
  palette: [string, string, string];
  contrastMode: "brutal" | "soft" | "neon" | "ghost" | "raw";
  letterPersonality:
    | "fracturing"
    | "dissolving"
    | "materializing"
    | "burning"
    | "freezing"
    | "static";
  stackBehavior: "collapsing" | "rising" | "scattered" | "centered" | "falling";
  beatResponse: "seismic" | "breath" | "pulse" | "ripple" | "slam";
  lyricEntrance:
    | "materializes"
    | "slams-in"
    | "rises"
    | "fractures-in"
    | "fades"
    | "cuts";
  lyricExit:
    | "dissolves-upward"
    | "shatters"
    | "fades"
    | "drops"
    | "burns-out"
    | "snaps-off";
  backgroundSystem:
    | "fracture"
    | "pressure"
    | "breath"
    | "static"
    | "burn"
    | "void";
  backgroundIntensity: number;
  typographyProfile: TypographyProfile;
  songTitle: string;
  generatedAt: number;
}
