import { describe, expect, it } from 'vitest';
import { validateGameMode } from '@/server/utils/tarkov-cache-config';
describe('validateGameMode', () => {
  it('returns valid game mode values', () => {
    expect(validateGameMode('regular')).toBe('regular');
    expect(validateGameMode('pve')).toBe('pve');
    expect(validateGameMode('pvp-season')).toBe('pvp-season');
  });
  it('normalizes case and whitespace', () => {
    expect(validateGameMode('  PvE  ')).toBe('pve');
  });
  it('uses the first query value when game mode is provided as an array', () => {
    expect(validateGameMode(['pve', 'regular'])).toBe('pve');
  });
  it('falls back to regular for invalid or non-string values', () => {
    expect(validateGameMode('arena')).toBe('regular');
    expect(validateGameMode('   ')).toBe('regular');
    expect(validateGameMode(undefined)).toBe('regular');
    expect(validateGameMode(['', 'pve'])).toBe('regular');
    expect(validateGameMode({ gameMode: 'pve' })).toBe('regular');
  });
});
