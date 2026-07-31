// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getImportCooldownRemainingMs,
  recordImportCompletion,
} from '@/utils/tarkovDevImportCooldown';
const STORAGE_KEY = 'tarkovtracker:tarkov-dev-import-cooldowns';
const HOUR_MS = 3_600_000;
describe('tarkovDevImportCooldown', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  it('reports no cooldown when nothing has been imported', () => {
    expect(getImportCooldownRemainingMs(8560316, 'pvp', HOUR_MS)).toBe(0);
  });
  it('tracks the remaining cooldown per profile and mode', () => {
    const now = 1_800_000_000_000;
    recordImportCompletion(8560316, 'pvp', now);
    expect(getImportCooldownRemainingMs(8560316, 'pvp', HOUR_MS, now + 15 * 60_000)).toBe(
      45 * 60_000
    );
    expect(getImportCooldownRemainingMs(8560316, 'pve', HOUR_MS, now + 15 * 60_000)).toBe(0);
    expect(getImportCooldownRemainingMs(999, 'pvp', HOUR_MS, now + 15 * 60_000)).toBe(0);
  });
  it('expires the cooldown after the window elapses', () => {
    const now = 1_800_000_000_000;
    recordImportCompletion(8560316, 'pvp', now);
    expect(getImportCooldownRemainingMs(8560316, 'pvp', HOUR_MS, now + HOUR_MS + 1)).toBe(0);
  });
  it('treats a disabled cooldown as always available', () => {
    recordImportCompletion(8560316, 'pvp');
    expect(getImportCooldownRemainingMs(8560316, 'pvp', 0)).toBe(0);
  });
  it('prunes stale entries when recording a new import', () => {
    const now = 1_800_000_000_000;
    recordImportCompletion(111, 'pvp', now - 25 * HOUR_MS);
    recordImportCompletion(222, 'pvp', now);
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<
      string,
      number
    >;
    expect(stored['pvp:111']).toBeUndefined();
    expect(stored['pvp:222']).toBe(now);
  });
  it('survives corrupted storage payloads', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    expect(getImportCooldownRemainingMs(8560316, 'pvp', HOUR_MS)).toBe(0);
    recordImportCompletion(8560316, 'pvp');
    expect(getImportCooldownRemainingMs(8560316, 'pvp', HOUR_MS)).toBeGreaterThan(0);
  });
});
