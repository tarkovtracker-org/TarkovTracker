import { describe, expect, it } from 'vitest';
import {
  getLegacyModeProgressField,
  resolveModeProgressData,
  summarizeModeProgressData,
} from '@/utils/modeProgressFallback';
describe('mode progress fallback', () => {
  const legacy = {
    pve_data: { displayName: 'Legacy PvE', level: 28, taskCompletions: {} },
    pvp_data: {
      displayName: 'Legacy PvP',
      level: 42,
      taskCompletions: {
        complete: { complete: true },
        failed: { complete: true, failed: true },
        pending: { complete: false },
      },
    },
  };
  it('prefers a normalized persistent-mode row over legacy data', () => {
    const normalized = { displayName: 'Normalized', level: 50 };
    expect(resolveModeProgressData('pvp', normalized, legacy)).toBe(normalized);
  });
  it('falls back to the matching legacy persistent-mode field', () => {
    expect(resolveModeProgressData('pvp', null, legacy)).toBe(legacy.pvp_data);
    expect(resolveModeProgressData('pve', undefined, legacy)).toBe(legacy.pve_data);
  });
  it('never falls back Seasonal progress to persistent PvP', () => {
    expect(resolveModeProgressData('seasonal', null, legacy)).toBeNull();
  });
  it('treats an unmaterialized normalized row as absent', () => {
    const placeholder = { taskCompletions: {} };
    expect(resolveModeProgressData('pvp', placeholder, legacy)).toBe(legacy.pvp_data);
  });
  it('keeps an unmaterialized normalized row when legacy is also unmaterialized', () => {
    const placeholder: Record<string, unknown> = { taskCompletions: {} };
    expect(resolveModeProgressData('pvp', placeholder, { pvp_data: {} })).toBe(placeholder);
  });
  it('keeps an unmaterialized Seasonal row instead of reading legacy', () => {
    const placeholder = { taskCompletions: {} };
    expect(resolveModeProgressData('seasonal', placeholder, legacy)).toBe(placeholder);
  });
  it('selects only the legacy column for a persistent mode', () => {
    expect(getLegacyModeProgressField('pvp')).toBe('pvp_data');
    expect(getLegacyModeProgressField('pve')).toBe('pve_data');
    expect(getLegacyModeProgressField('seasonal')).toBeNull();
  });
  it('summarizes fallback progress without exposing the blob', () => {
    expect(summarizeModeProgressData(legacy.pvp_data)).toEqual({
      display_name: 'Legacy PvP',
      level: 42,
      tasks_completed: 2,
    });
  });
  it('counts legacy boolean task completions', () => {
    expect(
      summarizeModeProgressData({
        displayName: 'Boolean Legacy',
        level: 12,
        taskCompletions: { a: true, b: false, c: { complete: true }, d: 'nope' },
      })
    ).toEqual({ display_name: 'Boolean Legacy', level: 12, tasks_completed: 2 });
  });
});
