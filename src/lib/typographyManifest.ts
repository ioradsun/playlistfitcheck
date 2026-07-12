/**
 * typographyManifest.ts — Browser-side typed view over the single-source
 * font data at supabase/functions/_shared/fontManifest.data.json.
 *
 * That JSON file is the ONLY place to add/edit fonts. Both this module
 * (browser/Vite) and supabase/functions/_shared/fontManifest.ts (edge/Deno)
 * import from it, so there is no longer a second copy to keep in sync.
 *
 * When adding a font: edit the JSON AND index.html's Google Fonts URL.
 */

import rawManifest from '../../supabase/functions/_shared/fontManifest.data.json';

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
  /** Prose description for UI copy — what this font FEELS like. */
  vibe: string;
  /** Short label used by the edge AI prompt. */
  promptVibe: string;
}

export const FONT_MANIFEST: FontDef[] = rawManifest as FontDef[];

export function findFont(name: string): FontDef | undefined {
  return FONT_MANIFEST.find(f => f.name.toLowerCase() === name.trim().toLowerCase());
}
