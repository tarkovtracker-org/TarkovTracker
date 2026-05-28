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
/**
 * Look up the supporter's Stripe customer id via Supabase service role.
 * Returns null on missing config, missing row, or any error so callers can
 * decide whether to fall back (checkout) or fail loudly (billing portal).
 */
export async function getSupporterStripeCustomerId(
  event: H3Event,
  userId: string,
  options: SupporterCustomerLookupOptions = {}
): Promise<string | null> {
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
    const url =
      `${supabaseUrl}/rest/v1/supporters` +
      `?select=stripe_customer_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`;
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
    const rows = (await resp.json()) as Array<{ stripe_customer_id: string | null }>;
    const cid = rows?.[0]?.stripe_customer_id;
    return typeof cid === 'string' && cid.length > 0 ? cid : null;
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
