import { createError, defineEventHandler, readBody } from 'h3';
import Stripe from 'stripe';
import { createLogger } from '@/server/utils/logger';
import {
  SupporterCustomerLookupUnavailableError,
  getSupporterStripeCustomerId,
} from '@/server/utils/supporterCustomerLookup';
const logger = createLogger('StripePortal');
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const stripeSecretKey = config.stripeSecretKey as string;
  if (!stripeSecretKey) {
    throw createError({ statusCode: 500, message: 'Stripe not configured' });
  }
  const authUser = (event.context as { auth?: { user?: { id?: string; email?: string } } }).auth
    ?.user;
  const userId = authUser?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }
  let customerId: string | null;
  try {
    customerId = await getSupporterStripeCustomerId(event, userId, { throwOnUnavailable: true });
  } catch (err: unknown) {
    if (err instanceof SupporterCustomerLookupUnavailableError) {
      logger.error('[Stripe Portal] Supporter customer lookup unavailable', { userId, err });
      throw createError({
        statusCode: 500,
        message: 'Supporter customer lookup unavailable',
      });
    }
    throw err;
  }
  if (!customerId) {
    throw createError({
      statusCode: 404,
      message: 'No Stripe customer found for this account',
    });
  }
  const body = (await readBody(event).catch(() => null)) as { returnUrl?: unknown } | null;
  const appUrl = (config.public.appUrl as string) || 'https://tarkovtracker.org';
  const returnUrl = sanitizeReturnUrl(body?.returnUrl, appUrl);
  const stripe = new Stripe(stripeSecretKey);
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  } catch (err: unknown) {
    logger.error('[Stripe Portal] Portal session creation failed', { userId, err });
    throw createError({ statusCode: 502, message: 'Failed to create billing portal session' });
  }
});
function sanitizeReturnUrl(raw: unknown, appUrl: string): string {
  const fallback = `${appUrl.replace(/\/$/, '')}/supporter`;
  if (typeof raw !== 'string' || raw.length === 0) {
    return fallback;
  }
  try {
    const parsed = new URL(raw, appUrl);
    const allowedHost = new URL(appUrl).host;
    if (parsed.host !== allowedHost) {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}
