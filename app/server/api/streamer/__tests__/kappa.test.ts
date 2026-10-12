// @vitest-environment happy-dom
import { formatWithOptions } from 'node:util';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { createFetch } from 'ofetch';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_SITE_CONTEXT, createRouterStub } from '@/server/utils/__tests__/eventStubs';
import type { H3Event } from 'h3';
const {
  mockComputeStreamerKappaMetrics,
  mockGetRequestHeader,
  mockGetRouterParam,
  mockProcessTaskData,
  mockSetResponseHeader,
  mockUseRuntimeConfig,
} = vi.hoisted(() => ({
  mockComputeStreamerKappaMetrics: vi.fn(),
  mockGetRequestHeader: vi.fn(),
  mockGetRouterParam: vi.fn(),
  mockProcessTaskData: vi.fn(),
  mockSetResponseHeader: vi.fn(),
  mockUseRuntimeConfig: vi.fn(),
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
mockNuxtImport('useRouter', () => () => createRouterStub());
mockNuxtImport('useRuntimeConfig', () => mockUseRuntimeConfig);
describe('Streamer Kappa API', () => {
  const USER_ID = '11111111-1111-4111-8111-111111111111';
  let mockEvent: Partial<H3Event>;
  let originalFetch: typeof mockDollarFetch | undefined;
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    vi.stubEnv('OVERLAY_TOKEN', '');
    mockUseRuntimeConfig.mockReturnValue({ public: { appUrl: 'https://tarkovtracker.org' } });
    mockEvent = {
      context: {
        ...BASE_SITE_CONTEXT,
      },
    };
    mockGetRouterParam.mockImplementation((_, key: string) => {
      if (key === 'userId') return USER_ID;
      if (key === 'mode') return 'pvp';
      return undefined;
    });
    mockGetRequestHeader.mockImplementation((_, key: string) => {
      if (key === 'host') return 'tarkovtracker.org';
      if (key === 'x-forwarded-for') return '203.0.113.5';
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
    vi.unstubAllEnvs();
    if (typeof originalFetch === 'undefined') {
      delete (globalThis as unknown as { $fetch?: typeof mockDollarFetch }).$fetch;
      return;
    }
    (globalThis as unknown as { $fetch?: typeof mockDollarFetch }).$fetch = originalFetch;
  });
  it.each(['', 'overlay-test-sentinel'])(
    'returns computed streamer kappa metrics with overlay token %j',
    async (overlayToken) => {
      vi.stubEnv('OVERLAY_TOKEN', overlayToken);
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
      expect(mockDollarFetch).toHaveBeenCalledWith(`/api/profile/${USER_ID}/pvp`, {
        headers: {
          host: 'tarkovtracker.org',
          'x-forwarded-for': '203.0.113.5',
        },
      });
      expect(mockDollarFetch).toHaveBeenCalledWith('/api/tarkov/tasks-core', {
        headers: {
          host: 'tarkovtracker.org',
          'x-forwarded-for': '203.0.113.5',
        },
        query: { gameMode: 'regular', lang: 'en' },
      });
      expect(mockDollarFetch).toHaveBeenCalledWith('/api/tarkov/tasks-objectives', {
        headers: {
          host: 'tarkovtracker.org',
          'x-forwarded-for': '203.0.113.5',
        },
        query: { gameMode: 'regular', lang: 'en' },
      });
      expect(mockSetResponseHeader).toHaveBeenCalledWith(
        mockEvent,
        'Cache-Control',
        'no-store, max-age=0'
      );
      expect(mockComputeStreamerKappaMetrics).toHaveBeenCalled();
      expect(mockDollarFetch).toHaveBeenCalledWith(
        expect.stringContaining('tarkov-data-overlay/main/dist/overlay.json'),
        {
          headers: overlayToken ? { Authorization: `Bearer ${overlayToken}` } : {},
          redirect: 'error',
        }
      );
      expect(result).toMatchObject({
        displayName: 'PublicPlayer',
        items: { collected: 10, percentage: 50, remaining: 10, total: 20 },
        mode: 'pvp',
        tasks: { completed: 20, percentage: 40, remaining: 30, total: 50 },
        userId: USER_ID,
        visibility: 'public',
      });
    }
  );
  it('does not log the configured token when the overlay request fails', async () => {
    const token = 'overlay-test-sentinel';
    vi.stubEnv('OVERLAY_TOKEN', token);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSinkFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    mockUseRuntimeConfig.mockReturnValue({
      logSinkUrl: 'https://logs.example.com/',
      public: { appUrl: 'https://tarkovtracker.org' },
    });
    const failedOverlayFetch = createFetch({
      fetch: vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 403, statusText: 'Forbidden' })),
      Headers,
      AbortController,
    });
    mockDollarFetch.mockImplementation(async (input: string, options) => {
      if (input.includes('tarkov-data-overlay/main/dist/overlay.json')) {
        return failedOverlayFetch(input, options);
      }
      if (input === `/api/profile/${USER_ID}/pvp`) {
        return { data: {}, gameEdition: 4, mode: 'pvp', userId: USER_ID, visibility: 'public' };
      }
      return { data: { tasks: [] } };
    });
    const { default: handler } = await import('@/server/api/streamer/[userId]/[mode]/kappa.get');
    await handler(mockEvent as H3Event);
    expect(mockDollarFetch).toHaveBeenCalledWith(
      expect.stringContaining('tarkov-data-overlay/main/dist/overlay.json'),
      { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' }
    );
    expect(warn).toHaveBeenCalledWith(
      '[StreamerKappaApi]',
      'Failed to fetch editions overlay for streamer metrics',
      expect.any(Error)
    );
    const logged = warn.mock.calls.map((args) => formatWithOptions({}, ...args)).join('\n');
    expect(logged).not.toContain(token);
    expect(logSinkFetch).toHaveBeenCalledWith(
      'https://logs.example.com/',
      expect.objectContaining({ method: 'POST' })
    );
    const sinkBodies = logSinkFetch.mock.calls.map(([, init]) => String(init?.body)).join('\n');
    expect(sinkBodies).not.toContain(token);
  });
  it('maps private shared profiles to a 403 response', async () => {
    mockDollarFetch.mockRejectedValueOnce({
      statusCode: 403,
      statusMessage: 'Profile is private for this mode',
    });
    const { default: handler } = await import('@/server/api/streamer/[userId]/[mode]/kappa.get');
    await expect(handler(mockEvent as H3Event)).rejects.toThrow('Profile is private for this mode');
  });
  it('maps non-private 403 shared profile errors to service unavailable', async () => {
    mockDollarFetch.mockRejectedValueOnce({ statusCode: 403, statusMessage: 'Forbidden' });
    const { default: handler } = await import('@/server/api/streamer/[userId]/[mode]/kappa.get');
    await expect(handler(mockEvent as H3Event)).rejects.toThrow('Shared profiles unavailable');
  });
});
