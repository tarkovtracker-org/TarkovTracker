// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event } from 'h3';
const runtimeConfig = {
  supabaseServiceKey: 'service-key',
  supabaseUrl: 'https://test.supabase.co',
};
const mockFetch = vi.fn();
vi.mock('@/server/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
const event = { context: {} } as H3Event;
describe('getSupporterStripeCustomerId', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    runtimeConfig.supabaseUrl = 'https://test.supabase.co';
    runtimeConfig.supabaseServiceKey = 'service-key';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('returns null when supabase config is missing', async () => {
    runtimeConfig.supabaseUrl = '';
    const { getSupporterStripeCustomerId } = await import('@/server/utils/supporterCustomerLookup');
    const result = await getSupporterStripeCustomerId(event, 'user-1');
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it('throws when supabase config is missing and unavailable lookups are fatal', async () => {
    runtimeConfig.supabaseUrl = '';
    const { SupporterCustomerLookupUnavailableError, getSupporterStripeCustomerId } =
      await import('@/server/utils/supporterCustomerLookup');
    await expect(
      getSupporterStripeCustomerId(event, 'user-1', { throwOnUnavailable: true })
    ).rejects.toBeInstanceOf(SupporterCustomerLookupUnavailableError);
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it('returns the customer id when found', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ stripe_customer_id: 'cus_123' }],
    } as Response);
    const { getSupporterStripeCustomerId } = await import('@/server/utils/supporterCustomerLookup');
    const result = await getSupporterStripeCustomerId(event, 'user-1');
    expect(result).toBe('cus_123');
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/rest/v1/supporters');
    expect(url).toContain('user_id=eq.user-1');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer service-key');
  });
  it('returns null when no row exists', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
    const { getSupporterStripeCustomerId } = await import('@/server/utils/supporterCustomerLookup');
    const result = await getSupporterStripeCustomerId(event, 'user-1');
    expect(result).toBeNull();
  });
  it('returns null on a non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 } as Response);
    const { getSupporterStripeCustomerId } = await import('@/server/utils/supporterCustomerLookup');
    const result = await getSupporterStripeCustomerId(event, 'user-1');
    expect(result).toBeNull();
  });
  it('throws on a non-ok response when unavailable lookups are fatal', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 } as Response);
    const { SupporterCustomerLookupUnavailableError, getSupporterStripeCustomerId } =
      await import('@/server/utils/supporterCustomerLookup');
    await expect(
      getSupporterStripeCustomerId(event, 'user-1', { throwOnUnavailable: true })
    ).rejects.toBeInstanceOf(SupporterCustomerLookupUnavailableError);
  });
  it('returns null when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const { getSupporterStripeCustomerId } = await import('@/server/utils/supporterCustomerLookup');
    const result = await getSupporterStripeCustomerId(event, 'user-1');
    expect(result).toBeNull();
  });
  it('encodes the user id in the query string', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ stripe_customer_id: 'cus_999' }],
    } as Response);
    const { getSupporterStripeCustomerId } = await import('@/server/utils/supporterCustomerLookup');
    await getSupporterStripeCustomerId(event, 'user/1+admin');
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('user_id=eq.user%2F1%2Badmin');
  });
});
