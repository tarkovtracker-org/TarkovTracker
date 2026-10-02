// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, reactive, ref } from 'vue';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { serializeUserScopedStorage } from '@/utils/userScopedStorage';
import { applyPlugins, createNuxtApp } from '#app/nuxt';
const toastAdd = vi.fn();
const routeState = reactive({
  path: '/tasks',
});
const metadataStoreMock = {
  hasInitialized: false,
  initializationFailed: false,
  initialize: vi.fn<() => Promise<void>>(),
};
mockNuxtImport('useRoute', () => () => routeState);
mockNuxtImport('useToast', () => () => ({
  add: toastAdd,
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => metadataStoreMock,
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getCurrentGameMode: () => 'pvp',
  }),
}));
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
describe('metadata plugin', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('MODE', 'development');
    routeState.path = '/tasks';
    metadataStoreMock.hasInitialized = false;
    metadataStoreMock.initializationFailed = true;
    metadataStoreMock.initialize.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
  });
  it('resolves asynchronous browser locale before the first metadata initialization', async () => {
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'de-DE',
    });
    localStorage.setItem(
      STORAGE_KEYS.preferences,
      serializeUserScopedStorage({ localeOverride: null }, null)
    );
    const locale = ref('en');
    let finishLocaleLoad!: () => void;
    const localeLoad = new Promise<void>((resolve) => {
      finishLocaleLoad = resolve;
    });
    const initializedLocales: string[] = [];
    const setLocale = vi.fn(async (selectedLocale: string) => {
      await localeLoad;
      locale.value = selectedLocale;
    });
    metadataStoreMock.initialize.mockImplementation(async () => {
      initializedLocales.push(locale.value);
    });
    const metadataPlugin = (await import('@/plugins/metadata.client')).default;
    const localePlugin = (await import('@/plugins/i18n.client')).default;
    const vueApp = createApp({ render: () => null });
    const nuxtApp = createNuxtApp({ vueApp });
    nuxtApp.provide('i18n', { global: { locale, setLocale } });
    nuxtApp.provide('supabase', { user: { id: null } });
    // Supply metadata first to reproduce its normal position before the post i18n plugin.
    await applyPlugins(nuxtApp, [metadataPlugin, localePlugin]);
    expect(setLocale).not.toHaveBeenCalled();
    expect(locale.value).toBe('en');
    expect(metadataStoreMock.initialize).not.toHaveBeenCalled();
    const mounted = nuxtApp.hooks.callHook('app:mounted', vueApp);
    await flushPromises();
    expect(setLocale).toHaveBeenCalledWith('de');
    expect(metadataStoreMock.initialize).not.toHaveBeenCalled();
    finishLocaleLoad();
    await mounted;
    await flushPromises();
    expect(initializedLocales).toEqual(['de']);
    nuxtApp._scope.stop();
  });
  it('retries metadata initialization after a previous failure', async () => {
    metadataStoreMock.initialize.mockResolvedValue(undefined);
    const plugin = (await import('@/plugins/metadata.client')).default;
    const hooks = new Map<string, () => void>();
    plugin.setup?.({
      hook(name: string, callback: () => void) {
        hooks.set(name, callback);
      },
    } as Parameters<NonNullable<typeof plugin.setup>>[0]);
    hooks.get('app:mounted')?.();
    await flushPromises();
    expect(metadataStoreMock.initialize).toHaveBeenCalled();
  });
  it('waits until app mount before starting metadata initialization', async () => {
    metadataStoreMock.initializationFailed = false;
    metadataStoreMock.initialize.mockResolvedValue(undefined);
    const plugin = (await import('@/plugins/metadata.client')).default;
    const hooks = new Map<string, () => void>();
    plugin.setup?.({
      hook(name: string, callback: () => void) {
        hooks.set(name, callback);
      },
    } as Parameters<NonNullable<typeof plugin.setup>>[0]);
    await flushPromises();
    expect(metadataStoreMock.initialize).not.toHaveBeenCalled();
    hooks.get('app:mounted')?.();
    await flushPromises();
    expect(metadataStoreMock.initialize).toHaveBeenCalledTimes(1);
  });
  const runPluginForPath = async (path: string): Promise<void> => {
    routeState.path = path;
    metadataStoreMock.initialize.mockResolvedValue(undefined);
    const plugin = (await import('@/plugins/metadata.client')).default;
    const hooks = new Map<string, () => void>();
    plugin.setup?.({
      hook(name: string, callback: () => void) {
        hooks.set(name, callback);
      },
    } as Parameters<NonNullable<typeof plugin.setup>>[0]);
    metadataStoreMock.initialize.mockClear();
    hooks.get('app:mounted')?.();
    await flushPromises();
  };
  it.each([
    ['/about'],
    ['/changelog'],
    ['/credits'],
    ['/privacy'],
    ['/supporter'],
    ['/terms-of-service'],
    ['/login'],
    ['/not-found'],
    ['/auth/callback'],
    ['/oauth/twitch'],
    ['/resources'],
    ['/resources/tarkovmonitor'],
    ['/changelog/2024'],
  ])('skips initialization for skip-list path %s', async (path) => {
    await runPluginForPath(path);
    expect(metadataStoreMock.initialize).not.toHaveBeenCalled();
  });
  it.each([
    ['/about-tracker'],
    ['/changelog-archive'],
    ['/credits-team'],
    ['/privacy-policy-2'],
    ['/supporter-tier'],
    ['/loginhelp'],
    ['/tasks'],
    ['/'],
  ])('initializes for non-skip-list path %s', async (path) => {
    await runPluginForPath(path);
    expect(metadataStoreMock.initialize).toHaveBeenCalled();
  });
});
