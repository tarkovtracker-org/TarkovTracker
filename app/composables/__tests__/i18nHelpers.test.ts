// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { serializeUserScopedStorage } from '@/utils/userScopedStorage';
describe('useSafeLocale', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.stubGlobal('navigator', { ...window.navigator, language: 'en-US' });
  });
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });
  it('ignores prior user-scoped locale while auth ownership is unresolved', async () => {
    localStorage.setItem(
      STORAGE_KEYS.preferences,
      serializeUserScopedStorage({ localeOverride: 'de' }, 'user-1')
    );
    localStorage.setItem('sb-test-auth-token', 'token');
    const { resetI18nReady, useSafeLocale } = await import('@/composables/i18nHelpers');
    resetI18nReady();
    expect(useSafeLocale().value).toBe('en');
  });
  it('keeps anonymous scoped locale during bootstrap', async () => {
    localStorage.setItem(
      STORAGE_KEYS.preferences,
      serializeUserScopedStorage({ localeOverride: 'fr' }, null)
    );
    localStorage.setItem('sb-test-auth-token', 'token');
    const { resetI18nReady, useSafeLocale } = await import('@/composables/i18nHelpers');
    resetI18nReady();
    expect(useSafeLocale().value).toBe('fr');
  });
  it('falls back to english when browser locale is not supported by the UI', async () => {
    vi.stubGlobal('navigator', { ...window.navigator, language: 'it-IT' });
    const { resetI18nReady, useSafeLocale } = await import('@/composables/i18nHelpers');
    resetI18nReady();
    expect(useSafeLocale().value).toBe('en');
  });
});
