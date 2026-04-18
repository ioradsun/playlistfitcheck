import { describe, expect, it } from 'vitest';
import { resolveTypographyFromDirection } from '@/lib/fontResolver';

describe('fontResolver plan-based resolution', () => {
  it('resolves a valid typographyPlan and reports source = plan', () => {
    const resolved = resolveTypographyFromDirection({
      typographyPlan: {
        system: 'single',
        primary: 'Inter',
        baseWeight: 'regular',
        case: 'none',
        heroStyle: 'weight-shift',
        accentDensity: 'low',
      },
    });

    expect(resolved._meta.source).toBe('plan');
    expect(resolved._meta.primaryFont).toBe('Inter');
  });

  it('repairs an unknown font and marks the result as plan-repaired', () => {
    const resolved = resolveTypographyFromDirection({
      typographyPlan: {
        system: 'single',
        primary: 'NotARealFont-XYZ',
        baseWeight: 'bold',
        case: 'uppercase',
        heroStyle: 'weight-shift',
        accentDensity: 'medium',
      },
    });

    expect(resolved._meta.source).toBe('plan-repaired');
    expect(resolved._meta.repaired).toBe(true);
  });

  it('falls back to safe defaults when no typographyPlan is provided', () => {
    const resolved = resolveTypographyFromDirection({});
    expect(resolved._meta.source).toBe('fallback');
    expect(resolved._meta.primaryFont).toBe('Montserrat');
  });
});
