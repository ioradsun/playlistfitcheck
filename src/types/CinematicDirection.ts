export interface CinematicDirection {
  thesis: string;
  visualWorld: VisualWorld;
  chapters: Chapter[];
  wordDirectives: Record<string, WordDirective>;
  storyboard: LineDirection[];
  silenceDirective: SilenceDirective;
  climax: ClimaxDirective;
  ending: EndingDirective;
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
