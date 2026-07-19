import {
  authenticateUser,
  handleCorsPreflight,
  validateMethod,
  createErrorResponse,
  createSuccessResponse,
  type AuthSuccess,
} from 'shared/auth';
import type { Database } from '../_shared/database.types.ts';

const AUTH_DELETE_MAX_ATTEMPTS = 4;
const AUTH_DELETE_BASE_DELAY_MS = 300;
const AUTH_DELETE_MAX_DELAY_MS = 5000;
const CLEANUP_BASE_DELAY_MS = 5 * 60 * 1000;
const CLEANUP_MAX_DELAY_MS = 60 * 60 * 1000;
const DEFAULT_BATCH_LIMIT = 20;
const MAX_BATCH_LIMIT = 100;

interface PostgrestFilterBuilder<T> {
  eq(column: string, value: unknown): PostgrestFilterBuilder<T>;
  order(column: string, options?: unknown): PostgrestFilterBuilder<T>;
  or(filter: string): PostgrestFilterBuilder<T>;
  limit(count: number): PostgrestFilterBuilder<T>;
  then<TResult1 = { data: T[] | null; error: unknown }>(
    onfulfilled?:
      | ((value: { data: T[] | null; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null
  ): PromiseLike<TResult1>;
}

interface PostgrestTransformBuilder {
  eq(column: string, value: unknown): Promise<{ error: unknown }>;
  or(filter: string): Promise<{ error: unknown }>;
}

interface TypedSupabaseClient {
  from<T extends keyof Database['public']['Tables']>(
    table: T
  ): {
    select(columns?: string): PostgrestFilterBuilder<Database['public']['Tables'][T]['Row']>;
    update(values: unknown): PostgrestTransformBuilder;
    delete(): PostgrestTransformBuilder;
    upsert(
      values: Database['public']['Tables'][T]['Insert'],
      options?: { onConflict?: string }
    ): Promise<{ error: unknown }>;
  };
  auth: {
    admin: {
      deleteUser(id: string): Promise<{ error: unknown }>;
    };
  };
}

interface ReconcileRequest {
  action?: 'list' | 'process';
  userId?: string;
  limit?: number;
  includeDeadLettered?: boolean;
  dryRun?: boolean;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const getErrorMessage = (error: unknown) => {
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

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  if (error && typeof error === 'object') return error;
  return { message: String(error) };
};

const isNotFoundError = (error: unknown) => {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: number }).status;
    if (status === 404) return true;
  }
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('user not found') ||
    message.includes('no user') ||
    (message.includes('not found') && message.includes('user'))
  );
};

const computeBackoffMs = (attempt: number, baseMs: number, maxMs: number) => {
  const jitter = Math.floor(Math.random() * 250);
  const delay = baseMs * Math.pow(2, Math.max(0, attempt - 1)) + jitter;
  return Math.min(delay, maxMs);
};

const deleteUserWithRetry = async (
  supabase: TypedSupabaseClient,
  userId: string
): Promise<{ ok: boolean; attempts: number; lastError: unknown | null }> => {
  let lastError: unknown | null = null;
  for (let attempt = 1; attempt <= AUTH_DELETE_MAX_ATTEMPTS; attempt += 1) {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (!error || isNotFoundError(error)) {
      return { ok: true, attempts: attempt, lastError: null };
    }
    lastError = error;
    if (attempt < AUTH_DELETE_MAX_ATTEMPTS) {
      const delay = computeBackoffMs(
        attempt,
        AUTH_DELETE_BASE_DELAY_MS,
        AUTH_DELETE_MAX_DELAY_MS
      );
      await sleep(delay);
    }
  }
  return { ok: false, attempts: AUTH_DELETE_MAX_ATTEMPTS, lastError };
};

const cleanupUserData = async (supabase: TypedSupabaseClient, userId: string) => {
  const cleanupErrors: Record<string, string> = {};

  const deletionPromises = [
    {
      tableKey: 'team_memberships',
      promise: supabase.from('team_memberships').delete().eq('user_id', userId),
    },
    {
      tableKey: 'api_tokens',
      promise: supabase.from('api_tokens').delete().eq('user_id', userId),
    },
    {
      tableKey: 'user_progress',
      promise: supabase.from('user_progress').delete().eq('user_id', userId),
    },
    {
      tableKey: 'user_preferences',
      promise: supabase.from('user_preferences').delete().eq('user_id', userId),
    },
    {
      tableKey: 'user_system',
      promise: supabase.from('user_system').delete().eq('user_id', userId),
    },
    {
      tableKey: 'team_events',
      promise: supabase
        .from('team_events')
        .delete()
        .or(`initiated_by.eq.${userId},target_user.eq.${userId}`),
    },
  ].map(({ tableKey, promise }) =>
    promise
      .then(({ error }) => ({ tableKey, error }))
      .catch((error) => {
        const tableError = new Error(`Failed to delete ${tableKey} rows`);
        Object.assign(tableError, { cause: error, tableKey });
        throw tableError;
      })
  );

  const results = await Promise.allSettled(deletionPromises);
  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value.error) {
        cleanupErrors[result.value.tableKey] = getErrorMessage(result.value.error);
      }
      continue;
    }
    const reason = result.reason as { cause?: unknown; tableKey?: string };
    const tableKey = typeof reason?.tableKey === 'string' ? reason.tableKey : 'unknown';
    const error =
      reason && typeof reason === 'object' && 'cause' in reason ? reason.cause : reason;
    cleanupErrors[tableKey] = getErrorMessage(error);
  }

  return cleanupErrors;
};

const getDeletionJobState = async (supabase: TypedSupabaseClient, userId: string) => {
  const { data, error } = await supabase
    .from('account_deletion_jobs')
    .select('attempts,max_attempts,status')
    .eq('user_id', userId)
    .limit(1);
  if (error) {
    console.error('[account-delete-reconcile] Failed to fetch deletion job state:', error);
  }
  const job = data?.[0];
  return {
    attempts: job?.attempts ?? 0,
    maxAttempts: job?.max_attempts ?? 5,
    status: job?.status ?? null,
  };
};

const recordDeletionFailure = async (
  supabase: TypedSupabaseClient,
  userId: string,
  reason: string,
  details: Record<string, unknown>
) => {
  const now = new Date().toISOString();
  const { attempts, maxAttempts } = await getDeletionJobState(supabase, userId);
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
  if (error) {
    console.error('[account-delete-reconcile] Failed to update deletion job:', error);
  }
  if (deadLetter) {
    console.error('[account-delete-reconcile] Deletion job dead-lettered:', {
      userId,
      reason,
      details,
    });
  }
};

const markDeletionCompleted = async (supabase: TypedSupabaseClient, userId: string) => {
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
  if (error) {
    console.error('[account-delete-reconcile] Failed to mark deletion job completed:', error);
  }
};

async function verifyAdminStatus(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_system')
    .select('is_admin')
    .eq('user_id', userId)
    .limit(1);

  if (error || !data || data.length === 0) {
    console.error('[account-delete-reconcile] Error checking admin status:', error);
    return false;
  }

  return data[0]?.is_admin === true;
}

const listJobs = async (
  supabase: TypedSupabaseClient,
  limit: number,
  includeDeadLettered: boolean
) => {
  const statuses = ['pending', 'failed', 'in_progress'];
  if (includeDeadLettered) statuses.push('dead_lettered');
  const statusFilter = statuses.map((status) => `status.eq.${status}`).join(',');
  const selectColumns = [
    'user_id',
    'status',
    'attempts',
    'max_attempts',
    'last_error',
    'last_error_at',
    'next_run_at',
    'updated_at',
    'dead_lettered_at',
  ].join(',');

  const { data, error } = await supabase
    .from('account_deletion_jobs')
    .select(selectColumns)
    .or(statusFilter)
    .order('next_run_at', { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) {
    return { data: null, error } as const;
  }

  return { data: data ?? [], error: null } as const;
};

const processDeletionJob = async (
  supabase: TypedSupabaseClient,
  userId: string,
  dryRun: boolean
) => {
  const now = new Date().toISOString();
  const { status } = await getDeletionJobState(supabase, userId);

  if (status === 'completed') {
    return { userId, status: 'completed', skipped: true };
  }
  if (status === 'dead_lettered') {
    return { userId, status: 'dead_lettered', skipped: true };
  }

  if (dryRun) {
    return { userId, status: status ?? 'pending', dryRun: true };
  }

  const { error: jobUpsertError } = await supabase
    .from('account_deletion_jobs')
    .upsert(
      {
        user_id: userId,
        status: 'in_progress',
        updated_at: now,
        next_run_at: null,
        last_error: null,
        last_error_details: null,
        last_error_at: null,
      },
      { onConflict: 'user_id' }
    );
  if (jobUpsertError) {
    console.error('[account-delete-reconcile] Failed to upsert deletion job:', jobUpsertError);
  }

  const authDeleteResult = await deleteUserWithRetry(supabase, userId);
  if (!authDeleteResult.ok) {
    await recordDeletionFailure(supabase, userId, 'auth_delete_failed', {
      stage: 'auth_delete',
      attempts: authDeleteResult.attempts,
      error: serializeError(authDeleteResult.lastError),
    });
    return { userId, status: 'failed', stage: 'auth_delete' };
  }

  const cleanupErrors = await cleanupUserData(supabase, userId);
  if (Object.keys(cleanupErrors).length > 0) {
    await recordDeletionFailure(supabase, userId, 'cleanup_failed', {
      stage: 'cleanup',
      errors: cleanupErrors,
    });
    return { userId, status: 'failed', stage: 'cleanup', errors: cleanupErrors };
  }

  await markDeletionCompleted(supabase, userId);
  return { userId, status: 'completed' };
};

Deno.serve(async (req) => {
  const corsResponse = handleCorsPreflight(req);
  if (corsResponse) return corsResponse;
  try {
    const methodError = validateMethod(req, ['POST']);
    if (methodError) return methodError;
    const authResult = await authenticateUser(req);
    if ('error' in authResult) {
      return createErrorResponse(authResult.error, authResult.status, req);
    }

    const { user, supabase: sbClient } = authResult as AuthSuccess;
    const supabase = sbClient as unknown as TypedSupabaseClient;
    const isAdmin = await verifyAdminStatus(supabase, user.id);
    if (!isAdmin) {
      return createErrorResponse('Forbidden', 403, req);
    }

    let body: ReconcileRequest = {};
    try {
      body = (await req.json()) as ReconcileRequest;
    } catch {
      body = {};
    }

    const action = body.action ?? (body.userId ? 'process' : 'list');
    const limit = Math.min(
      Math.max(body.limit ?? DEFAULT_BATCH_LIMIT, 1),
      MAX_BATCH_LIMIT
    );

    if (action === 'list') {
      const { data, error } = await listJobs(supabase, limit, Boolean(body.includeDeadLettered));
      if (error) {
        console.error('[account-delete-reconcile] Failed to list jobs:', error);
        return createErrorResponse('Failed to list deletion jobs', 500, req);
      }
      return createSuccessResponse({ success: true, jobs: data }, 200, req);
    }

    const results: Array<Record<string, unknown>> = [];
    if (body.userId) {
      results.push(await processDeletionJob(supabase, body.userId, Boolean(body.dryRun)));
    } else {
      const { data, error } = await listJobs(supabase, limit, Boolean(body.includeDeadLettered));
      if (error) {
        console.error('[account-delete-reconcile] Failed to fetch jobs for processing:', error);
        return createErrorResponse('Failed to fetch deletion jobs', 500, req);
      }
      const nowIso = new Date().toISOString();
      const dueJobs = (data ?? []).filter((job) => !job.next_run_at || job.next_run_at <= nowIso);
      for (const job of dueJobs) {
        results.push(await processDeletionJob(supabase, job.user_id, Boolean(body.dryRun)));
      }
    }

    return createSuccessResponse({ success: true, results }, 200, req);
  } catch (error) {
    console.error('[account-delete-reconcile] Unexpected error:', error);
    return createErrorResponse('Internal server error', 500, req);
  }
});
