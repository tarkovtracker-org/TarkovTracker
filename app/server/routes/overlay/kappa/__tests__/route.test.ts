// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event, H3EventContext } from 'h3';
import type { SiteConfigInput } from 'site-config-stack';
const { mockGetQuery, mockGetRouterParam, mockSetHeader, mockSetResponseHeader } = vi.hoisted(
  () => ({
    mockGetQuery: vi.fn(),
    mockGetRouterParam: vi.fn(),
    mockSetHeader: vi.fn(),
    mockSetResponseHeader: vi.fn(),
  })
);
vi.mock('h3', async () => {
  const actual = await vi.importActual('h3');
  return {
    ...actual,
    getQuery: mockGetQuery,
    getRouterParam: mockGetRouterParam,
    setHeader: mockSetHeader,
    setResponseHeader: mockSetResponseHeader,
  };
});
mockNuxtImport('useRouter', () => () => ({
  afterEach: vi.fn(),
  beforeEach: vi.fn(),
  beforeResolve: vi.fn(),
  onError: vi.fn(),
}));
describe('Overlay Kappa Route', () => {
  let mockEvent: Partial<H3Event>;
  const BASE_SITE_CONTEXT: Pick<H3EventContext, 'siteConfig' | 'siteConfigNitroOrigin'> = {
    siteConfig: {
      stack: [] as Partial<SiteConfigInput>[],
      push: vi.fn(() => () => {}),
      get: vi.fn(() => ({})),
    },
    siteConfigNitroOrigin: '',
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mockEvent = {
      context: {
        ...BASE_SITE_CONTEXT,
      },
    };
    mockGetRouterParam.mockImplementation((_, key: string) => {
      if (key === 'userId') return '11111111-1111-4111-8111-111111111111';
      if (key === 'mode') return 'pvp';
      return undefined;
    });
    mockGetQuery.mockReturnValue({});
  });
  it('renders html with default overlay config', async () => {
    const { default: handler } = await import('@/server/routes/overlay/kappa/[userId]/[mode].get');
    const html = await handler(mockEvent as H3Event);
    expect(mockSetHeader).toHaveBeenCalledWith(
      mockEvent,
      'Content-Type',
      'text/html; charset=utf-8'
    );
    expect(mockSetResponseHeader).toHaveBeenCalledWith(
      mockEvent,
      'Cache-Control',
      'no-store, max-age=0'
    );
    expect(html).toContain('<title>TarkovTracker Stream Overlay</title>');
    expect(html).toContain('"align":"bottom-left"');
    expect(html).toContain('"container":"canvas"');
    expect(html).toContain('"trackOpacity":20');
  });
  it('includes visibility recovery and BroadcastChannel listeners', async () => {
    const { default: handler } = await import('@/server/routes/overlay/kappa/[userId]/[mode].get');
    const html = await handler(mockEvent as H3Event);
    expect(html).toContain('visibilitychange');
    expect(html).toContain('refreshOnWake');
    expect(html).toContain('lastFetchTime');
    expect(html).toContain("addEventListener('online'");
    expect(html).toContain('BroadcastChannel');
    expect(html).toContain('tarkov-progress:');
    expect(html).toContain('"userId":"11111111-1111-4111-8111-111111111111"');
  });
  it('normalizes legacy alignment and applies custom styling query params', async () => {
    mockGetQuery.mockReturnValue({
      accent: 'custom',
      accentColor: '#123456',
      align: 'left',
      bg: 'custom',
      bgColor: '#111111',
      bgOpacity: '73',
      container: 'self-contained',
      font: 'inter',
      resolution: 'custom',
      scale: '140',
      showTitle: '0',
      trackColor: '#abcdef',
      trackOpacity: '55',
    });
    const { default: handler } = await import('@/server/routes/overlay/kappa/[userId]/[mode].get');
    const html = await handler(mockEvent as H3Event);
    expect(html).toContain('"align":"bottom-left"');
    expect(html).toContain('"container":"self-contained"');
    expect(html).toContain('"overlayScale":1.4');
    expect(html).toContain('"background":"custom"');
    expect(html).toContain('"trackOpacity":55');
    expect(html).toContain('"font":"inter"');
    expect(html).toContain('family=Inter:wght@400;500;600;700;800&display=swap');
  });
});
