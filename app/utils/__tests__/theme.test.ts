// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyThemeMode,
  DEFAULT_THEME_MODE,
  normalizeThemeMode,
  persistThemeMode,
  readStoredThemeMode,
  THEME_BOOT_SCRIPT,
  THEME_MODES,
  THEME_STORAGE_KEY,
} from '@/utils/theme';
// happy-dom exposes window.localStorage as a Proxy, so vi.spyOn on its methods
// leaks across tests. Replace the whole property instead and restore it after.
describe('theme utils', () => {
  let originalLocalStorage: PropertyDescriptor | undefined;
  const stubThrowingStorage = () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        get length() {
          return 0;
        },
        clear() {},
        getItem(): string | null {
          throw new Error('denied');
        },
        key: () => null,
        removeItem() {},
        setItem(): void {
          throw new Error('denied');
        },
      } satisfies Storage,
    });
  };
  beforeEach(() => {
    originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
  });
  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(window, 'localStorage', originalLocalStorage);
    }
    vi.restoreAllMocks();
  });
  describe('normalizeThemeMode', () => {
    it('keeps supported modes', () => {
      expect(normalizeThemeMode('light')).toBe('light');
      expect(normalizeThemeMode('dark')).toBe('dark');
    });
    it('falls back to dark for unknown or missing values', () => {
      expect(normalizeThemeMode('solarized')).toBe('dark');
      expect(normalizeThemeMode('')).toBe('dark');
      expect(normalizeThemeMode(undefined)).toBe('dark');
      expect(normalizeThemeMode(null)).toBe('dark');
      expect(normalizeThemeMode(42)).toBe('dark');
      expect(normalizeThemeMode({ value: 'light' })).toBe('dark');
    });
    it('treats modes and the default as dark-first', () => {
      expect(THEME_MODES).toEqual(['dark', 'light']);
      expect(DEFAULT_THEME_MODE).toBe('dark');
    });
  });
  describe('readStoredThemeMode', () => {
    it('returns the persisted mode', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
      expect(readStoredThemeMode()).toBe('light');
    });
    it('falls back to dark when nothing is stored or the value is invalid', () => {
      expect(readStoredThemeMode()).toBe('dark');
      window.localStorage.setItem(THEME_STORAGE_KEY, 'neon');
      expect(readStoredThemeMode()).toBe('dark');
    });
    it('falls back to dark when storage access throws', () => {
      stubThrowingStorage();
      expect(readStoredThemeMode()).toBe('dark');
    });
  });
  describe('persistThemeMode', () => {
    it('writes the mode to localStorage', () => {
      persistThemeMode('light');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    });
    it('swallows storage failures without throwing', () => {
      stubThrowingStorage();
      expect(() => persistThemeMode('light')).not.toThrow();
    });
  });
  describe('applyThemeMode', () => {
    it('sets data-theme and color-scheme on the document root', () => {
      applyThemeMode('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.documentElement.style.colorScheme).toBe('light');
      applyThemeMode('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });
  });
  describe('THEME_BOOT_SCRIPT', () => {
    it('applies the stored light theme before paint', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
      new Function(THEME_BOOT_SCRIPT)();
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.documentElement.style.colorScheme).toBe('light');
    });
    it('defaults to dark when nothing is stored', () => {
      new Function(THEME_BOOT_SCRIPT)();
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });
    it('normalizes invalid stored values to dark', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'blue');
      new Function(THEME_BOOT_SCRIPT)();
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
    it('never throws when storage is unavailable', () => {
      stubThrowingStorage();
      expect(() => new Function(THEME_BOOT_SCRIPT)()).not.toThrow();
      // The guard leaves the document untouched when storage fails.
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });
  });
});
