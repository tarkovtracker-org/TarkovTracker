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
    vi.stubEnv('NODE_ENV', 'development');
    routeState.path = '/tasks';
    metadataStoreMock.hasInitialized = false;
    metadataStoreMock.initializationFailed = true;
    metadataStoreMock.initialize.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it('does not retry metadata initialization after a permanent failure', async () => {
    const plugin = (await import('@/plugins/metadata.client')).default;
    plugin({} as Parameters<typeof plugin>[0]);
    await flushPromises();
    expect(metadataStoreMock.initialize).not.toHaveBeenCalled();
    expect(toastAdd).not.toHaveBeenCalled();
  });
});
