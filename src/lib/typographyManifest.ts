/**
 * typographyManifest.ts — Single source of truth for all font data.
 *
 * Everything is derived from this file:
 * - AI prompt font library text (generated at build or inline)
 * - Runtime validation list
 * - Preload font names
 * - Pairing rules
 * - Fallback behavior
 *
 * To add a font: add it here AND in index.html's Google Fonts URL.
 */

export interface FontDef {
  name: string;
  cssFamily: string;
  category: 'display' | 'condensed' | 'sans' | 'serif' | 'mono' | 'handwriting';
  weights: number[];
  energy: 'low' | 'medium' | 'high';
  elegance: 'low' | 'medium' | 'high';
  warmth: 'low' | 'medium' | 'high';
  width: 'condensed' | 'normal';
  casePreference: ('uppercase' | 'sentence')[];
  genreFit: string[];
  roles: ('primary' | 'accent' | 'hero')[];
  /** Prose description for the AI prompt — what this font FEELS like */
  vibe: string;
  /** Font categories that pair well as accent alongside this as primary */
  pairingBias: string[];
  /** Specific fonts to NEVER pair with (too visually similar) */
  avoidWith: string[];
}

export const FONT_MANIFEST: FontDef[] = [
  {
    name: 'Bebas Neue',
    cssFamily: '"Bebas Neue", sans-serif',
    category: 'display',
    weights: [400],
    energy: 'high', elegance: 'low', warmth: 'low', width: 'condensed',
    casePreference: ['uppercase'],
    genreFit: ['hip-hop', 'rock', 'trap', 'anthem', 'trailer'],
    roles: ['primary', 'accent'],
    vibe: 'Movie posters. Bold declarations. "I AM HERE." All-caps condensed impact.',
    pairingBias: ['serif', 'mono', 'handwriting'],
    avoidWith: ['Oswald', 'Barlow Condensed'],
  },
  {
    name: 'Permanent Marker',
    cssFamily: '"Permanent Marker", cursive',
    category: 'handwriting',
    weights: [400],
    energy: 'high', elegance: 'low', warmth: 'medium', width: 'normal',
    casePreference: ['sentence', 'uppercase'],
    genreFit: ['punk', 'rock', 'indie', 'spoken-word'],
    roles: ['primary', 'accent'],
    vibe: 'Sharpie on a mirror. Bathroom wall poetry. Protest sign urgency.',
    pairingBias: ['sans', 'mono'],
    avoidWith: ['Caveat'],
  },
  {
    name: 'Unbounded',
    cssFamily: '"Unbounded", sans-serif',
    category: 'display',
    weights: [400, 700, 900],
    energy: 'high', elegance: 'medium', warmth: 'low', width: 'normal',
    casePreference: ['uppercase', 'sentence'],
    genreFit: ['electronic', 'hyperpop', 'futuristic', 'experimental'],
    roles: ['primary', 'accent'],
    vibe: 'Geometric blob display. Album cover energy. Futuristic weight.',
    pairingBias: ['serif', 'mono'],
    avoidWith: ['Dela Gothic One'],
  },
  {
    name: 'Dela Gothic One',
    cssFamily: '"Dela Gothic One", sans-serif',
    category: 'display',
    weights: [400],
    energy: 'high', elegance: 'low', warmth: 'low', width: 'normal',
    casePreference: ['uppercase'],
    genreFit: ['metal', 'dark-trap', 'gothic', 'industrial'],
    roles: ['primary', 'accent'],
    vibe: 'Heavy blackletter energy. Gothic weight. Dark anthems.',
    pairingBias: ['serif', 'mono', 'sans'],
    avoidWith: ['Unbounded'],
  },
  {
    name: 'Oswald',
    cssFamily: '"Oswald", sans-serif',
    category: 'condensed',
    weights: [400, 700],
    energy: 'high', elegance: 'low', warmth: 'low', width: 'condensed',
    casePreference: ['uppercase'],
    genreFit: ['hip-hop', 'news', 'editorial', 'sport'],
    roles: ['primary'],
    vibe: 'Tall and tight. News tickers. Campaign posters. Authority with edge.',
    pairingBias: ['serif', 'handwriting'],
    avoidWith: ['Bebas Neue', 'Barlow Condensed'],
  },
  {
    name: 'Barlow Condensed',
    cssFamily: '"Barlow Condensed", sans-serif',
    category: 'condensed',
    weights: [400, 600, 800],
    energy: 'high', elegance: 'low', warmth: 'low', width: 'condensed',
    casePreference: ['uppercase'],
    genreFit: ['industrial', 'electronic', 'techno'],
    roles: ['primary'],
    vibe: 'Industrial precision. Blueprint energy. Clean but forceful.',
    pairingBias: ['serif', 'handwriting'],
    avoidWith: ['Oswald', 'Bebas Neue'],
  },
  {
    name: 'Archivo',
    cssFamily: '"Archivo", sans-serif',
    category: 'condensed',
    weights: [400, 600, 700, 800],
    energy: 'high', elegance: 'low', warmth: 'low', width: 'normal',
    casePreference: ['uppercase', 'sentence'],
    genreFit: ['rap', 'grime', 'drill', 'tech'],
    roles: ['primary'],
    vibe: 'Geometric muscle. Tech-forward power. Modern impact.',
    pairingBias: ['serif', 'handwriting'],
    avoidWith: [],
  },
  {
    name: 'Montserrat',
    cssFamily: '"Montserrat", sans-serif',
    category: 'sans',
    weights: [400, 600, 700, 800],
    energy: 'medium', elegance: 'medium', warmth: 'medium', width: 'normal',
    casePreference: ['sentence', 'uppercase'],
    genreFit: ['pop', 'general'],
    roles: ['primary'],
    vibe: 'The reliable workhorse. Use ONLY when nothing else fits. Safe but forgettable.',
    pairingBias: ['serif', 'display'],
    avoidWith: ['Inter', 'Sora'],
  },
  {
    name: 'Inter',
    cssFamily: '"Inter", sans-serif',
    category: 'sans',
    weights: [300, 400, 700],
    energy: 'medium', elegance: 'medium', warmth: 'low', width: 'normal',
    casePreference: ['sentence'],
    genreFit: ['indie', 'ambient', 'minimal'],
    roles: ['primary'],
    vibe: 'Invisible design. Let the words speak. For when the song IS the typography.',
    pairingBias: ['serif', 'display'],
    avoidWith: ['Montserrat', 'Sora'],
  },
  {
    name: 'Sora',
    cssFamily: '"Sora", sans-serif',
    category: 'sans',
    weights: [400, 600, 700],
    energy: 'medium', elegance: 'medium', warmth: 'low', width: 'normal',
    casePreference: ['sentence', 'uppercase'],
    genreFit: ['k-pop', 'j-pop', 'synth-pop', 'new-gen'],
    roles: ['primary'],
    vibe: 'Soft-edged modern. Approachable but intentional. New-gen energy.',
    pairingBias: ['serif', 'display'],
    avoidWith: ['Inter', 'Montserrat'],
  },
  {
    name: 'Rubik',
    cssFamily: '"Rubik", sans-serif',
    category: 'sans',
    weights: [400, 500, 700],
    energy: 'medium', elegance: 'low', warmth: 'high', width: 'normal',
    casePreference: ['sentence'],
    genreFit: ['pop', 'funk', 'afrobeat'],
    roles: ['primary'],
    vibe: 'Rounded corners. Friendly weight. Warmth without softness.',
    pairingBias: ['serif', 'display', 'condensed'],
    avoidWith: ['Nunito'],
  },
  {
    name: 'Nunito',
    cssFamily: '"Nunito", sans-serif',
    category: 'sans',
    weights: [400, 600],
    energy: 'low', elegance: 'low', warmth: 'high', width: 'normal',
    casePreference: ['sentence'],
    genreFit: ['lullaby', 'children', 'gentle', 'acoustic'],
    roles: ['primary'],
    vibe: 'Pillowy soft. Gentle confessions. Safe spaces.',
    pairingBias: ['serif'],
    avoidWith: ['Rubik'],
  },
  {
    name: 'Plus Jakarta Sans',
    cssFamily: '"Plus Jakarta Sans", sans-serif',
    category: 'sans',
    weights: [400, 600, 800],
    energy: 'medium', elegance: 'medium', warmth: 'medium', width: 'normal',
    casePreference: ['sentence'],
    genreFit: ['r-and-b', 'neo-soul', 'contemporary'],
    roles: ['primary'],
    vibe: 'Contemporary warmth. Approachable sophistication. The new default.',
    pairingBias: ['serif', 'display'],
    avoidWith: ['Montserrat'],
  },
  {
    name: 'Bricolage Grotesque',
    cssFamily: '"Bricolage Grotesque", sans-serif',
    category: 'sans',
    weights: [400, 700, 800],
    energy: 'medium', elegance: 'low', warmth: 'medium', width: 'normal',
    casePreference: ['sentence'],
    genreFit: ['indie', 'alternative', 'art-pop'],
    roles: ['primary'],
    vibe: 'Quirky proportions. Indie character. Not trying to be perfect.',
    pairingBias: ['serif', 'display'],
    avoidWith: [],
  },
  {
    name: 'Playfair Display',
    cssFamily: '"Playfair Display", serif',
    category: 'serif',
    weights: [400, 500, 700],
    energy: 'medium', elegance: 'high', warmth: 'medium', width: 'normal',
    casePreference: ['sentence'],
    genreFit: ['r-and-b', 'soul', 'jazz', 'cinematic'],
    roles: ['primary', 'accent'],
    vibe: 'High contrast editorial. Magazine covers. Dramatic entrances.',
    pairingBias: ['sans', 'condensed'],
    avoidWith: ['DM Serif Display'],
  },
  {
    name: 'EB Garamond',
    cssFamily: '"EB Garamond", serif',
    category: 'serif',
    weights: [400, 600, 700],
    energy: 'low', elegance: 'high', warmth: 'high', width: 'normal',
    casePreference: ['sentence'],
    genreFit: ['folk', 'classical', 'singer-songwriter', 'poetry'],
    roles: ['primary', 'accent'],
    vibe: 'Classical literary. Letters never sent. Old soul in young body.',
    pairingBias: ['sans', 'condensed'],
    avoidWith: ['Cormorant Garamond'],
  },
  {
    name: 'Cormorant Garamond',
    cssFamily: '"Cormorant Garamond", serif',
    category: 'serif',
    weights: [400, 600],
    energy: 'low', elegance: 'high', warmth: 'medium', width: 'normal',
    casePreference: ['sentence'],
    genreFit: ['orchestral', 'ambient', 'art-song', 'film-score'],
    roles: ['primary', 'accent'],
    vibe: 'Thin and tall. Whispered elegance. French cinema titles.',
    pairingBias: ['sans', 'display'],
    avoidWith: ['EB Garamond'],
  },
  {
    name: 'DM Serif Display',
    cssFamily: '"DM Serif Display", serif',
    category: 'serif',
    weights: [400],
    energy: 'medium', elegance: 'high', warmth: 'high', width: 'normal',
    casePreference: ['sentence'],
    genreFit: ['soul', 'gospel', 'r-and-b', 'blues'],
    roles: ['primary', 'accent'],
    vibe: 'Warm editorial display. Magazine feature headlines. Confident elegance.',
    pairingBias: ['sans', 'condensed'],
    avoidWith: ['Playfair Display'],
  },
  {
    name: 'Instrument Serif',
    cssFamily: '"Instrument Serif", serif',
    category: 'serif',
    weights: [400],
    energy: 'low', elegance: 'high', warmth: 'medium', width: 'normal',
    casePreference: ['sentence'],
    genreFit: ['classical', 'chamber', 'art-song', 'poetry'],
    roles: ['primary', 'accent'],
    vibe: 'Fine Italian typesetting. Refined. For songs that are poetry.',
    pairingBias: ['sans', 'mono'],
    avoidWith: ['Cormorant Garamond'],
  },
  {
    name: 'Bitter',
    cssFamily: '"Bitter", serif',
    category: 'serif',
    weights: [400, 700],
    energy: 'medium', elegance: 'medium', warmth: 'high', width: 'normal',
    casePreference: ['sentence'],
    genreFit: ['country', 'americana', 'folk-rock'],
    roles: ['primary'],
    vibe: 'Slab serif warmth. Grounded. Journalism meets storytelling.',
    pairingBias: ['sans', 'condensed'],
    avoidWith: [],
  },
  {
    name: 'JetBrains Mono',
    cssFamily: '"JetBrains Mono", monospace',
    category: 'mono',
    weights: [400, 500, 700],
    energy: 'low', elegance: 'low', warmth: 'low', width: 'normal',
    casePreference: ['uppercase', 'sentence'],
    genreFit: ['electronic', 'glitch', 'techno', 'cyberpunk'],
    roles: ['primary', 'accent'],
    vibe: 'Hacker aesthetic. System messages. The machine speaks.',
    pairingBias: ['serif', 'display'],
    avoidWith: ['Space Mono'],
  },
  {
    name: 'Space Mono',
    cssFamily: '"Space Mono", monospace',
    category: 'mono',
    weights: [400, 700],
    energy: 'medium', elegance: 'low', warmth: 'low', width: 'normal',
    casePreference: ['uppercase'],
    genreFit: ['retro-wave', 'synthwave', 'sci-fi', 'analog'],
    roles: ['primary', 'accent'],
    vibe: 'Retro-futuristic. NASA mission control. Analog sci-fi.',
    pairingBias: ['serif', 'display'],
    avoidWith: ['JetBrains Mono'],
  },
  {
    name: 'Caveat',
    cssFamily: '"Caveat", cursive',
    category: 'handwriting',
    weights: [400, 700],
    energy: 'low', elegance: 'low', warmth: 'high', width: 'normal',
    casePreference: ['sentence'],
    genreFit: ['singer-songwriter', 'diary', 'confessional', 'indie-folk'],
    roles: ['primary', 'accent'],
    vibe: 'Journal entry. Diary confessions. Notes passed in class.',
    pairingBias: ['sans', 'serif'],
    avoidWith: ['Permanent Marker'],
  },
  {
    name: 'Lexend',
    cssFamily: '"Lexend", sans-serif',
    category: 'sans',
    weights: [300, 400, 700],
    energy: 'low', elegance: 'medium', warmth: 'high', width: 'normal',
    casePreference: ['sentence'],
    genreFit: ['lo-fi', 'chill', 'ambient', 'meditation'],
    roles: ['primary'],
    vibe: 'Designed for readability. Open and breathing. Calm clarity.',
    pairingBias: ['serif', 'display'],
    avoidWith: ['Nunito'],
  },
];

export const VALID_FONT_NAMES = FONT_MANIFEST.map(f => f.name);

export function findFont(name: string): FontDef | undefined {
  return FONT_MANIFEST.find(f => f.name.toLowerCase() === name.trim().toLowerCase());
}

export function generatePromptFontLibrary(): string {
  const byCategory: Record<string, FontDef[]> = {};
  for (const f of FONT_MANIFEST) {
    const cat = f.category.toUpperCase();
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(f);
  }

  const lines: string[] = ['FONT LIBRARY — pick from these exact names:\n'];
  const categoryOrder = ['DISPLAY', 'CONDENSED', 'SANS', 'SERIF', 'MONO', 'HANDWRITING'];
  for (const cat of categoryOrder) {
    const fonts = byCategory[cat];
    if (!fonts?.length) continue;
    lines.push(`${cat}:`);
    for (const f of fonts) {
      lines.push(`  ${f.name} — ${f.vibe}`);
      lines.push(`    genre fit: ${f.genreFit.join(', ')}`);
      lines.push(`    energy: ${f.energy} | elegance: ${f.elegance} | case: ${f.casePreference.join('/')}`);
      lines.push(`    avoid pairing with: ${f.avoidWith.length ? f.avoidWith.join(', ') : 'none'}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function isValidPair(primary: FontDef, accent: FontDef): boolean {
  if (primary.name === accent.name) return false;
  if (primary.category === accent.category && primary.width === accent.width) return false;
  if (primary.avoidWith.includes(accent.name)) return false;
  if (accent.avoidWith.includes(primary.name)) return false;
  return true;
}

export function pairingContrastScore(primary: FontDef, accent: FontDef): number {
  let score = 0;
  if (primary.category !== accent.category) score += 3;
  if (primary.width !== accent.width) score += 1;
  if (primary.energy !== accent.energy) score += 1;
  if (primary.elegance !== accent.elegance) score += 1;
  if (primary.warmth !== accent.warmth) score += 1;
  const isCross = (primary.category === 'serif' && ['sans', 'condensed', 'display', 'mono'].includes(accent.category))
    || (['sans', 'condensed', 'display', 'mono'].includes(primary.category) && accent.category === 'serif');
  if (isCross) score += 2;
  return score;
}

export function findBestAccent(primary: FontDef): FontDef | null {
  const candidates = FONT_MANIFEST
    .filter(f => f.roles.includes('accent') && isValidPair(primary, f))
    .map(f => ({ font: f, score: pairingContrastScore(primary, f) }))
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.font ?? null;
}
