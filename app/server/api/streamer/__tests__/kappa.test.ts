// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event, H3EventContext } from 'h3';
import type { SiteConfigInput } from 'site-config-stack';
const {
  mockComputeStreamerKappaMetrics,
  mockGetRequestHeader,
  mockGetRouterParam,
  mockProcessTaskData,
  mockSetResponseHeader,
} = vi.hoisted(() => ({
  mockComputeStreamerKappaMetrics: vi.fn(),
  mockGetRequestHeader: vi.fn(),
  mockGetRouterParam: vi.fn(),
  mockProcessTaskData: vi.fn(),
  mockSetResponseHeader: vi.fn(),
}));
const mockDollarFetch = vi.fn();
vi.mock('h3', async () => {
  const actual = await vi.importActual('h3');
  return {
    ...actual,
    getRequestHeader: mockGetRequestHeader,
    getRouterParam: mockGetRouterParam,
    setResponseHeader: mockSetResponseHeader,
  };
});
vi.mock('@/composables/useGraphBuilder', () => ({
  useGraphBuilder: () => ({
    processTaskData: mockProcessTaskData,
  }),
}));
vi.mock('@/server/utils/streamerKappa', () => ({
  computeStreamerKappaMetrics: mockComputeStreamerKappaMetrics,
}));
mockNuxtImport('useRouter', () => () => ({
  afterEach: vi.fn(),
  beforeEach: vi.fn(),
  beforeResolve: vi.fn(),
  onError: vi.fn(),
}));
describe('Streamer Kappa API', () => {
  const USER_ID = '11111111-1111-4111-8111-111111111111';
  let mockEvent: Partial<H3Event>;
  let originalFetch: typeof mockDollarFetch | undefined;
  const BASE_SITE_CONTEXT: Pick<H3EventContext, 'siteConfig' | 'siteConfigNitroOrigin'> = {
    siteConfig: {
      stack: [] as Partial<SiteConfigInput>[],
      push: vi.fn(() => () => {}),
      get: vi.fn(() => ({})),
    },
    siteConfigNitroOrigin: '',
  };
  beforeEach(() => {
    vi.resetAllMocks();
    mockEvent = {
      context: {
        ...BASE_SITE_CONTEXT,
      },
    };
    mockGetRequestHeader.mockReturnValue('tarkovtracker.org');
    mockGetRouterParam.mockImplementation((_, key: string) => {
      if (key === 'userId') return USER_ID;
      if (key === 'mode') return 'pvp';
      return undefined;
    });
    mockProcessTaskData.mockReturnValue({
      neededItemTaskObjectives: [],
      tasks: [{ id: 'task-1' }],
    });
    mockComputeStreamerKappaMetrics.mockReturnValue({
      items: { collected: 10, percentage: 50, remaining: 10, total: 20 },
      tasks: { completed: 20, percentage: 40, remaining: 30, total: 50 },
    });
    originalFetch = (globalThis as unknown as { $fetch?: typeof mockDollarFetch }).$fetch;
    (globalThis as unknown as { $fetch?: typeof mockDollarFetch }).$fetch = mockDollarFetch;
  });
  afterEach(() => {
    if (typeof originalFetch === 'undefined') {
      delete (globalThis as unknown as { $fetch?: typeof mockDollarFetch }).$fetch;
      return;
    }
    (globalThis as unknown as { $fetch?: typeof mockDollarFetch }).$fetch = originalFetch;
  });
  it('returns computed streamer kappa metrics for a shared profile', async () => {
    mockDollarFetch.mockImplementation(async (input: string) => {
      if (input === `/api/profile/${USER_ID}/pvp`) {
        return {
          data: {
            displayName: 'PublicPlayer',
            pmcFaction: 'USEC',
            taskCompletions: { 'task-1': { complete: true, failed: false } },
            taskObjectives: {},
          },
          gameEdition: 4,
          mode: 'pvp',
          userId: USER_ID,
          visibility: 'public',
        };
      }
      if (input === '/api/tarkov/tasks-core') {
        return { data: { tasks: [{ id: 'task-1' }] } };
      }
      if (input === '/api/tarkov/tasks-objectives') {
        return { data: { tasks: [{ id: 'task-1', failConditions: [], objectives: [] }] } };
      }
      if (input.includes('tarkov-data-overlay/main/dist/overlay.json')) {
        return {
          editions: {
            standard: {
              defaultCultistCircleLevel: 0,
              defaultStashLevel: 1,
              excludedTaskIds: [],
              id: 'standard',
              title: 'Standard',
              traderRepBonus: {},
              value: 4,
            },
          },
        };
      }
      throw new Error(`Unexpected fetch: ${input}`);
    });
    const { default: handler } = await import('@/server/api/streamer/[userId]/[mode]/kappa.get');
    const result = await handler(mockEvent as H3Event);
    expect(mockSetResponseHeader).toHaveBeenCalledWith(
      mockEvent,
      'Cache-Control',
      'no-store, max-age=0'
    );
    expect(mockComputeStreamerKappaMetrics).toHaveBeenCalled();
    expect(result).toMatchObject({
      displayName: 'PublicPlayer',
      items: { collected: 10, percentage: 50, remaining: 10, total: 20 },
      mode: 'pvp',
      tasks: { completed: 20, percentage: 40, remaining: 30, total: 50 },
      userId: USER_ID,
      visibility: 'public',
    });
  });
  it('maps private shared profiles to a 403 response', async () => {
    mockDollarFetch.mockRejectedValueOnce({ statusCode: 403 });
    const { default: handler } = await import('@/server/api/streamer/[userId]/[mode]/kappa.get');
    await expect(handler(mockEvent as H3Event)).rejects.toThrow('Profile is private for this mode');
  });
});
