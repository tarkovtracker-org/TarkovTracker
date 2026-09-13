import type { Database } from './database.types.ts';
const AUTH_DELETE_MAX_ATTEMPTS = 4;
const AUTH_DELETE_BASE_DELAY_MS = 300;
const AUTH_DELETE_MAX_DELAY_MS = 5000;
const CLEANUP_MAX_ATTEMPTS = 5;
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
  gte(column: string, value: unknown): AccountDeletionTransformBuilder;
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
  supabase: Pick<AccountDeletionClient, 'auth'>,
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
export const getDeletionJobState = async (
  supabase: AccountDeletionClient,
  userId: string,
  logPrefix: string
): Promise<DeletionJobState> => {
  const { data, error } = await supabase.rpc('account_lifecycle_jobs', {
    p_user_id: userId,
    p_limit: 1,
  });
  if (error) {
    console.error(`${logPrefix} Failed to fetch deletion job state`);
    return { ...DEFAULT_DELETION_JOB_STATE, status: 'state_unavailable' };
  }
  const job = Array.isArray(data) ? data[0] : undefined;
  if (!job) return { ...DEFAULT_DELETION_JOB_STATE, status: 'hold' };
  return { attempts: job.attempts, maxAttempts: job.max_attempts, status: job.status };
};
export const recordDeletionFailure = async (
  supabase: AccountDeletionClient,
  userId: string,
  claimToken: string,
  reason: string,
  details: Record<string, unknown>,
  logPrefix: string
) => {
  const { data, error } = await supabase.rpc('fail_account_lifecycle', {
    p_user_id: userId,
    p_claim_token: claimToken,
    p_reason: reason,
    p_stage: failureStage(details),
  });
  if (error) {
    console.error(`${logPrefix} Failed to record deletion failure`);
    return 'error';
  }
  return data === true ? 'persisted' : 'lease_lost';
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
    claimToken: getRpcBoolean(result, 'claimed') ? getRpcString(result, 'claim_token') : null,
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
function failureStage(details: Record<string, unknown>): string {
  if (typeof details !== 'object' || details === null) return 'unknown';
  return 'stage' in details ? String(details.stage) : 'unknown';
}
