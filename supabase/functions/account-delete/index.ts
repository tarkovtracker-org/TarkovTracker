import {
  authenticateUser,
  handleCorsPreflight,
  validateMethod,
  createErrorResponse,
  createSuccessResponse,
} from 'shared/auth';
import type { Database } from '../_shared/database.types.ts';

const AUTH_DELETE_MAX_ATTEMPTS = 4;
const AUTH_DELETE_BASE_DELAY_MS = 300;
const CLEANUP_MAX_ATTEMPTS = 5;
const CLEANUP_BASE_DELAY_MS = 5 * 60 * 1000;
const CLEANUP_MAX_DELAY_MS = 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_ATTEMPTS = 3; // Max 3 deletion requests per minute

// Interfaces to mock Supabase client typing locally
interface PostgrestFilterBuilder<T> {
  eq(column: string, value: unknown): PostgrestFilterBuilder<T>;
  neq(column: string, value: unknown): PostgrestFilterBuilder<T>;
  gte(column: string, value: unknown): PostgrestFilterBuilder<T>;
  order(column: string, options?: unknown): PostgrestFilterBuilder<T>;
  then<TResult1 = { data: T[] | null; error: unknown }>(
    onfulfilled?:
      | ((value: { data: T[] | null; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null
  ): PromiseLike<TResult1>;
}

interface PostgrestTransformBuilder {
  eq(column: string, value: unknown): Promise<{ error: unknown }>;
  or(filter: string): Promise<{ error: unknown }>;
  gte(column: string, value: unknown): this;
  order(column: string, options?: { ascending?: boolean }): this;
}

interface TypedSupabaseClient {
  from<T extends keyof Database['public']['Tables']>(
    table: T
  ): {
    select(columns?: string): PostgrestFilterBuilder<Database['public']['Tables'][T]['Row']>;
    update(values: unknown): PostgrestTransformBuilder;
    delete(): PostgrestTransformBuilder;
    insert(values: Database['public']['Tables'][T]['Insert']): Promise<{ error: unknown }>;
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
  rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
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
  // Check for HTTP 404 status
  if (error && typeof error === 'object') {
    if ('status' in error) {
      const status = (error as { status?: number }).status;
      if (status === 404) return true;
    }
    // Check for specific error codes from Supabase Auth
    if ('code' in error) {
      const code = (error as { code?: string }).code;
      if (code === 'user_not_found' || code === '404') return true;
    }
  }
  // Fallback to message matching with specific patterns
  const message = getErrorMessage(error).toLowerCase();
  return (
    (message === 'user not found') ||
    (message.includes('user with id') && message.includes('not found')) ||
    (message.startsWith('no user found'))
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
    const delay = computeBackoffMs(attempt, AUTH_DELETE_BASE_DELAY_MS, 5000);
    await sleep(delay);
  }
  return { ok: false, attempts: AUTH_DELETE_MAX_ATTEMPTS, lastError };
};

const cleanupUserData = async (supabase: TypedSupabaseClient, userId: string) => {
  const cleanupErrors: Record<string, string> = {};

  const { error: membershipDeleteError } = await supabase
    .from('team_memberships')
    .delete()
    .eq('user_id', userId);
  if (membershipDeleteError) {
    cleanupErrors.team_memberships = getErrorMessage(membershipDeleteError);
  }

  const { error: apiTokensError } = await supabase
    .from('api_tokens')
    .delete()
    .eq('user_id', userId);
  if (apiTokensError) cleanupErrors.api_tokens = getErrorMessage(apiTokensError);

  const { error: progressError } = await supabase
    .from('user_progress')
    .delete()
    .eq('user_id', userId);
  if (progressError) cleanupErrors.user_progress = getErrorMessage(progressError);

  const { error: preferencesError } = await supabase
    .from('user_preferences')
    .delete()
    .eq('user_id', userId);
  if (preferencesError) cleanupErrors.user_preferences = getErrorMessage(preferencesError);

  const { error: userSystemError } = await supabase
    .from('user_system')
    .delete()
    .eq('user_id', userId);
  if (userSystemError) cleanupErrors.user_system = getErrorMessage(userSystemError);

  const { error: teamEventsError } = await supabase
    .from('team_events')
    .delete()
    .or(`initiated_by.eq.${userId},target_user.eq.${userId}`);
  if (teamEventsError) cleanupErrors.team_events = getErrorMessage(teamEventsError);

  return cleanupErrors;
};

const getDeletionJobState = async (supabase: TypedSupabaseClient, userId: string) => {
  const { data, error } = await supabase
    .from('account_deletion_jobs')
    .select('attempts,max_attempts,status')
    .eq('user_id', userId);
  if (error) {
    console.error('[account-delete] Failed to fetch deletion job state:', error);
  }
  const job = data?.[0];
  return {
    attempts: job?.attempts ?? 0,
    maxAttempts: job?.max_attempts ?? CLEANUP_MAX_ATTEMPTS,
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
    console.error('[account-delete] Failed to update deletion job:', error);
  }
  if (deadLetter) {
    console.error('[account-delete] Deletion job dead-lettered:', { userId, reason, details });
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
    console.error('[account-delete] Failed to mark deletion job completed:', error);
  }
};

Deno.serve(async (req) => {
  const corsResponse = handleCorsPreflight(req);
  if (corsResponse) return corsResponse;
  try {
    const methodError = validateMethod(req, ['POST']); // invoked via POST
    if (methodError) return methodError;
    const authResult = await authenticateUser(req);
    if ('error' in authResult) {
      return createErrorResponse(authResult.error, authResult.status, req);
    }
    const { user, supabase: sbClient } = authResult;
    const supabase = sbClient as unknown as TypedSupabaseClient;
    const now = new Date().toISOString();

    // Rate limiting: Check for recent deletion attempts
    const rateLimitTimestamp = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { data: recentAttempts, error: rateLimitError } = await supabase
      .from('account_deletion_attempts')
      .select('attempted_at')
      .eq('user_id', user.id)
      .gte('attempted_at', rateLimitTimestamp)
      .order('attempted_at', { ascending: false });

    if (!rateLimitError && recentAttempts && recentAttempts.length >= RATE_LIMIT_MAX_ATTEMPTS) {
      const oldestAttempt = recentAttempts[recentAttempts.length - 1];
      const attemptedAt = oldestAttempt.attempted_at;
      const timeRemaining = attemptedAt
        ? Math.ceil((new Date(attemptedAt).getTime() + RATE_LIMIT_WINDOW_MS - Date.now()) / 1000)
        : 60;
      console.warn('[account-delete] Rate limit exceeded for user:', user.id);
      return createErrorResponse(
        `Too many deletion requests. Please wait ${timeRemaining} seconds before trying again.`,
        429,
        req
      );
    }

    // Record this deletion attempt for rate limiting
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null;
    const userAgent = req.headers.get('user-agent') || null;
    const { error: attemptInsertError } = await supabase
      .from('account_deletion_attempts')
      .insert({
        user_id: user.id,
        attempted_at: now,
        ip_address: ipAddress,
        user_agent: userAgent,
      });
    if (attemptInsertError) {
      console.error('[account-delete] Failed to record deletion attempt:', attemptInsertError);
      // Continue anyway - rate limiting failure shouldn't block deletion
    }

    // Initialize job tracking - this MUST succeed before proceeding
    const { error: jobUpsertError } = await supabase.from('account_deletion_jobs').upsert(
      {
        user_id: user.id,
        status: 'in_progress',
        last_error: null,
        last_error_details: null,
        last_error_at: null,
        next_run_at: null,
        updated_at: now,
        completed_at: null,
        dead_lettered_at: null,
      },
      { onConflict: 'user_id' }
    );
    if (jobUpsertError) {
      console.error('[account-delete] FATAL: Failed to initialize deletion job tracking:', {
        error: serializeError(jobUpsertError),
        userId: user.id,
      });
      return createErrorResponse(
        'Failed to initialize account deletion. Please try again later.',
        500,
        req
      );
    }

    const { data: ownedTeams, error: teamQueryError } = await supabase
      .from('teams')
      .select('id')
      .eq('owner_id', user.id);
    if (teamQueryError) {
      console.error('[account-delete] Failed to fetch owned teams:', teamQueryError);
      await recordDeletionFailure(supabase, user.id, 'team_query_failed', {
        stage: 'team_transfer',
        error: serializeError(teamQueryError),
      });
      return createErrorResponse('Failed to fetch owned teams', 500, req);
    }

    // Process all owned teams and collect errors before proceeding
    const teamErrors: Array<{ teamId: string; error: string }> = [];
    if (ownedTeams && ownedTeams.length > 0) {
      for (const team of ownedTeams) {
        const { data: members, error: membersError } = await supabase
          .from('team_memberships')
          .select('user_id, joined_at')
          .eq('team_id', team.id)
          .neq('user_id', user.id)
          .order('joined_at', { ascending: true });
        if (membersError) {
          console.error('[account-delete] Failed to fetch team members:', membersError);
          teamErrors.push({
            teamId: team.id,
            error: `Failed to fetch members: ${getErrorMessage(membersError)}`,
          });
          continue;
        }
        if (members && members.length > 0) {
          const newOwner = members[0].user_id;
          const { error: transferError } = await supabase.rpc('transfer_team_ownership', {
            p_team_id: team.id,
            p_old_owner_id: user.id,
            p_new_owner_id: newOwner,
          });
          if (transferError) {
            console.error('[account-delete] Failed to transfer ownership:', transferError);
            teamErrors.push({
              teamId: team.id,
              error: `Failed to transfer ownership: ${getErrorMessage(transferError)}`,
            });
            continue;
          }
        } else {
          const { error: deleteTeamError } = await supabase
            .from('teams')
            .delete()
            .eq('id', team.id);
          if (deleteTeamError) {
            console.error('[account-delete] Failed to delete empty team:', deleteTeamError);
            teamErrors.push({
              teamId: team.id,
              error: `Failed to delete team: ${getErrorMessage(deleteTeamError)}`,
            });
            continue;
          }
        }
      }
    }

    if (teamErrors.length > 0) {
      await recordDeletionFailure(supabase, user.id, 'team_transfer_failed', {
        stage: 'team_transfer',
        errors: teamErrors,
      });
      return createErrorResponse(
        'Failed to process team ownership transfers. Please try again.',
        500,
        req
      );
    }

    const authDeleteResult = await deleteUserWithRetry(supabase, user.id);
    if (!authDeleteResult.ok) {
      console.error('[account-delete] Failed to delete auth user:', authDeleteResult.lastError);
      await recordDeletionFailure(supabase, user.id, 'auth_delete_failed', {
        stage: 'auth_delete',
        attempts: authDeleteResult.attempts,
        error: serializeError(authDeleteResult.lastError),
      });
      return createErrorResponse('Failed to delete account', 500, req);
    }

    const cleanupErrors = await cleanupUserData(supabase, user.id);
    if (Object.keys(cleanupErrors).length > 0) {
      // Sanitize errors - log table names but not error details from sensitive tables
      const SENSITIVE_TABLES = ['api_tokens'];
      const sanitizedErrors = Object.fromEntries(
        Object.entries(cleanupErrors).map(([table, error]) => [
          table,
          SENSITIVE_TABLES.includes(table) ? 'Deletion failed' : error,
        ])
      );
      console.error('[account-delete] Cleanup errors after auth delete:', sanitizedErrors);
      await recordDeletionFailure(supabase, user.id, 'cleanup_failed', {
        stage: 'cleanup',
        errors: cleanupErrors,
      });
      // Return 202 Accepted to indicate auth deletion succeeded but cleanup is async
      return createSuccessResponse(
        {
          success: true,
          cleanupScheduled: true,
          message: 'Account deleted. Data cleanup will complete shortly.',
        },
        202,
        req
      );
    }

    await markDeletionCompleted(supabase, user.id);
    return createSuccessResponse({ success: true }, 200, req);
  } catch (error) {
    console.error('[account-delete] Unexpected error:', error);
    return createErrorResponse('Internal server error', 500, req);
  }
});
