import type { ApiTier } from '../limits';
import type { Env } from '../types';

const USAGE_RPC_TIMEOUT_MS = 3000;

export interface UsageRecord {
  userId: string;
  tokenId: string;
  tier: ApiTier;
  kind: 'read' | 'write';
  throttled: boolean;
}

/**
 * Record one API request into public.api_usage_daily via the atomic
 * record_api_usage RPC. Best-effort: failures are logged, never surfaced.
 */
export async function recordUsage(env: Env, record: UsageRecord): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), USAGE_RPC_TIMEOUT_MS);
  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/record_api_usage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        'content-type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        p_user_id: record.userId,
        p_token_id: record.tokenId,
        p_tier: record.tier,
        p_reads: record.kind === 'read' && !record.throttled ? 1 : 0,
        p_writes: record.kind === 'write' && !record.throttled ? 1 : 0,
        p_throttled: record.throttled ? 1 : 0,
      }),
    });
    if (!response.ok) {
      console.warn('recordUsage failed', { status: response.status });
    }
  } catch (error) {
    console.warn('recordUsage error', { error });
  } finally {
    clearTimeout(timeout);
  }
}
