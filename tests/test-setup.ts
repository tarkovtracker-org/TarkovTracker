import { enableAutoUnmount } from '@vue/test-utils';
import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
type FetchInput = string | Request | URL;
type MockFetchResponse =
  | { data: { playerLevels: unknown[] } }
  | { data: { hideoutStations: unknown[] } }
  | { data: { prestige: unknown[] } }
  | { data: { items: unknown[] } }
  | { data: { tasks: unknown[]; maps: unknown[]; traders: unknown[] } }
  | { data: { tasks: unknown[] } }
  | { data: { lastPurgeAt: null } }
  | { editions: Record<string, unknown> }
  | {
      matcher: {
        dynamic: Record<string, unknown>;
        static: Record<string, unknown>;
        wildcard: Record<string, unknown>;
      };
      prerendered: unknown[];
      routes: { entries: () => unknown[] };
    };
const getFetchUrl = (input: FetchInput): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
};
const mockFetch = vi.fn(
  async (input: FetchInput, _init?: RequestInit): Promise<MockFetchResponse> => {
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
  }
);
vi.stubGlobal('$fetch', mockFetch);
// Auto-unmount VTU wrappers after each test
try {
  enableAutoUnmount(afterEach);
} catch (error) {
  if (!(error instanceof Error && error.message.includes('already enabled'))) {
    throw error;
  }
}
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  const originalWarn = console.warn.bind(console);
  warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.startsWith('[Icon]')) return;
    originalWarn(...args);
  });
});
afterAll(() => {
  vi.restoreAllMocks();
});
