import { createHmac } from 'node:crypto';
import { createError, defineEventHandler, getRequestHeader } from 'h3';
import { adminSupabaseFetch } from '@/server/utils/adminSupabase';
import { getClientAddress } from '@/server/utils/requestIdentity';
import { logger } from '@/utils/logger';
import type { H3Event } from 'h3';
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const authUser = (event.context as { auth?: { user?: { id?: string } } }).auth?.user;
  const userId = authUser?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }
  const supabaseUrl = configString(config.supabaseUrl).replace(/\/$/, '');
  const serviceKey = configString(config.supabaseServiceKey);
  const hashSecret = configString(config.accountIpHashSecret);
  requireActivityConfiguration(supabaseUrl, serviceKey);
  await adminSupabaseFetch(supabaseUrl, serviceKey, '/rest/v1/rpc/record_account_activity', {
    method: 'POST',
    body: JSON.stringify({ p_user_id: userId }),
  });
  try {
    await recordIpAudit(event, supabaseUrl, serviceKey, hashSecret, userId);
  } catch (error) {
    logger.warn('[account/activity] Failed to record IP audit:', error);
  }
  return { recorded: true };
});
function configString(value: unknown) {
  return String(value || '');
}
function auditUserAgent(event: H3Event) {
  return getRequestHeader(event, 'user-agent')?.slice(0, 512) || null;
}
function requireActivityConfiguration(supabaseUrl: string, serviceKey: string) {
  if (!supabaseUrl || !serviceKey) {
    throw createError({ statusCode: 500, message: 'Account activity is not configured' });
  }
}
async function recordIpAudit(
  event: H3Event,
  supabaseUrl: string,
  serviceKey: string,
  hashSecret: string,
  userId: string
) {
  if (!hashSecret) return;
  const config = useRuntimeConfig(event);
  const trustProxy = Boolean(
    (config.apiProtection as { trustProxy?: boolean } | undefined)?.trustProxy
  );
  const clientAddress = getClientAddress(event, trustProxy);
  if (!clientAddress) {
    return;
  }
  const ipHash = createHmac('sha256', hashSecret).update(clientAddress).digest('hex');
  const userAgent = auditUserAgent(event);
  await adminSupabaseFetch(
    supabaseUrl,
    serviceKey,
    '/rest/v1/account_ip_audit?on_conflict=user_id,ip_hash',
    {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        ip_hash: ipHash,
        last_seen_at: new Date().toISOString(),
        last_user_agent: userAgent,
      }),
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
    }
  );
}
