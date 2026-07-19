// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event, H3EventContext } from 'h3';
const runtimeConfig = {
  public: { appUrl: 'https://tarkovtracker.org' },
  stripeSecretKey: 'sk_test_123',
  stripePriceScavMonthly: 'price_scav_monthly',
  supabaseServiceKey: 'service-key',
  supabaseUrl: 'https://test.supabase.co',
} as Record<string, unknown> & { public: { appUrl: string } };
const mockReadBody = vi.fn();
const mockGetSupporterBillingState = vi.fn();
const mockCreateCheckoutSession = vi.fn();
const mockLoggerError = vi.fn();
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
      checkout: {
        sessions: { create: (...args: unknown[]) => mockCreateCheckoutSession(...args) },
      },
    };
  }
  return { default: StripeMock };
});
vi.mock('@/server/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: (...args: unknown[]) => mockLoggerError(...args),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));
vi.mock('@/server/utils/supporterCustomerLookup', () => ({
  SupporterCustomerLookupUnavailableError: MockSupporterCustomerLookupUnavailableError,
  getSupporterBillingState: (...args: unknown[]) => mockGetSupporterBillingState(...args),
}));
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
function makeEvent(authUser: { id?: string; email?: string } | null): H3Event {
  return {
    context: authUser ? { auth: { user: authUser } } : ({} as H3EventContext),
  } as unknown as H3Event;
}
type CheckoutSessionArgs = {
  mode: string;
  client_reference_id: string;
  customer?: string;
  customer_creation?: string;
  customer_email?: string;
  metadata?: Record<string, string>;
  line_items: [
    {
      price?: string;
      price_data?: { unit_amount: number };
    },
  ];
};
function firstSessionArgs(): CheckoutSessionArgs {
  const args = mockCreateCheckoutSession.mock.calls[0]?.[0];
  expect(args).toBeDefined();
  return args as CheckoutSessionArgs;
}
describe('POST /api/stripe/checkout', () => {
  beforeEach(() => {
    mockReadBody.mockReset();
    mockGetSupporterBillingState.mockReset();
    mockCreateCheckoutSession.mockReset();
    mockLoggerError.mockReset();
    runtimeConfig.stripeSecretKey = 'sk_test_123';
    runtimeConfig.stripePriceScavMonthly = 'price_scav_monthly';
    runtimeConfig.public.appUrl = 'https://tarkovtracker.org';
  });
  afterEach(() => {
    vi.resetModules();
  });
  it('throws 500 when Stripe is not configured', async () => {
    runtimeConfig.stripeSecretKey = '';
    const { default: handler } = await import('@/server/api/stripe/checkout.post');
    await expect(handler(makeEvent({ id: 'user-1' }))).rejects.toMatchObject({ statusCode: 500 });
  });
  it('throws 401 when there is no authenticated user', async () => {
    const { default: handler } = await import('@/server/api/stripe/checkout.post');
    await expect(handler(makeEvent(null))).rejects.toMatchObject({ statusCode: 401 });
  });
  it('rejects an invalid request body with 400', async () => {
    mockGetSupporterBillingState.mockResolvedValue(null);
    mockReadBody.mockResolvedValue({ mode: 'nonsense' });
    const { default: handler } = await import('@/server/api/stripe/checkout.post');
    await expect(handler(makeEvent({ id: 'user-1' }))).rejects.toMatchObject({ statusCode: 400 });
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });
  it('creates a one-time payment session and reuses an existing customer', async () => {
    mockGetSupporterBillingState.mockResolvedValue({
      status: 'expired',
      stripeCustomerId: 'cus_existing',
      stripeSubscriptionId: null,
      type: 'one_time',
    });
    mockReadBody.mockResolvedValue({ mode: 'payment', amount: 10 });
    mockCreateCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay' });
    const { default: handler } = await import('@/server/api/stripe/checkout.post');
    const result = await handler(makeEvent({ id: 'user-1', email: 'user@example.com' }));
    expect(result).toEqual({ url: 'https://checkout.stripe.com/c/pay' });
    const args = firstSessionArgs();
    expect(args).toMatchObject({
      mode: 'payment',
      client_reference_id: 'user-1',
      customer: 'cus_existing',
    });
    expect(args.customer_email).toBeUndefined();
    expect(args.customer_creation).toBeUndefined();
    expect(args.line_items[0].price_data?.unit_amount).toBe(1000);
  });
  it('falls back to customer_email for a first-time one-time supporter', async () => {
    mockGetSupporterBillingState.mockResolvedValue(null);
    mockReadBody.mockResolvedValue({ mode: 'payment', amount: 5 });
    mockCreateCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay' });
    const { default: handler } = await import('@/server/api/stripe/checkout.post');
    await handler(makeEvent({ id: 'user-1', email: 'user@example.com' }));
    const args = firstSessionArgs();
    expect(args.customer).toBeUndefined();
    expect(args.customer_email).toBe('user@example.com');
    expect(args.customer_creation).toBe('always');
  });
  it('rejects a one-time amount below the minimum with 400', async () => {
    mockGetSupporterBillingState.mockResolvedValue(null);
    mockReadBody.mockResolvedValue({ mode: 'payment', amount: 1 });
    const { default: handler } = await import('@/server/api/stripe/checkout.post');
    await expect(handler(makeEvent({ id: 'user-1' }))).rejects.toMatchObject({ statusCode: 400 });
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });
  it('throws 502 when Stripe rejects a one-time session', async () => {
    mockGetSupporterBillingState.mockResolvedValue(null);
    mockReadBody.mockResolvedValue({ mode: 'payment', amount: 10 });
    mockCreateCheckoutSession.mockRejectedValue(new Error('stripe down'));
    const { default: handler } = await import('@/server/api/stripe/checkout.post');
    await expect(handler(makeEvent({ id: 'user-1' }))).rejects.toMatchObject({ statusCode: 502 });
  });
  it('rejects the generic supporter tier in subscription mode with 400', async () => {
    mockGetSupporterBillingState.mockResolvedValue(null);
    mockReadBody.mockResolvedValue({
      mode: 'subscription',
      tier: 'supporter',
      interval: 'monthly',
    });
    const { default: handler } = await import('@/server/api/stripe/checkout.post');
    await expect(handler(makeEvent({ id: 'user-1' }))).rejects.toMatchObject({ statusCode: 400 });
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });
  it('throws 400 when interval is missing in subscription mode', async () => {
    mockGetSupporterBillingState.mockResolvedValue(null);
    mockReadBody.mockResolvedValue({ mode: 'subscription', tier: 'scav' });
    const { default: handler } = await import('@/server/api/stripe/checkout.post');
    await expect(handler(makeEvent({ id: 'user-1' }))).rejects.toMatchObject({ statusCode: 400 });
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });
  it('throws 500 when the resolved price is not configured', async () => {
    runtimeConfig.stripePriceScavMonthly = '';
    mockGetSupporterBillingState.mockResolvedValue(null);
    mockReadBody.mockResolvedValue({ mode: 'subscription', tier: 'scav', interval: 'monthly' });
    const { default: handler } = await import('@/server/api/stripe/checkout.post');
    await expect(handler(makeEvent({ id: 'user-1' }))).rejects.toMatchObject({ statusCode: 500 });
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });
  it('creates a subscription session with the configured price', async () => {
    mockGetSupporterBillingState.mockResolvedValue({
      status: 'expired',
      stripeCustomerId: 'cus_existing',
      stripeSubscriptionId: null,
      type: 'one_time',
    });
    mockReadBody.mockResolvedValue({ mode: 'subscription', tier: 'scav', interval: 'monthly' });
    mockCreateCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/c/sub' });
    const { default: handler } = await import('@/server/api/stripe/checkout.post');
    const result = await handler(makeEvent({ id: 'user-1', email: 'user@example.com' }));
    expect(result).toEqual({ url: 'https://checkout.stripe.com/c/sub' });
    const args = firstSessionArgs();
    expect(args).toMatchObject({
      mode: 'subscription',
      client_reference_id: 'user-1',
      customer: 'cus_existing',
    });
    expect(args.line_items[0].price).toBe('price_scav_monthly');
    expect(args.metadata).toMatchObject({ tier: 'scav', interval: 'monthly' });
  });
  it('rejects a second Checkout subscription for an active subscriber', async () => {
    mockGetSupporterBillingState.mockResolvedValue({
      status: 'active',
      stripeCustomerId: 'cus_existing',
      stripeSubscriptionId: 'sub_existing',
      type: 'subscription',
    });
    mockReadBody.mockResolvedValue({ mode: 'subscription', tier: 'scav', interval: 'monthly' });
    const { default: handler } = await import('@/server/api/stripe/checkout.post');
    await expect(handler(makeEvent({ id: 'user-1' }))).rejects.toMatchObject({ statusCode: 409 });
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });
  it('rejects a second Checkout subscription for a trialing subscriber', async () => {
    mockGetSupporterBillingState.mockResolvedValue({
      status: 'trialing',
      stripeCustomerId: 'cus_existing',
      stripeSubscriptionId: 'sub_existing',
      type: 'subscription',
    });
    mockReadBody.mockResolvedValue({ mode: 'subscription', tier: 'scav', interval: 'monthly' });
    const { default: handler } = await import('@/server/api/stripe/checkout.post');
    await expect(handler(makeEvent({ id: 'user-1' }))).rejects.toMatchObject({ statusCode: 409 });
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });
  it('fails closed when existing subscription state cannot be verified', async () => {
    mockGetSupporterBillingState.mockRejectedValue(
      new MockSupporterCustomerLookupUnavailableError('network unavailable')
    );
    mockReadBody.mockResolvedValue({ mode: 'subscription', tier: 'scav', interval: 'monthly' });
    const { default: handler } = await import('@/server/api/stripe/checkout.post');
    await expect(handler(makeEvent({ id: 'user-1' }))).rejects.toMatchObject({ statusCode: 503 });
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[Stripe Checkout] Supporter customer lookup unavailable',
      expect.objectContaining({
        userId: 'user-1',
        mode: 'subscription',
        error: expect.any(MockSupporterCustomerLookupUnavailableError),
      })
    );
  });
  it('throws 502 when Stripe rejects a subscription session', async () => {
    mockGetSupporterBillingState.mockResolvedValue(null);
    mockReadBody.mockResolvedValue({ mode: 'subscription', tier: 'scav', interval: 'monthly' });
    mockCreateCheckoutSession.mockRejectedValue(new Error('stripe down'));
    const { default: handler } = await import('@/server/api/stripe/checkout.post');
    await expect(handler(makeEvent({ id: 'user-1' }))).rejects.toMatchObject({ statusCode: 502 });
  });
});
