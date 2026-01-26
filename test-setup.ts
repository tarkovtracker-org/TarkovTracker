import { enableAutoUnmount } from '@vue/test-utils';
import 'fake-indexeddb/auto';
import { beforeAll, afterEach, vi } from 'vitest';
type FetchInput = string | Request | URL;
const getFetchUrl = (input: FetchInput) => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
};
const mockFetch = vi.fn(async (input: FetchInput, _init?: RequestInit) => {
  const url = getFetchUrl(input);
  if (url.includes('/api/tarkov/bootstrap')) {
    return { data: { playerLevels: [] } };
  }
  if (url.includes('/api/tarkov/hideout')) {
    return { data: { hideoutStations: [] } };
  }
  if (url.includes('/api/tarkov/prestige')) {
    return { data: { prestige: [] } };
  }
  if (url.includes('/api/tarkov/items')) {
    return { data: { items: [] } };
  }
  if (url.includes('/api/tarkov/tasks-core')) {
    return { data: { tasks: [], maps: [], traders: [] } };
  }
  if (url.includes('/api/tarkov/tasks-objectives')) {
    return { data: { tasks: [] } };
  }
  if (url.includes('/api/tarkov/tasks-rewards')) {
    return { data: { tasks: [] } };
  }
  if (url.includes('/api/tarkov/cache-meta')) {
    return { data: { lastPurgeAt: null } };
  }
  if (url.includes('tarkov-data-overlay') || url.includes('/overlay.json')) {
    return { editions: {} };
  }
  if (url.includes('/_nuxt/builds/meta/')) {
    // Mock Nuxt's build manifest requests during test initialization
    return {
      matcher: {
        dynamic: {},
        static: {},
        wildcard: {},
      },
      prerendered: [],
      routes: { entries: () => [] },
    };
  }
  // Fail fast for unmatched URLs to maintain test isolation
  throw new Error(`Unmocked fetch call to: ${url}. Add a mock for this URL in test-setup.ts`);
});
vi.stubGlobal('$fetch', mockFetch);
// Auto-unmount VTU wrappers after each test
enableAutoUnmount(afterEach);
// Global setup for Nuxt testing
beforeAll(() => {
  // Mock console methods that might be noisy in tests
  const originalConsole = { ...console };
  global.console = {
    ...originalConsole,
    // Uncomment to suppress specific warnings during tests
    warn: (...args: unknown[]) => {
      const first = args[0];
      if (typeof first === 'string' && first.startsWith('[Icon]')) return;
      originalConsole.warn(...args);
    },
    // error: vi.fn(),
  };
});
