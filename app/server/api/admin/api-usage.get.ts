import { createError, defineEventHandler, getQuery } from 'h3';
import { adminSupabaseFetch, getIsAdmin } from '@/server/utils/adminSupabase';
interface UsageSummaryRow {
  user_id: string;
  token_id: string;
  tier: string;
  reads: number;
  writes: number;
  throttled: number;
  user_agent: string | null;
}
interface ConsumerSummary {
  userId: string;
  tokenId: string;
  tier: string;
  reads: number;
  writes: number;
  throttled: number;
  userAgent: string | null;
}
interface ApiUsageResponse {
  since: string;
  consumers: ConsumerSummary[];
}
export default defineEventHandler(async (event): Promise<ApiUsageResponse> => {
  const config = useRuntimeConfig(event);
  const supabaseUrl = ((config.supabaseUrl as string) || '').replace(/\/$/, '');
  const serviceKey = (config.supabaseServiceKey as string) || '';
  if (!supabaseUrl || !serviceKey) {
    throw createError({ statusCode: 500, message: 'Supabase service config missing' });
  }
  const authUser = (event.context as { auth?: { user?: { id?: string } } }).auth?.user;
  const adminUserId = authUser?.id;
  if (!adminUserId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }
  const isAdmin = await getIsAdmin(supabaseUrl, serviceKey, adminUserId);
  if (!isAdmin) {
    throw createError({ statusCode: 403, message: 'Admin privileges required' });
  }
  const limit = readLimit(getQuery(event).limit);
  // UTC-day buckets: covers today and yesterday (UTC), not a rolling 24 hours.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sinceDay = since.toISOString().slice(0, 10);
  // Aggregation, ranking, and limiting happen in SQL so no raw rows are
  // truncated before the top consumers are computed.
  const rows = await adminSupabaseFetch<UsageSummaryRow[]>(
    supabaseUrl,
    serviceKey,
    '/rest/v1/rpc/get_api_usage_summary',
    {
      method: 'POST',
      body: JSON.stringify({ p_since: sinceDay, p_limit: limit }),
    }
  );
  const consumers: ConsumerSummary[] = (rows ?? []).map((row) => ({
    userId: row.user_id,
    tokenId: row.token_id,
    tier: row.tier,
    reads: Number(row.reads) || 0,
    writes: Number(row.writes) || 0,
    throttled: Number(row.throttled) || 0,
    userAgent: typeof row.user_agent === 'string' ? row.user_agent : null,
  }));
  return { since: sinceDay, consumers };
});
function readLimit(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return 20;
  return Math.min(Math.floor(parsed), 100);
}
