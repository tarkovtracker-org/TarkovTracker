import type { SupabaseClient } from '@supabase/supabase-js';
import { corsHeadersFor } from './cors.ts';

export type MutationRateLimitAction =
  | 'team-create'
  | 'team-join'
  | 'team-leave'
  | 'team-kick'
  | 'token-create'
  | 'token-revoke';

type MutationRateLimitConfig = {
  limit: number;
  windowSec: number;
};

type MutationRateLimitResult = {
  allowed?: boolean;
  reset_at?: string | null;
};

const MUTATION_RATE_LIMITS: Record<MutationRateLimitAction, MutationRateLimitConfig> = {
  'team-create': { limit: 10, windowSec: 3600 },
  'team-join': { limit: 30, windowSec: 600 },
  'team-leave': { limit: 30, windowSec: 3600 },
  'team-kick': { limit: 20, windowSec: 3600 },
  'token-create': { limit: 3, windowSec: 3600 },
  'token-revoke': { limit: 50, windowSec: 600 },
};

const createRateLimitResponse = (
  req: Request,
  status: number,
  message: string,
  retryAfterSeconds?: number
) => {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...corsHeadersFor(req),
      'Content-Type': 'application/json',
      ...(retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : {}),
    },
  });
};

const getRetryAfterSeconds = (resetAt: string | null | undefined): number | undefined => {
  if (!resetAt) {
    return undefined;
  }

  const resetAtMs = new Date(resetAt).getTime();
  if (!Number.isFinite(resetAtMs)) {
    return undefined;
  }

  return Math.max(1, Math.ceil((resetAtMs - Date.now()) / 1000));
};

const getRateLimitResult = (
  data: MutationRateLimitResult | MutationRateLimitResult[] | null
): MutationRateLimitResult | null => {
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }

  return data ?? null;
};

export const enforceUserMutationRateLimit = async (
  req: Request,
  supabase: SupabaseClient,
  userId: string,
  action: MutationRateLimitAction
): Promise<Response | null> => {
  const { limit, windowSec } = MUTATION_RATE_LIMITS[action];
  const { data, error } = await supabase.rpc('consume_mutation_rate_limit', {
    p_limit: limit,
    p_scope: action,
    p_subject: userId,
    p_window_seconds: windowSec,
  });

  if (error) {
    console.error(`[rate-limit] Failed to consume ${action} limit for user ${userId}:`, error);
    return createRateLimitResponse(req, 503, 'Rate limiter unavailable');
  }

  const result = getRateLimitResult(
    data as MutationRateLimitResult | MutationRateLimitResult[] | null
  );
  if (!result) {
    console.error(`[rate-limit] Missing ${action} limiter result for user ${userId}`);
    return createRateLimitResponse(req, 503, 'Rate limiter unavailable');
  }

  if (result.allowed === false) {
    const retryAfterSeconds = getRetryAfterSeconds(result.reset_at);
    const message = retryAfterSeconds
      ? `Too many requests. Try again in ${retryAfterSeconds} second(s).`
      : 'Too many requests. Try again later.';
    return createRateLimitResponse(req, 429, message, retryAfterSeconds);
  }

  return null;
};
