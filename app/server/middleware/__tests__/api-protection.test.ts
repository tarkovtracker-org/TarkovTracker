/**
 * API Protection Middleware Tests
 *
 * NOTE: These are basic smoke tests with runtime config mocked via mockNuxtImport.
 *
 * Future improvements:
 * - Expand coverage for IP validation and auth enforcement
 * - Add targeted tests for different runtime config scenarios
 */
// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event } from 'h3';
const {
  mockGetRequestURL,
  mockGetRequestHeader,
  mockSetResponseHeader,
  mockSetResponseStatus,
  mockFetch,
} = vi.hoisted(() => ({
  mockGetRequestURL: vi.fn(),
  mockGetRequestHeader: vi.fn(),
  mockSetResponseHeader: vi.fn(),
  mockSetResponseStatus: vi.fn(),
  mockFetch: vi.fn(),
}));
const runtimeConfig = {
  apiProtection: {
    publicRoutes: '',
    requireAuth: true,
    allowedHosts: '',
    trustedIpRanges: '',
    trustProxy: false,
  },
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-anon-key',
};
vi.mock('@/server/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('h3', async () => {
  const actual = await vi.importActual('h3');
  return {
    ...actual,
    getRequestURL: mockGetRequestURL,
    getRequestHeader: mockGetRequestHeader,
    setResponseHeader: mockSetResponseHeader,
    setResponseStatus: mockSetResponseStatus,
  };
});
global.fetch = mockFetch as typeof fetch;
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
mockNuxtImport('useRouter', () => () => ({
  beforeEach: vi.fn(),
  beforeResolve: vi.fn(),
  onError: vi.fn(),
  afterEach: vi.fn(),
}));
describe('API Protection Middleware', () => {
  let mockEvent: Partial<H3Event>;
  type NodeContext = NonNullable<H3Event['node']>;
  const createNodeContext = (remoteAddress: string): NodeContext => ({
    req: { socket: { remoteAddress } } as NodeContext['req'],
    res: {} as NodeContext['res'],
  });
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset runtime config to default state
    runtimeConfig.apiProtection.publicRoutes = '';
    runtimeConfig.apiProtection.requireAuth = true;
    runtimeConfig.apiProtection.allowedHosts = '';
    runtimeConfig.apiProtection.trustedIpRanges = '';
    runtimeConfig.apiProtection.trustProxy = false;
    mockEvent = {
      node: createNodeContext('127.0.0.1'),
      method: 'GET',
      context: {
        siteConfig: { stack: [], push: vi.fn(), get: vi.fn() },
        siteConfigNitroOrigin: '',
      },
    };
  });
  describe('Route filtering', () => {
    it('should skip non-API routes', async () => {
      mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/'));
      const { default: middleware } = await import('../api-protection');
      await expect(middleware(mockEvent as H3Event)).resolves.toBeUndefined();
    });
  });
  describe('Host validation', () => {
    it('should block requests with invalid host', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      mockGetRequestURL.mockReturnValue(new URL('http://evil.com/api/test'));
      mockGetRequestHeader.mockImplementation((_: unknown, header: string) => {
        if (header === 'host') return 'evil.com';
        return undefined;
      });
      const { default: middleware } = await import('../api-protection');
      await expect(middleware(mockEvent as H3Event)).rejects.toThrow();
      process.env.NODE_ENV = originalEnv;
    });
  });
  describe('Public routes', () => {
    it('should allow public routes without authentication', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      runtimeConfig.apiProtection.publicRoutes = '/api/tarkov/*';
      mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/tarkov/items'));
      mockGetRequestHeader.mockImplementation((_: unknown, header: string) => {
        if (header === 'host') return 'localhost:3000';
        return undefined;
      });
      const { default: middleware } = await import('../api-protection');
      await expect(middleware(mockEvent as H3Event)).resolves.toBeUndefined();
      process.env.NODE_ENV = originalEnv;
    });
    it('should treat configured public routes as authoritative', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      runtimeConfig.apiProtection.requireAuth = true;
      runtimeConfig.apiProtection.publicRoutes = '/api/tarkov/*';
      mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/profile/test'));
      mockGetRequestHeader.mockImplementation((_: unknown, header: string) => {
        if (header === 'host') return 'localhost:3000';
        return undefined;
      });
      const { default: middleware } = await import('../api-protection');
      await expect(middleware(mockEvent as H3Event)).rejects.toThrow();
      process.env.NODE_ENV = originalEnv;
    });
    it('should fall back to default public routes when config value is blank', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      runtimeConfig.apiProtection.requireAuth = true;
      runtimeConfig.apiProtection.publicRoutes = '   ';
      mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/profile/test'));
      mockGetRequestHeader.mockImplementation((_: unknown, header: string) => {
        if (header === 'host') return 'localhost:3000';
        return undefined;
      });
      const { default: middleware } = await import('../api-protection');
      await expect(middleware(mockEvent as H3Event)).resolves.toBeUndefined();
      process.env.NODE_ENV = originalEnv;
    });
  });
  describe('Authentication requirement', () => {
    it('should allow all routes when requireAuth is false', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      runtimeConfig.apiProtection.requireAuth = false;
      mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/protected'));
      mockGetRequestHeader.mockImplementation((_: unknown, header: string) => {
        if (header === 'host') return 'localhost:3000';
        return undefined;
      });
      const { default: middleware } = await import('../api-protection');
      await expect(middleware(mockEvent as H3Event)).resolves.toBeUndefined();
      process.env.NODE_ENV = originalEnv;
    });
  });
  describe('IP validation with trustProxy', () => {
    it('should allow request from trusted IP range', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      runtimeConfig.apiProtection.requireAuth = false;
      runtimeConfig.apiProtection.trustedIpRanges = '192.168.1.0/24';
      runtimeConfig.apiProtection.trustProxy = false;
      mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/test'));
      mockGetRequestHeader.mockImplementation((_: unknown, header: string) => {
        if (header === 'host') return 'localhost:3000';
        return undefined;
      });
      mockEvent.node = createNodeContext('192.168.1.100');
      const { default: middleware } = await import('../api-protection');
      await expect(middleware(mockEvent as H3Event)).resolves.toBeUndefined();
      process.env.NODE_ENV = originalEnv;
    });
    it('should block request from untrusted IP range', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      runtimeConfig.apiProtection.requireAuth = false;
      runtimeConfig.apiProtection.trustedIpRanges = '192.168.1.0/24';
      runtimeConfig.apiProtection.trustProxy = false;
      mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/test'));
      mockGetRequestHeader.mockImplementation((_: unknown, header: string) => {
        if (header === 'host') return 'localhost:3000';
        return undefined;
      });
      mockEvent.node = createNodeContext('10.0.0.1');
      const { default: middleware } = await import('../api-protection');
      await expect(middleware(mockEvent as H3Event)).rejects.toThrow();
      process.env.NODE_ENV = originalEnv;
    });
    it('should use X-Forwarded-For when trustProxy is true', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      runtimeConfig.apiProtection.requireAuth = false;
      runtimeConfig.apiProtection.trustedIpRanges = '203.0.113.0/24';
      runtimeConfig.apiProtection.trustProxy = true;
      mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/test'));
      mockGetRequestHeader.mockImplementation((_: unknown, header: string) => {
        if (header === 'host') return 'localhost:3000';
        if (header === 'x-forwarded-for') return '203.0.113.50, 10.0.0.1';
        return undefined;
      });
      mockEvent.node = createNodeContext('10.0.0.1');
      const { default: middleware } = await import('../api-protection');
      await expect(middleware(mockEvent as H3Event)).resolves.toBeUndefined();
      process.env.NODE_ENV = originalEnv;
    });
  });
  describe('Authentication validation', () => {
    it('should allow request with valid auth token', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      runtimeConfig.apiProtection.requireAuth = true;
      mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/protected'));
      mockGetRequestHeader.mockImplementation((_: unknown, header: string) => {
        if (header === 'host') return 'localhost:3000';
        if (header === 'authorization') return 'Bearer valid-token-123';
        return undefined;
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'user-123' }),
      });
      const { default: middleware } = await import('../api-protection');
      await expect(middleware(mockEvent as H3Event)).resolves.toBeUndefined();
      expect(mockEvent.context?.auth).toEqual({ user: { id: 'user-123' } });
      process.env.NODE_ENV = originalEnv;
    });
    it('should block request with invalid auth token', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      runtimeConfig.apiProtection.requireAuth = true;
      mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/protected'));
      mockGetRequestHeader.mockImplementation((_: unknown, header: string) => {
        if (header === 'host') return 'localhost:3000';
        if (header === 'authorization') return 'Bearer invalid-token';
        return undefined;
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });
      const { default: middleware } = await import('../api-protection');
      await expect(middleware(mockEvent as H3Event)).rejects.toThrow();
      process.env.NODE_ENV = originalEnv;
    });
    it('should block request without auth token', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      runtimeConfig.apiProtection.requireAuth = true;
      mockGetRequestURL.mockReturnValue(new URL('http://localhost:3000/api/protected'));
      mockGetRequestHeader.mockImplementation((_: unknown, header: string) => {
        if (header === 'host') return 'localhost:3000';
        return undefined;
      });
      const { default: middleware } = await import('../api-protection');
      await expect(middleware(mockEvent as H3Event)).rejects.toThrow();
      process.env.NODE_ENV = originalEnv;
    });
  });
});
