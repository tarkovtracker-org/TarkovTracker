import { createError, defineEventHandler, getQuery } from 'h3';
import { createLogger } from '@/server/utils/logger';
const logger = createLogger('AdminApiUsage');
interface UsageRow {
  user_id: string;
  token_id: string;
  day: string;
  tier: string;
  reads: number;
  writes: number;
  throttled: number;
}
interface ConsumerSummary {
  userId: string;
  tokenId: string;
  tier: string;
  reads: number;
  writes: number;
  throttled: number;
}
export default defineEventHandler(async (event) => {
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
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sinceDay = since.toISOString().slice(0, 10);
  const rows = await supabaseFetch<UsageRow[]>(
    supabaseUrl,
    serviceKey,
    `/rest/v1/api_usage_daily?day=gte.${sinceDay}&select=user_id,token_id,day,tier,reads,writes,throttled&order=day.desc&limit=2000`
  );
  const byToken = new Map<string, ConsumerSummary>();
  for (const row of rows) {
    const key = `${row.user_id}:${row.token_id}`;
    const entry = byToken.get(key) ?? {
      userId: row.user_id,
      tokenId: row.token_id,
      tier: row.tier,
      reads: 0,
      writes: 0,
      throttled: 0,
    };
    entry.tier = row.tier;
    entry.reads += row.reads;
    entry.writes += row.writes;
    entry.throttled += row.throttled;
    byToken.set(key, entry);
  }
  const consumers = [...byToken.values()]
    .sort((a, b) => b.reads + b.writes - (a.reads + a.writes))
    .slice(0, limit);
  return { since: sinceDay, consumers };
});
function readLimit(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(Math.floor(parsed), 100);
}
async function getIsAdmin(
  supabaseUrl: string,
  serviceKey: string,
  userId: string
): Promise<boolean> {
  const rows = await supabaseFetch<Array<{ is_admin: boolean | null }>>(
    supabaseUrl,
    serviceKey,
    `/rest/v1/user_system?select=is_admin&user_id=eq.${encodeURIComponent(userId)}&limit=1`
  );
  return rows[0]?.is_admin === true;
}
async function supabaseFetch<T>(
  supabaseUrl: string,
  serviceKey: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
  } catch (error) {
    logger.error('[AdminApiUsage] Supabase request failed', { path, error });
    throw createError({ statusCode: 502, message: 'Supabase request failed' });
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error('[AdminApiUsage] Supabase request error', {
      path,
      status: response.status,
      body: body.slice(0, 300),
    });
    throw createError({ statusCode: 502, message: 'Supabase request error' });
  }
  return (await response.json()) as T;
}
