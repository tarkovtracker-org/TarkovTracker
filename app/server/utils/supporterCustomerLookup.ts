import { createLogger } from '@/server/utils/logger';
import type { H3Event } from 'h3';
const logger = createLogger('SupporterCustomerLookup');
const LOOKUP_TIMEOUT_MS = 5000;
export class SupporterCustomerLookupUnavailableError extends Error {
  constructor(message = 'Supporter customer lookup unavailable') {
    super(message);
    this.name = 'SupporterCustomerLookupUnavailableError';
  }
}
interface SupporterCustomerLookupOptions {
  throwOnUnavailable?: boolean;
}
export interface SupporterBillingState {
  status: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  type: string | null;
}
/**
 * Look up the supporter's Stripe billing state via Supabase service role.
 */
export async function getSupporterBillingState(
  event: H3Event,
  userId: string,
  options: SupporterCustomerLookupOptions = {}
): Promise<SupporterBillingState | null> {
  const config = useRuntimeConfig(event);
  const supabaseUrl = (config.supabaseUrl as string) || '';
  const serviceKey = (config.supabaseServiceKey as string) || '';
  if (!supabaseUrl || !serviceKey) {
    if (options.throwOnUnavailable) {
      throw new SupporterCustomerLookupUnavailableError('Supabase service config missing');
    }
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const url = `${supabaseUrl}/rest/v1/supporters?select=stripe_customer_id,stripe_subscription_id,status,type&user_id=eq.${encodeURIComponent(userId)}&limit=1`;
    const resp = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      logger.warn('Supporter lookup failed', { userId, status: resp.status });
      if (options.throwOnUnavailable) {
        throw new SupporterCustomerLookupUnavailableError('Supabase supporter lookup failed');
      }
      return null;
    }
    const rows = (await resp.json()) as Array<{
      status: string | null;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
      type: string | null;
    }>;
    const row = rows?.[0];
    if (!row) return null;
    return {
      status: row.status,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      type: row.type,
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      logger.warn('Supporter lookup timed out', { userId });
      if (options.throwOnUnavailable) {
        throw new SupporterCustomerLookupUnavailableError('Supabase supporter lookup timed out');
      }
      return null;
    }
    if (err instanceof SupporterCustomerLookupUnavailableError) {
      throw err;
    }
    logger.warn('Supporter lookup threw', { userId, err });
    if (options.throwOnUnavailable) {
      throw new SupporterCustomerLookupUnavailableError('Supabase supporter lookup threw');
    }
    return null;
  }
}
export async function getSupporterStripeCustomerId(
  event: H3Event,
  userId: string,
  options: SupporterCustomerLookupOptions = {}
): Promise<string | null> {
  const state = await getSupporterBillingState(event, userId, options);
  const customerId = state?.stripeCustomerId;
  return typeof customerId === 'string' && customerId.length > 0 ? customerId : null;
}
