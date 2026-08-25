import type { Database } from './database.types.ts';
const AUTH_DELETE_MAX_ATTEMPTS = 4;
const AUTH_DELETE_BASE_DELAY_MS = 300;
const AUTH_DELETE_MAX_DELAY_MS = 5000;
const CLEANUP_MAX_ATTEMPTS = 5;
const CLEANUP_BASE_DELAY_MS = 5 * 60 * 1000;
const CLEANUP_MAX_DELAY_MS = 60 * 60 * 1000;
interface FilterBuilder<T> {
  eq(column: string, value: unknown): FilterBuilder<T>;
  or(filter: string): Promise<{ error: unknown }>;
  limit(count: number): FilterBuilder<T>;
  then<TResult1 = { data: T[] | null; error: unknown }>(
    onfulfilled?:
      ((value: { data: T[] | null; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null
  ): PromiseLike<TResult1>;
}
interface TransformBuilder {
  eq(column: string, value: unknown): Promise<{ error: unknown }>;
  or(filter: string): Promise<{ error: unknown }>;
}
export interface AccountDeletionClient {
  from<T extends keyof Database['public']['Tables']>(
    table: T
  ): {
    select(columns?: string): FilterBuilder<Database['public']['Tables'][T]['Row']>;
    update(values: unknown): TransformBuilder;
    delete(): TransformBuilder;
  };
  auth: {
    admin: {
      deleteUser(id: string): Promise<{ error: unknown }>;
    };
  };
  rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}
export interface DeletionJobState {
  attempts: number;
  maxAttempts: number;
  status: string | null;
}
const getRpcResult = (data: unknown) => {
  if (!Array.isArray(data)) return null;
  const result: unknown = data[0];
  return result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
};
export const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
export const getErrorMessage = (error: unknown) => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message);
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};
export const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  if (error && typeof error === 'object') return error;
  return { message: String(error) };
};
export const isNotFoundError = (error: unknown) => {
  if (error && typeof error === 'object') {
    if ('status' in error && (error as { status?: number }).status === 404) return true;
    if ('code' in error) {
      const code = (error as { code?: string }).code;
      if (code === 'user_not_found' || code === '404') return true;
    }
  }
  const message = getErrorMessage(error).toLowerCase();
  return (
    message === 'user not found' ||
    message.includes('no user') ||
    (message.includes('user') && message.includes('not found'))
  );
};
export const computeBackoffMs = (
  attempt: number,
  baseMs: number,
  maxMs: number,
  random = Math.random
) => {
  const jitter = Math.floor(random() * 250);
  const delay = baseMs * Math.pow(2, Math.max(0, attempt - 1)) + jitter;
  return Math.min(delay, maxMs);
};
export const deleteUserWithRetry = async (
  supabase: AccountDeletionClient,
  userId: string,
  wait = sleep
): Promise<{ ok: boolean; attempts: number; lastError: unknown | null }> => {
  let lastError: unknown | null = null;
  for (let attempt = 1; attempt <= AUTH_DELETE_MAX_ATTEMPTS; attempt += 1) {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (!error || isNotFoundError(error)) {
      return { ok: true, attempts: attempt, lastError: null };
    }
    lastError = error;
    if (attempt < AUTH_DELETE_MAX_ATTEMPTS) {
      await wait(computeBackoffMs(attempt, AUTH_DELETE_BASE_DELAY_MS, AUTH_DELETE_MAX_DELAY_MS));
    }
  }
  return { ok: false, attempts: AUTH_DELETE_MAX_ATTEMPTS, lastError };
};
export const cleanupUserData = async (supabase: AccountDeletionClient, userId: string) => {
  const deletions = [
    ['team_memberships', supabase.from('team_memberships').delete().eq('user_id', userId)],
    ['api_tokens', supabase.from('api_tokens').delete().eq('user_id', userId)],
    ['user_progress', supabase.from('user_progress').delete().eq('user_id', userId)],
    ['user_preferences', supabase.from('user_preferences').delete().eq('user_id', userId)],
    ['user_system', supabase.from('user_system').delete().eq('user_id', userId)],
    [
      'team_events',
      supabase
        .from('team_events')
        .delete()
        .or(`initiated_by.eq.${userId},target_user.eq.${userId}`),
    ],
  ] as const;
  const cleanupErrors: Record<string, string> = {};
  const results = await Promise.allSettled(deletions.map(([, deletion]) => deletion));
  results.forEach((result, index) => {
    const table = deletions[index][0];
    if (result.status === 'rejected') {
      cleanupErrors[table] = getErrorMessage(result.reason);
    } else if (result.value.error) {
      cleanupErrors[table] = getErrorMessage(result.value.error);
    }
  });
  return cleanupErrors;
};
export const getDeletionJobState = async (
  supabase: AccountDeletionClient,
  userId: string,
  logPrefix: string
): Promise<DeletionJobState> => {
  const { data, error } = await supabase
    .from('account_deletion_jobs')
    .select('attempts,max_attempts,status')
    .eq('user_id', userId)
    .limit(1);
  if (error) console.error(`${logPrefix} Failed to fetch deletion job state:`, error);
  const job = data?.[0];
  return {
    attempts: job?.attempts ?? 0,
    maxAttempts: job?.max_attempts ?? CLEANUP_MAX_ATTEMPTS,
    status: job?.status ?? null,
  };
};
export const recordDeletionFailure = async (
  supabase: AccountDeletionClient,
  userId: string,
  reason: string,
  details: Record<string, unknown>,
  logPrefix: string
) => {
  const now = new Date().toISOString();
  const { attempts, maxAttempts } = await getDeletionJobState(supabase, userId, logPrefix);
  const nextAttempts = attempts + 1;
  const deadLetter = nextAttempts >= maxAttempts;
  const nextRunAt = deadLetter
    ? null
    : new Date(
        Date.now() + computeBackoffMs(nextAttempts, CLEANUP_BASE_DELAY_MS, CLEANUP_MAX_DELAY_MS)
      ).toISOString();
  const { error } = await supabase
    .from('account_deletion_jobs')
    .update({
      status: deadLetter ? 'dead_lettered' : 'failed',
      attempts: nextAttempts,
      last_error: reason,
      last_error_details: details,
      last_error_at: now,
      next_run_at: nextRunAt,
      updated_at: now,
      completed_at: null,
      dead_lettered_at: deadLetter ? now : null,
    })
    .eq('user_id', userId);
  if (error) console.error(`${logPrefix} Failed to update deletion job:`, error);
  if (deadLetter) {
    console.error(`${logPrefix} Deletion job dead-lettered:`, { userId, reason, details });
  }
};
export const markDeletionCompleted = async (
  supabase: AccountDeletionClient,
  userId: string,
  logPrefix: string
) => {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('account_deletion_jobs')
    .update({
      status: 'completed',
      updated_at: now,
      completed_at: now,
      last_error: null,
      last_error_details: null,
      last_error_at: null,
      next_run_at: null,
      dead_lettered_at: null,
    })
    .eq('user_id', userId);
  if (error) console.error(`${logPrefix} Failed to mark deletion job completed:`, error);
};
export const claimDeletionJob = async (
  supabase: AccountDeletionClient,
  userId: string,
  createIfMissing: boolean
) => {
  const { data, error } = await supabase.rpc('claim_account_deletion_job', {
    p_user_id: userId,
    p_create_if_missing: createIfMissing,
  });
  const result = getRpcResult(data);
  return {
    claimed: result?.claimed === true,
    status: typeof result?.status === 'string' ? result.status : null,
    error,
  };
};
export const consumeDeletionAttempt = async (
  supabase: AccountDeletionClient,
  userId: string,
  ipAddress: string | null,
  userAgent: string | null
) => {
  const { data, error } = await supabase.rpc('consume_account_deletion_attempt', {
    p_user_id: userId,
    p_ip_address: ipAddress,
    p_user_agent: userAgent,
  });
  const result = getRpcResult(data);
  return {
    allowed: result?.allowed === true,
    retryAfterSeconds:
      typeof result?.retry_after_seconds === 'number' ? result.retry_after_seconds : 60,
    error,
  };
};
