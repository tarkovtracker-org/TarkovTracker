// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event, H3EventContext } from 'h3';
const runtimeConfig = {
  public: { appUrl: 'https://tarkovtracker.org' },
  stripeSecretKey: 'sk_test_123',
  supabaseServiceKey: 'service-key',
  supabaseUrl: 'https://test.supabase.co',
};
const mockReadBody = vi.fn();
const mockGetSupporterStripeCustomerId = vi.fn();
const mockCreatePortalSession = vi.fn();
class MockSupporterCustomerLookupUnavailableError extends Error {}
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3');
  return {
    ...actual,
    readBody: (...args: unknown[]) => mockReadBody(...args),
  };
});
vi.mock('stripe', () => {
  function StripeMock() {
    return {
      billingPortal: {
        sessions: { create: (...args: unknown[]) => mockCreatePortalSession(...args) },
      },
    };
  }
  return { default: StripeMock };
});
vi.mock('@/server/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));
vi.mock('@/server/utils/supporterCustomerLookup', () => ({
  SupporterCustomerLookupUnavailableError: MockSupporterCustomerLookupUnavailableError,
  getSupporterStripeCustomerId: (...args: unknown[]) => mockGetSupporterStripeCustomerId(...args),
}));
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
function makeEvent(authUser: { id?: string; email?: string } | null): H3Event {
  return {
    context: authUser ? { auth: { user: authUser } } : ({} as H3EventContext),
  } as unknown as H3Event;
}
describe('POST /api/stripe/portal', () => {
  beforeEach(() => {
    mockReadBody.mockReset();
    mockGetSupporterStripeCustomerId.mockReset();
    mockCreatePortalSession.mockReset();
    runtimeConfig.stripeSecretKey = 'sk_test_123';
    runtimeConfig.public.appUrl = 'https://tarkovtracker.org';
  });
  afterEach(() => {
    vi.resetModules();
  });
  it('throws 500 when Stripe is not configured', async () => {
    runtimeConfig.stripeSecretKey = '';
    const { default: handler } = await import('@/server/api/stripe/portal.post');
    const event = makeEvent({ id: 'user-1' });
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 500 });
  });
  it('throws 401 when there is no authenticated user', async () => {
    const { default: handler } = await import('@/server/api/stripe/portal.post');
    await expect(handler(makeEvent(null))).rejects.toMatchObject({ statusCode: 401 });
  });
  it('throws 404 when no Stripe customer is on file', async () => {
    mockGetSupporterStripeCustomerId.mockResolvedValue(null);
    mockReadBody.mockResolvedValue({});
    const { default: handler } = await import('@/server/api/stripe/portal.post');
    await expect(handler(makeEvent({ id: 'user-1' }))).rejects.toMatchObject({ statusCode: 404 });
  });
  it('throws 500 when the supporter customer lookup is unavailable', async () => {
    mockGetSupporterStripeCustomerId.mockRejectedValue(
      new MockSupporterCustomerLookupUnavailableError('missing config')
    );
    mockReadBody.mockResolvedValue({});
    const { default: handler } = await import('@/server/api/stripe/portal.post');
    await expect(handler(makeEvent({ id: 'user-1' }))).rejects.toMatchObject({ statusCode: 500 });
    expect(mockCreatePortalSession).not.toHaveBeenCalled();
  });
  it('creates a portal session with the configured app return url by default', async () => {
    mockGetSupporterStripeCustomerId.mockResolvedValue('cus_123');
    mockReadBody.mockResolvedValue({});
    mockCreatePortalSession.mockResolvedValue({ url: 'https://billing.stripe.com/p/x' });
    const { default: handler } = await import('@/server/api/stripe/portal.post');
    const result = await handler(makeEvent({ id: 'user-1' }));
    expect(result).toEqual({ url: 'https://billing.stripe.com/p/x' });
    expect(mockCreatePortalSession).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://tarkovtracker.org/supporter',
    });
  });
  it('honors a same-origin returnUrl', async () => {
    mockGetSupporterStripeCustomerId.mockResolvedValue('cus_123');
    mockReadBody.mockResolvedValue({ returnUrl: 'https://tarkovtracker.org/supporter?ref=app' });
    mockCreatePortalSession.mockResolvedValue({ url: 'https://billing.stripe.com/p/x' });
    const { default: handler } = await import('@/server/api/stripe/portal.post');
    await handler(makeEvent({ id: 'user-1' }));
    expect(mockCreatePortalSession).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://tarkovtracker.org/supporter?ref=app',
    });
  });
  it('falls back to the default return url for cross-origin returnUrl', async () => {
    mockGetSupporterStripeCustomerId.mockResolvedValue('cus_123');
    mockReadBody.mockResolvedValue({ returnUrl: 'https://evil.example.com/phish' });
    mockCreatePortalSession.mockResolvedValue({ url: 'https://billing.stripe.com/p/x' });
    const { default: handler } = await import('@/server/api/stripe/portal.post');
    await handler(makeEvent({ id: 'user-1' }));
    expect(mockCreatePortalSession).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://tarkovtracker.org/supporter',
    });
  });
  it('throws 502 when Stripe rejects the request', async () => {
    mockGetSupporterStripeCustomerId.mockResolvedValue('cus_123');
    mockReadBody.mockResolvedValue({});
    mockCreatePortalSession.mockRejectedValue(new Error('stripe down'));
    const { default: handler } = await import('@/server/api/stripe/portal.post');
    await expect(handler(makeEvent({ id: 'user-1' }))).rejects.toMatchObject({ statusCode: 502 });
  });
});
