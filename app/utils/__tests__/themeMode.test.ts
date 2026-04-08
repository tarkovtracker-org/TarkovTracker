// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
import {
  buildThemeBootstrapScript,
  getThemeModeFromBootstrapState,
  isThemeMode,
  normalizeThemeMode,
  THEME_MODES,
} from '@/utils/themeMode';
const runThemeBootstrapScript = () => {
  const script = buildThemeBootstrapScript([
    STORAGE_KEYS.preferences,
    LEGACY_STORAGE_KEYS.preferences,
  ]);
  new Function(script)();
};
describe('themeMode utilities', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = '';
  });
  it('exports the supported theme mode tuple', () => {
    expect(THEME_MODES).toEqual(['dark', 'light']);
  });
  it('detects valid theme modes', () => {
    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('system')).toBe(false);
  });
  it('normalizes valid theme modes', () => {
    expect(normalizeThemeMode('dark')).toBe('dark');
    expect(normalizeThemeMode('light')).toBe('light');
    expect(normalizeThemeMode('sepia')).toBeNull();
    expect(normalizeThemeMode(undefined)).toBeNull();
  });
  it('reads theme mode from bootstrap preferences state', () => {
    expect(getThemeModeFromBootstrapState({ themeMode: 'light' })).toBe('light');
    expect(getThemeModeFromBootstrapState({ themeMode: 'invalid' })).toBeNull();
  });
  it('applies a legacy stored theme mode before app startup', () => {
    localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ themeMode: 'light' }));
    runThemeBootstrapScript();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
  it('applies a matching user-scoped stored theme mode when an auth session exists', () => {
    localStorage.setItem(
      'sb-test-auth-token',
      JSON.stringify({
        currentSession: {
          user: { id: 'user-1' },
        },
      })
    );
    localStorage.setItem(
      STORAGE_KEYS.preferences,
      JSON.stringify({
        _userId: 'user-1',
        data: { themeMode: 'light' },
      })
    );
    runThemeBootstrapScript();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
  it('ignores scoped theme modes for a different or missing user session', () => {
    localStorage.setItem(
      STORAGE_KEYS.preferences,
      JSON.stringify({
        _userId: 'user-1',
        data: { themeMode: 'light' },
      })
    );
    runThemeBootstrapScript();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.style.colorScheme).toBe('');
  });
});
