import { describe, expect, it } from 'vitest';
import { API_SUPPORTED_LANGUAGES } from '@/utils/constants';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
import { compareOverlayFleet } from '@@/scripts/precompute/verify-overlay';
const now = Date.parse('2026-09-07T12:00:00Z');
const entries = API_SUPPORTED_LANGUAGES.flatMap(lang => VALID_GAME_MODES.map(gameMode => ({ lang, gameMode, overlay: { sha256: 'published' } })));
describe('overlay fleet verification', () => {
  it('requires provenance for every supported language and mode', () => {
    const rows = compareOverlayFleet({ sha256: 'published' }, { completedAt: now, entries }, entries, now);
    expect(rows).toHaveLength(48);
    expect(rows.every(row => row.status === 'current')).toBe(true);
    expect(compareOverlayFleet({ sha256: 'published' }, null, entries, now).every(row => row.status === 'unverified')).toBe(true);
  });
  it('allows bounded propagation and reports drift after the window', () => {
    const stale = entries.map(entry => ({ ...entry, overlay: { sha256: 'old' } }));
    const published = { sha256: 'published', generated: new Date(now).toISOString() };
    expect(compareOverlayFleet(published, { completedAt: now, entries }, stale, now).every(row => row.status === 'propagating')).toBe(true);
    expect(compareOverlayFleet(published, { completedAt: now, entries }, stale, now + 14 * 60 * 60 * 1000 + 1).every(row => row.status === 'drift')).toBe(true);
  });
});
