import { createHmac } from 'node:crypto';
import { createError, defineEventHandler, getRequestHeader } from 'h3';
import { adminSupabaseFetch } from '@/server/utils/adminSupabase';
import { getClientAddress } from '@/server/utils/requestIdentity';
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const authUser = (event.context as { auth?: { user?: { id?: string } } }).auth?.user;
  const userId = authUser?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }
  const supabaseUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
  const serviceKey = String(config.supabaseServiceKey || '');
  const hashSecret = String(config.accountIpHashSecret || '');
  if (!supabaseUrl || !serviceKey || !hashSecret) {
    throw createError({ statusCode: 500, message: 'Account activity audit is not configured' });
  }
  const trustProxy = Boolean(
    (config.apiProtection as { trustProxy?: boolean } | undefined)?.trustProxy
  );
  const clientAddress = getClientAddress(event, trustProxy);
  if (!clientAddress) {
    return { recorded: false };
  }
  const ipHash = createHmac('sha256', hashSecret).update(clientAddress).digest('hex');
  const userAgent = getRequestHeader(event, 'user-agent')?.slice(0, 512) || null;
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
  return { recorded: true };
});
