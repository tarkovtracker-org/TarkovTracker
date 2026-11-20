import { validatePrecomputeFilter } from '@@/scripts/precompute/precompute';
import { describe, expect, it } from 'vitest';
describe('validatePrecomputeFilter', () => {
  it('accepts an empty filter and supported values', () => {
    expect(validatePrecomputeFilter({})).toBeNull();
    expect(validatePrecomputeFilter({ lang: 'en' })).toBeNull();
    expect(validatePrecomputeFilter({ gameMode: 'pve' })).toBeNull();
    expect(validatePrecomputeFilter({ gameMode: 'pvp-season' })).toBeNull();
    expect(validatePrecomputeFilter({ gameMode: 'regular', lang: 'en' })).toBeNull();
  });
  it('rejects unsupported lang and gameMode values', () => {
    expect(validatePrecomputeFilter({ gameMode: 'regular', lang: 'de' })).toContain(
      'English import'
    );
    expect(validatePrecomputeFilter({ lang: 'xx' })).toContain('Unsupported lang "xx"');
    expect(validatePrecomputeFilter({ gameMode: 'arena' })).toContain(
      'Unsupported gameMode "arena"'
    );
  });
});
