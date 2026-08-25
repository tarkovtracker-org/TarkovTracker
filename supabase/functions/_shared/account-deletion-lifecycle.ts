import type { Database } from './database.types.ts';
const AUTH_DELETE_MAX_ATTEMPTS = 4;
const AUTH_DELETE_BASE_DELAY_MS = 300;
const AUTH_DELETE_MAX_DELAY_MS = 5000;
const CLEANUP_MAX_ATTEMPTS = 5;
const CLEANUP_BASE_DELAY_MS = 5 * 60 * 1000;
const CLEANUP_MAX_DELAY_MS = 60 * 60 * 1000;
export interface AccountDeletionFilterBuilder<T> {
  eq(column: string, value: unknown): AccountDeletionFilterBuilder<T>;
  neq(column: string, value: unknown): AccountDeletionFilterBuilder<T>;
  gte(column: string, value: unknown): AccountDeletionFilterBuilder<T>;
  order(column: string, options?: unknown): AccountDeletionFilterBuilder<T>;
  or(filter: string): AccountDeletionFilterBuilder<T>;
  limit(count: number): AccountDeletionFilterBuilder<T>;
  then<TResult1 = { data: T[] | null; error: unknown }>(
    onfulfilled?:
      ((value: { data: T[] | null; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null
  ): PromiseLike<TResult1>;
}
interface AccountDeletionTransformBuilder extends PromiseLike<{ error: unknown }> {
  eq(column: string, value: unknown): AccountDeletionTransformBuilder;
  or(filter: string): AccountDeletionTransformBuilder;
  select(columns?: string): AccountDeletionFilterBuilder<Record<string, unknown>>;
}
export interface AccountDeletionClient {
  from<T extends keyof Database['public']['Tables']>(
    table: T
  ): {
    select(columns?: string): AccountDeletionFilterBuilder<Database['public']['Tables'][T]['Row']>;
    update(values: unknown): AccountDeletionTransformBuilder;
    delete(): AccountDeletionTransformBuilder;
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
const DEFAULT_DELETION_JOB_STATE: DeletionJobState = {
  attempts: 0,
  maxAttempts: CLEANUP_MAX_ATTEMPTS,
  status: null,
};
const getRpcResult = (data: unknown) => {
  if (!Array.isArray(data)) return null;
  const result: unknown = data[0];
  return result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
};
const getRpcBoolean = (result: Record<string, unknown> | null, field: string) =>
  result?.[field] === true;
const getRpcString = (result: Record<string, unknown> | null, field: string) => {
  if (!result) return null;
  const value = result[field];
  return typeof value === 'string' ? value : null;
};
const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
const getObjectErrorMessage = (error: object) => {
  if (!('message' in error)) return null;
  return String((error as { message?: unknown }).message);
};
const stringifyUnknown = (error: unknown) => {
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};
const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;
export const getErrorMessage = (error: unknown) => {
  if (typeof error === 'string') return error;
  if (isObject(error)) return getObjectErrorMessage(error) ?? stringifyUnknown(error);
  return stringifyUnknown(error);
};
export const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  if (error && typeof error === 'object') return error;
  return { message: String(error) };
};
const hasNotFoundStatus = (error: unknown) =>
  Boolean(error && typeof error === 'object' && 'status' in error && error.status === 404);
const hasNotFoundCode = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return ['user_not_found', '404'].includes(String(error.code));
};
const hasNotFoundMessage = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return (
    ['user not found', 'no user'].some((pattern) => message.includes(pattern)) ||
    /user.*not found|not found.*user/.test(message)
  );
};
export const isNotFoundError = (error: unknown) =>
  [hasNotFoundStatus(error), hasNotFoundCode(error), hasNotFoundMessage(error)].some(Boolean);
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
const isDeletionComplete = (error: unknown) => !error || isNotFoundError(error);
export const deleteUserWithRetry = async (
  supabase: AccountDeletionClient,
  userId: string,
  wait = sleep
): Promise<{ ok: boolean; attempts: number; lastError: unknown }> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= AUTH_DELETE_MAX_ATTEMPTS; attempt += 1) {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (isDeletionComplete(error)) {
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
  const job = Array.isArray(data) ? data[0] : undefined;
  if (!job) return DEFAULT_DELETION_JOB_STATE;
  return { attempts: job.attempts, maxAttempts: job.max_attempts, status: job.status };
};
const getFailureTransition = (attempt: number, deadLetter: boolean, now: string) => {
  if (deadLetter) {
    return { status: 'dead_lettered', nextRunAt: null, deadLetteredAt: now } as const;
  }
  const delay = computeBackoffMs(attempt, CLEANUP_BASE_DELAY_MS, CLEANUP_MAX_DELAY_MS);
  return {
    status: 'failed',
    nextRunAt: new Date(Date.now() + delay).toISOString(),
    deadLetteredAt: null,
  } as const;
};
export type DeletionTransitionResult = 'persisted' | 'lease_lost' | 'error';
const getDeletionTransitionResult = (data: unknown, error: unknown): DeletionTransitionResult => {
  if (error) return 'error';
  return Array.isArray(data) && data.length === 1 ? 'persisted' : 'lease_lost';
};
export const recordDeletionFailure = async (
  supabase: AccountDeletionClient,
  userId: string,
  claimToken: string,
  reason: string,
  details: Record<string, unknown>,
  logPrefix: string
) => {
  const now = new Date().toISOString();
  const { attempts, maxAttempts } = await getDeletionJobState(supabase, userId, logPrefix);
  const nextAttempts = attempts + 1;
  const deadLetter = nextAttempts >= maxAttempts;
  const transition = getFailureTransition(nextAttempts, deadLetter, now);
  const { data, error } = await supabase
    .from('account_deletion_jobs')
    .update({
      status: transition.status,
      attempts: nextAttempts,
      last_error: reason,
      last_error_details: details,
      last_error_at: now,
      next_run_at: transition.nextRunAt,
      updated_at: now,
      completed_at: null,
      dead_lettered_at: transition.deadLetteredAt,
      claim_token: null,
    })
    .eq('user_id', userId)
    .eq('claim_token', claimToken)
    .select('user_id')
    .limit(1);
  if (error) console.error(`${logPrefix} Failed to update deletion job:`, error);
  const result = getDeletionTransitionResult(data, error);
  if (deadLetter && result === 'persisted') {
    console.error(`${logPrefix} Deletion job dead-lettered:`, { userId, reason, details });
  }
  return result;
};
export const markDeletionCompleted = async (
  supabase: AccountDeletionClient,
  userId: string,
  claimToken: string,
  logPrefix: string
) => {
  const now = new Date().toISOString();
  const { data, error } = await supabase
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
      claim_token: null,
    })
    .eq('user_id', userId)
    .eq('claim_token', claimToken)
    .select('user_id')
    .limit(1);
  if (error) console.error(`${logPrefix} Failed to mark deletion job completed:`, error);
  return getDeletionTransitionResult(data, error);
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
    claimed: getRpcBoolean(result, 'claimed'),
    status: getRpcString(result, 'status'),
    claimToken: getRpcString(result, 'claim_token'),
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
