export interface CinematicDirection {
  thesis: string;
  visualWorld: VisualWorld;
  chapters: Chapter[];
  wordDirectives: Record<string, WordDirective>;
  storyboard: LineDirection[];
  silenceDirective: SilenceDirective;
  climax: ClimaxDirective;
  ending: EndingDirective;
  symbolSystem: SymbolSystem;
  cameraLanguage: CameraLanguage;
  tensionCurve: TensionStage[];
  shotProgression: ShotType[];
}

export interface SymbolSystem {
  primary: string;
  secondary: string;
  beginningState: string;
  middleMutation: string;
  climaxOverwhelm: string;
  endingDecay: string;
  interactionRules: string[];
}

export interface CameraLanguage {
  openingDistance: 'ExtremeWide' | 'Wide' | 'Medium' | 'Close' | 'ExtremeClose';
  closingDistance: 'ExtremeWide' | 'Wide' | 'Medium' | 'Close' | 'ExtremeClose';
  movementType: 'Drift' | 'PushIn' | 'Orbit' | 'Descent' | 'Rise' | 'Shake' | 'Freeze';
  climaxBehavior: string;
  distanceByChapter: {
    chapterIndex: number;
    distance: string;
    movement: string;
  }[];
}

export interface TensionStage {
  stage: 'Setup' | 'Build' | 'Peak' | 'Release';
  startRatio: number;
  endRatio: number;
  motionIntensity: number;
  particleDensity: number;
  lightBrightness: number;
  cameraMovement: string;
  typographyAggression: number;
}

export interface ShotType {
  lineIndex: number;
  shotType:
    | 'FloatingInWorld'
    | 'EmergingFromSymbol'
    | 'SubmergedInSymbol'
    | 'FragmentedBySymbol'
    | 'ReflectedInSymbol'
    | 'ConsumedBySymbol'
    | 'AloneInVoid';
  description: string;
}

export interface VisualWorld {
  palette: [string, string, string];
  backgroundSystem: string;
  lightSource: string;
  particleSystem: string;
  typographyProfile: {
    fontFamily: string;
    fontWeight: number;
    personality: string;
    letterSpacing: string;
    textTransform: string;
  };
  physicsProfile: {
    weight: 'featherlight' | 'light' | 'normal' | 'heavy' | 'crushing';
    chaos: 'still' | 'restrained' | 'building' | 'chaotic' | 'explosive';
    heat: number;
    beatResponse: 'breath' | 'pulse' | 'slam' | 'drift' | 'shatter';
  };
}

export interface Chapter {
  startRatio: number;
  endRatio: number;
  title: string;
  emotionalArc: string;
  dominantColor: string;
  lightBehavior: string;
  particleDirective: string;
  backgroundDirective: string;
  emotionalIntensity: number;
  typographyShift: string | null;
}

export interface WordDirective {
  word: string;
  kineticClass:
    | 'RUNNING' | 'FALLING' | 'SPINNING' | 'FLOATING' | 'SHAKING' | 'RISING'
    | 'BREAKING' | 'HIDING' | 'NEGATION' | 'CRYING' | 'SCREAMING' | 'WHISPERING'
    | 'IMPACT' | 'TENDER' | 'STILL' | null;
  elementalClass:
    | 'FIRE' | 'ICE' | 'RAIN' | 'SMOKE' | 'ELECTRIC' | 'NEON' | null;
  emphasisLevel: number;
  colorOverride: string | null;
  specialEffect: string | null;
  evolutionRule: string | null;
  entry?: string | null;
  behavior?: string | null;
  exit?: string | null;
  trail?: string | null;
  ghostTrail?: boolean;
  ghostDirection?: 'up' | 'down' | 'left' | 'right' | 'radial' | null;
  letterSequence?: boolean;
  visualMetaphor?: string | null;
}

export interface LineDirection {
  lineIndex: number;
  text: string;
  emotionalIntent: string;
  heroWord: string;
  visualTreatment: string;
  entryStyle:
    | 'fades' | 'slams-in' | 'rises' | 'materializes' | 'fractures-in' | 'cuts';
  exitStyle:
    | 'fades' | 'dissolves-upward' | 'shatters' | 'burns-out' | 'drops' | 'lingers';
  particleBehavior: string;
  beatAlignment: string;
  transitionToNext: string;
}

export interface SilenceDirective {
  cameraMovement: string;
  particleShift: string;
  lightShift: string;
  tensionDirection: 'building' | 'releasing' | 'holding';
}

export interface ClimaxDirective {
  timeRatio: number;
  triggerLine: string;
  maxParticleDensity: number;
  maxLightIntensity: number;
  typographyBehavior: string;
  worldTransformation: string;
}

export interface EndingDirective {
  style: 'linger' | 'fade' | 'snap' | 'dissolve';
  emotionalAftertaste: string;
  particleResolution: string;
  lightResolution: string;
}
