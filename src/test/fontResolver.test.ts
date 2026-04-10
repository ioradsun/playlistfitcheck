import { describe, expect, it } from 'vitest';
import { resolveTypographyFromDirection } from '@/lib/fontResolver';

const V2_CHARACTERS = [
  'hard-rap',
  'hype-anthem',
  'punk-energy',
  'electronic-drive',
  'melodic-rap',
  'pop-hook',
  'indie-float',
  'afro-groove',
  'slow-romantic-rnb',
  'acoustic-bare',
  'dark-mood',
  'ambient-drift',
  'spoken-word',
  'gospel-soul',
  'lo-fi-chill',
] as const;

describe('fontResolver character-first resolution', () => {
  it('does not return Montserrat for hard-rap v2 directions', () => {
    const resolved = resolveTypographyFromDirection({ character: 'hard-rap', world: 'dark alley' });
    expect(resolved._meta.source).toBe('character');
    expect(resolved._meta.primaryFont).not.toBe('Montserrat');
  });

  it('returns broad font variety across all v2 characters', () => {
    const resolvedFonts = V2_CHARACTERS.map((character, idx) =>
      resolveTypographyFromDirection({ character, world: `world-${idx}` })._meta.primaryFont,
    );

    const uniqueFonts = new Set(resolvedFonts);
    expect(uniqueFonts.size).toBeGreaterThanOrEqual(10);
  });

  it('keeps resolving legacy cached typographyPlan data via resolveFromPlan fallback', () => {
    const resolved = resolveTypographyFromDirection({
      typographyPlan: {
        system: 'single',
        primary: 'Inter',
        baseWeight: 'regular',
        case: 'none',
        accentDensity: 'low',
      },
    });

    expect(resolved._meta.source).toBe('plan');
    expect(resolved._meta.primaryFont).toBe('Inter');
  });
});
