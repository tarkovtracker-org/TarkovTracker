import { describe, expect, it } from 'vitest';
import { buildTarkovDevProfileUrl } from '@/utils/tarkovDevProfileUrl';
describe('buildTarkovDevProfileUrl', () => {
  it('builds a regular profile URL for pvp mode', () => {
    expect(buildTarkovDevProfileUrl(123456, 'pvp')).toBe(
      'https://tarkov.dev/players/regular/123456'
    );
  });
  it('builds a pve profile URL for pve mode', () => {
    expect(buildTarkovDevProfileUrl(123456, 'pve')).toBe('https://tarkov.dev/players/pve/123456');
  });
  it('returns undefined for missing or invalid uid values', () => {
    expect(buildTarkovDevProfileUrl(null, 'pvp')).toBeUndefined();
    expect(buildTarkovDevProfileUrl(-1, 'pve')).toBeUndefined();
    expect(buildTarkovDevProfileUrl(0, 'pve')).toBeUndefined();
    expect(buildTarkovDevProfileUrl(Number.NaN, 'pvp')).toBeUndefined();
    expect(buildTarkovDevProfileUrl(Number.POSITIVE_INFINITY, 'pve')).toBeUndefined();
  });
});
