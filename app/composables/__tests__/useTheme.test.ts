import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTheme } from '@/composables/useTheme';
import { THEME_STORAGE_KEY } from '@/utils/theme';
import { installThrowingStorageStub } from '#tests/test-helpers/storageStub';
describe('useTheme', () => {
  let restoreStorage: (() => void) | undefined;
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    clearNuxtState(['theme-mode', 'theme-hydrated']);
  });
  afterEach(() => {
    restoreStorage?.();
    restoreStorage = undefined;
    vi.restoreAllMocks();
  });
  it('defaults to dark when nothing is persisted', () => {
    const { themeMode, isLightTheme } = useTheme();
    expect(themeMode.value).toBe('dark');
    expect(isLightTheme.value).toBe(false);
  });
  it('hydrates from the persisted mode', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const { themeMode, isLightTheme } = useTheme();
    expect(themeMode.value).toBe('light');
    expect(isLightTheme.value).toBe(true);
  });
  it('setThemeMode persists and applies the mode', () => {
    const { themeMode, setThemeMode } = useTheme();
    setThemeMode('light');
    expect(themeMode.value).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
  it('toggleThemeMode flips between dark and light', () => {
    const { themeMode, toggleThemeMode } = useTheme();
    expect(themeMode.value).toBe('dark');
    toggleThemeMode();
    expect(themeMode.value).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    toggleThemeMode();
    expect(themeMode.value).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
  it('restores persisted mode on client when hydrated with dark SSR state', () => {
    useState('theme-mode', () => 'dark');
    useState('theme-hydrated', () => false);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const { themeMode, isLightTheme } = useTheme();
    expect(themeMode.value).toBe('light');
    expect(isLightTheme.value).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
  it('skips hydration re-read when already marked as hydrated', () => {
    useState('theme-mode', () => 'dark');
    useState('theme-hydrated', () => true);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const { themeMode, isLightTheme } = useTheme();
    expect(themeMode.value).toBe('dark');
    expect(isLightTheme.value).toBe(false);
  });
  it('preserves in-memory mode across multiple useTheme calls when storage is unavailable', () => {
    const { setThemeMode } = useTheme();
    restoreStorage = installThrowingStorageStub();
    setThemeMode('light');
    const anotherConsumer = useTheme();
    expect(anotherConsumer.themeMode.value).toBe('light');
    expect(anotherConsumer.isLightTheme.value).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
