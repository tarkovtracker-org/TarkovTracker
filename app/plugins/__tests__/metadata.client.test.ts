// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
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
  });
  it('retries metadata initialization after a previous failure', async () => {
    metadataStoreMock.initialize.mockResolvedValue(undefined);
    const plugin = (await import('@/plugins/metadata.client')).default;
    const hooks = new Map<string, () => void>();
    plugin({
      hook(name: string, callback: () => void) {
        hooks.set(name, callback);
      },
    } as Parameters<typeof plugin>[0]);
    hooks.get('app:mounted')?.();
    await flushPromises();
    expect(metadataStoreMock.initialize).toHaveBeenCalled();
  });
  it('waits until app mount before starting metadata initialization', async () => {
    metadataStoreMock.initializationFailed = false;
    metadataStoreMock.initialize.mockResolvedValue(undefined);
    const plugin = (await import('@/plugins/metadata.client')).default;
    const hooks = new Map<string, () => void>();
    plugin({
      hook(name: string, callback: () => void) {
        hooks.set(name, callback);
      },
    } as Parameters<typeof plugin>[0]);
    await flushPromises();
    expect(metadataStoreMock.initialize).not.toHaveBeenCalled();
    hooks.get('app:mounted')?.();
    await flushPromises();
    expect(metadataStoreMock.initialize).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['/changelog'],
    ['/credits'],
    ['/privacy'],
    ['/supporter'],
    ['/terms-of-service'],
    ['/login'],
    ['/not-found'],
    ['/auth/callback'],
    ['/oauth/twitch'],
    ['/changelog/2024'],
  ])('skips initialization for skip-list path %s', async (path) => {
    routeState.path = path;
    metadataStoreMock.initialize.mockResolvedValue(undefined);
    const plugin = (await import('@/plugins/metadata.client')).default;
    const hooks = new Map<string, () => void>();
    plugin({
      hook(name: string, callback: () => void) {
        hooks.set(name, callback);
      },
    } as Parameters<typeof plugin>[0]);
    metadataStoreMock.initialize.mockClear();
    hooks.get('app:mounted')?.();
    await flushPromises();
    expect(metadataStoreMock.initialize).not.toHaveBeenCalled();
  });
  it.each([
    ['/changelog-archive'],
    ['/credits-team'],
    ['/privacy-policy-2'],
    ['/supporter-tier'],
    ['/loginhelp'],
    ['/tasks'],
    ['/'],
  ])('initializes for non-skip-list path %s', async (path) => {
    routeState.path = path;
    metadataStoreMock.initialize.mockResolvedValue(undefined);
    const plugin = (await import('@/plugins/metadata.client')).default;
    const hooks = new Map<string, () => void>();
    plugin({
      hook(name: string, callback: () => void) {
        hooks.set(name, callback);
      },
    } as Parameters<typeof plugin>[0]);
    metadataStoreMock.initialize.mockClear();
    hooks.get('app:mounted')?.();
    await flushPromises();
    expect(metadataStoreMock.initialize).toHaveBeenCalled();
  });
});
