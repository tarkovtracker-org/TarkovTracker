// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { serializeUserScopedStorage } from '@/utils/userScopedStorage';
describe('i18n-ready plugin', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'en-US',
    });
  });
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });
  it('ignores a prior user-scoped locale while auth hydration is in progress', async () => {
    localStorage.setItem(
      STORAGE_KEYS.preferences,
      serializeUserScopedStorage({ localeOverride: 'de' }, 'user-1')
    );
    localStorage.setItem('sb-test-auth-token', 'token');
    const setLocale = vi.fn();
    const plugin = (await import('@/plugins/i18n.client')).default;
    await plugin.setup?.({
      $i18n: {
        global: {
          setLocale,
        },
      },
      $supabase: {
        user: {
          id: null,
        },
      },
    } as unknown as Parameters<NonNullable<typeof plugin.setup>>[0]);
    expect(setLocale).toHaveBeenCalledWith('en');
  });
  it('applies an anonymous scoped locale while auth hydration is in progress', async () => {
    localStorage.setItem(
      STORAGE_KEYS.preferences,
      serializeUserScopedStorage({ localeOverride: 'de' }, null)
    );
    localStorage.setItem('sb-test-auth-token', 'token');
    const setLocale = vi.fn();
    const plugin = (await import('@/plugins/i18n.client')).default;
    await plugin.setup?.({
      $i18n: {
        global: {
          setLocale,
        },
      },
      $supabase: {
        user: {
          id: null,
        },
      },
    } as unknown as Parameters<NonNullable<typeof plugin.setup>>[0]);
    expect(setLocale).toHaveBeenCalledWith('de');
  });
  it('does not apply a prior user-scoped locale when no session is hydrating', async () => {
    localStorage.setItem(
      STORAGE_KEYS.preferences,
      serializeUserScopedStorage({ localeOverride: 'de' }, 'user-1')
    );
    const setLocale = vi.fn();
    const plugin = (await import('@/plugins/i18n.client')).default;
    await plugin.setup?.({
      $i18n: {
        global: {
          setLocale,
        },
      },
      $supabase: {
        user: {
          id: null,
        },
      },
    } as unknown as Parameters<NonNullable<typeof plugin.setup>>[0]);
    expect(setLocale).toHaveBeenCalledWith('en');
  });
  it('applies a prior user-scoped locale once the matching user is known', async () => {
    localStorage.setItem(
      STORAGE_KEYS.preferences,
      serializeUserScopedStorage({ localeOverride: 'de' }, 'user-1')
    );
    const setLocale = vi.fn();
    const plugin = (await import('@/plugins/i18n.client')).default;
    await plugin.setup?.({
      $i18n: {
        global: {
          setLocale,
        },
      },
      $supabase: {
        user: {
          id: 'user-1',
        },
      },
    } as unknown as Parameters<NonNullable<typeof plugin.setup>>[0]);
    expect(setLocale).toHaveBeenCalledWith('de');
  });
  it('falls back to english when the browser locale is not supported by the UI', async () => {
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'it-IT',
    });
    const setLocale = vi.fn();
    const plugin = (await import('@/plugins/i18n.client')).default;
    await plugin.setup?.({
      $i18n: {
        global: {
          setLocale,
        },
      },
      $supabase: {
        user: {
          id: null,
        },
      },
    } as unknown as Parameters<NonNullable<typeof plugin.setup>>[0]);
    expect(setLocale).toHaveBeenCalledWith('en');
  });
});
