import { describe, expect, it } from 'vitest';
import { resolveTarkovDevProfileSource } from '@/utils/tarkovDevProfileSource';
describe('resolveTarkovDevProfileSource', () => {
  it('extracts a pvp profile id from a Tarkov.dev player url', () => {
    const result = resolveTarkovDevProfileSource('https://tarkov.dev/players/regular/8560316');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      mode: 'pvp',
      profileJsonUrl: 'https://players.tarkov.dev/profile/8560316.json',
      tarkovUid: 8560316,
    });
  });
  it('extracts a pve profile id from a Tarkov.dev player url', () => {
    const result = resolveTarkovDevProfileSource('https://tarkov.dev/players/pve/8560316');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      mode: 'pve',
      profileJsonUrl: 'https://players.tarkov.dev/pve/8560316.json',
      tarkovUid: 8560316,
    });
  });
  it('accepts the public pvp profile json url', () => {
    const result = resolveTarkovDevProfileSource('https://players.tarkov.dev/profile/8560316.json');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      mode: 'pvp',
      profileJsonUrl: 'https://players.tarkov.dev/profile/8560316.json',
      tarkovUid: 8560316,
    });
  });
  it('accepts the public pve profile json url', () => {
    const result = resolveTarkovDevProfileSource('https://players.tarkov.dev/pve/8560316.json');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      mode: 'pve',
      profileJsonUrl: 'https://players.tarkov.dev/pve/8560316.json',
      tarkovUid: 8560316,
    });
  });
  it('rejects bare profile ids', () => {
    const result = resolveTarkovDevProfileSource('8560316');
    expect(result.ok).toBe(false);
  });
  it('rejects bare profile json filenames', () => {
    const result = resolveTarkovDevProfileSource('8560316.json');
    expect(result.ok).toBe(false);
  });
  it('rejects non-player urls', () => {
    const result = resolveTarkovDevProfileSource('https://example.com/players/regular/8560316');
    expect(result.ok).toBe(false);
  });
  it('rejects missing profile ids', () => {
    const result = resolveTarkovDevProfileSource('https://tarkov.dev/players/regular');
    expect(result.ok).toBe(false);
  });
});
