export type SceneId =
  | 'midnight-city'
  | 'golden-hour'
  | 'neon-rain'
  | 'desert-dusk'
  | 'ocean-night'
  | 'studio-dark'
  | 'forest-dawn'
  | 'rooftop-sunset'
  | 'club-interior'
  | 'snow-field'
  | 'church-light'
  | 'highway-night';

export interface SceneContext {
  scene: SceneId;
  label: string;
  emoji: string;
  timeOfDay: 'night' | 'golden-hour' | 'dawn' | 'dusk' | 'midday' | 'any';
  baseLuminance: 'dark' | 'medium' | 'light';
  colorTemperature: 'cold' | 'warm' | 'neutral';
  textStyle: 'light' | 'dark';
  backgroundOpacity: number;
  crushOpacity: number;
  fluxPromptSuffix: string;
}

export interface SceneContextResult {
  baseLuminance: 'light' | 'dark' | 'medium';
  colorTemperature: 'warm' | 'cool' | 'neutral';
  timeOfDay: 'dawn' | 'morning' | 'afternoon' | 'dusk' | 'night';
  backgroundOpacity: number;
  crushOpacity: number;
  textStyle: 'light' | 'dark';
  fluxPromptSuffix: string;
  moodSummary: string;
  sourceDescription: string;
}

export const SCENE_CONTEXTS: Record<SceneId, SceneContext> = {
  'midnight-city': {
    scene: 'midnight-city',
    label: 'Midnight City',
    emoji: '🌃',
    timeOfDay: 'night',
    baseLuminance: 'dark',
    colorTemperature: 'cold',
    textStyle: 'light',
    backgroundOpacity: 0.32,
    crushOpacity: 0.72,
    fluxPromptSuffix: 'dark urban nightscape, city lights in distance, deep shadows, neon reflections on wet pavement',
  },
  'golden-hour': {
    scene: 'golden-hour',
    label: 'Golden Hour',
    emoji: '🌅',
    timeOfDay: 'golden-hour',
    baseLuminance: 'light',
    colorTemperature: 'warm',
    textStyle: 'dark',
    backgroundOpacity: 0.40,
    crushOpacity: 0.45,
    fluxPromptSuffix: 'golden hour warm light, sun low on horizon, amber haze, soft lens flare, luminous atmosphere',
  },
  'neon-rain': {
    scene: 'neon-rain',
    label: 'Neon Rain',
    emoji: '🌧️',
    timeOfDay: 'night',
    baseLuminance: 'dark',
    colorTemperature: 'cold',
    textStyle: 'light',
    backgroundOpacity: 0.35,
    crushOpacity: 0.70,
    fluxPromptSuffix: 'neon-lit rain-soaked streets, pink and blue reflections, cyberpunk atmosphere, wet surfaces',
  },
  'desert-dusk': {
    scene: 'desert-dusk',
    label: 'Desert Dusk',
    emoji: '🏜️',
    timeOfDay: 'dusk',
    baseLuminance: 'medium',
    colorTemperature: 'warm',
    textStyle: 'light',
    backgroundOpacity: 0.38,
    crushOpacity: 0.55,
    fluxPromptSuffix: 'desert landscape at dusk, burnt orange sky, vast empty horizon, dusty warm atmosphere',
  },
  'ocean-night': {
    scene: 'ocean-night',
    label: 'Ocean Night',
    emoji: '🌊',
    timeOfDay: 'night',
    baseLuminance: 'dark',
    colorTemperature: 'cold',
    textStyle: 'light',
    backgroundOpacity: 0.30,
    crushOpacity: 0.75,
    fluxPromptSuffix: 'dark ocean at night, moonlit waves, deep blue and black, endless water horizon',
  },
  'studio-dark': {
    scene: 'studio-dark',
    label: 'Studio Dark',
    emoji: '🎙️',
    timeOfDay: 'any',
    baseLuminance: 'dark',
    colorTemperature: 'neutral',
    textStyle: 'light',
    backgroundOpacity: 0.25,
    crushOpacity: 0.80,
    fluxPromptSuffix: 'dark recording studio, minimal light, isolated spotlight, deep black environment',
  },
  'forest-dawn': {
    scene: 'forest-dawn',
    label: 'Forest Dawn',
    emoji: '🌲',
    timeOfDay: 'dawn',
    baseLuminance: 'medium',
    colorTemperature: 'warm',
    textStyle: 'light',
    backgroundOpacity: 0.36,
    crushOpacity: 0.58,
    fluxPromptSuffix: 'misty forest at dawn, light filtering through trees, soft green and gold tones, ethereal fog',
  },
  'rooftop-sunset': {
    scene: 'rooftop-sunset',
    label: 'Rooftop Sunset',
    emoji: '🏙️',
    timeOfDay: 'golden-hour',
    baseLuminance: 'medium',
    colorTemperature: 'warm',
    textStyle: 'dark',
    backgroundOpacity: 0.38,
    crushOpacity: 0.50,
    fluxPromptSuffix: 'rooftop view at sunset, city skyline silhouette, warm orange and purple sky, urban warmth',
  },
  'club-interior': {
    scene: 'club-interior',
    label: 'Club Interior',
    emoji: '🪩',
    timeOfDay: 'night',
    baseLuminance: 'dark',
    colorTemperature: 'warm',
    textStyle: 'light',
    backgroundOpacity: 0.30,
    crushOpacity: 0.72,
    fluxPromptSuffix: 'dark club interior, laser beams, smoke machine haze, colored spotlights, intimate atmosphere',
  },
  'snow-field': {
    scene: 'snow-field',
    label: 'Snow Field',
    emoji: '❄️',
    timeOfDay: 'midday',
    baseLuminance: 'light',
    colorTemperature: 'cold',
    textStyle: 'dark',
    backgroundOpacity: 0.42,
    crushOpacity: 0.40,
    fluxPromptSuffix: 'vast white snow field, overcast sky, cold blue-white tones, bright diffused light, minimal',
  },
  'church-light': {
    scene: 'church-light',
    label: 'Church Light',
    emoji: '⛪',
    timeOfDay: 'midday',
    baseLuminance: 'medium',
    colorTemperature: 'warm',
    textStyle: 'dark',
    backgroundOpacity: 0.36,
    crushOpacity: 0.50,
    fluxPromptSuffix: 'stained glass light streaming through cathedral, warm divine rays, dust particles in light beams',
  },
  'highway-night': {
    scene: 'highway-night',
    label: 'Highway Night',
    emoji: '🛣️',
    timeOfDay: 'night',
    baseLuminance: 'dark',
    colorTemperature: 'neutral',
    textStyle: 'light',
    backgroundOpacity: 0.32,
    crushOpacity: 0.72,
    fluxPromptSuffix: 'empty highway at night, long exposure tail lights, dark asphalt stretching to horizon, isolation',
  },
};
