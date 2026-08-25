import {
  authenticateUser,
  handleCorsPreflight,
  validateMethod,
  createErrorResponse,
  createSuccessResponse,
  type AuthSuccess,
} from 'shared/auth';
import {
  claimDeletionJob,
  cleanupUserData,
  deleteUserWithRetry,
  getDeletionJobState,
  markDeletionCompleted,
  recordDeletionFailure,
  serializeError,
  type AccountDeletionClient,
  type DeletionTransitionResult,
} from '../_shared/account-deletion-lifecycle.ts';
const DEFAULT_BATCH_LIMIT = 20;
const MAX_BATCH_LIMIT = 100;
interface ReconcileRequest {
  action?: 'list' | 'process';
  userId?: string;
  limit?: number;
  includeDeadLettered?: boolean;
  dryRun?: boolean;
}
async function verifyAdminStatus(
  supabase: AccountDeletionClient,
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
  supabase: AccountDeletionClient,
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
const getTransitionResult = async <T>(
  transition: Promise<DeletionTransitionResult>,
  result: T,
  userId: string
) => {
  const transitionResult = await transition;
  if (transitionResult === 'persisted') return result;
  if (transitionResult === 'lease_lost') {
    return { userId, status: 'lease_lost', skipped: true };
  }
  return { userId, status: 'transition_failed' };
};
const TERMINAL_DELETION_STATUSES = new Set(['completed', 'dead_lettered']);
const getSkippedJobResult = (status: string | null, userId: string, dryRun: boolean) => {
  const normalizedStatus = status ?? 'pending';
  if (TERMINAL_DELETION_STATUSES.has(normalizedStatus)) {
    return { userId, status: normalizedStatus, skipped: true };
  }
  if (!dryRun) return null;
  return { userId, status: normalizedStatus, dryRun: true };
};
const processDeletionJob = async (
  supabase: AccountDeletionClient,
  userId: string,
  dryRun: boolean
) => {
  const { status } = await getDeletionJobState(supabase, userId, '[account-delete-reconcile]');
  const skippedResult = getSkippedJobResult(status, userId, dryRun);
  if (skippedResult) return skippedResult;
  const claim = await claimDeletionJob(supabase, userId, false);
  if (claim.error) {
    console.error('[account-delete-reconcile] Failed to claim deletion job:', claim.error);
    return { userId, status: 'claim_failed' };
  }
  if (!claim.claimed || !claim.claimToken) {
    return { userId, status: claim.status ?? 'missing', skipped: true };
  }
  const authDeleteResult = await deleteUserWithRetry(supabase, userId);
  if (!authDeleteResult.ok) {
    return getTransitionResult(
      recordDeletionFailure(
        supabase,
        userId,
        claim.claimToken,
        'auth_delete_failed',
        {
          stage: 'auth_delete',
          attempts: authDeleteResult.attempts,
          error: serializeError(authDeleteResult.lastError),
        },
        '[account-delete-reconcile]'
      ),
      { userId, status: 'failed', stage: 'auth_delete' },
      userId
    );
  }
  const cleanupErrors = await cleanupUserData(supabase, userId);
  if (Object.keys(cleanupErrors).length > 0) {
    return getTransitionResult(
      recordDeletionFailure(
        supabase,
        userId,
        claim.claimToken,
        'cleanup_failed',
        { stage: 'cleanup', errors: cleanupErrors },
        '[account-delete-reconcile]'
      ),
      { userId, status: 'failed', stage: 'cleanup', errors: cleanupErrors },
      userId
    );
  }
  return getTransitionResult(
    markDeletionCompleted(supabase, userId, claim.claimToken, '[account-delete-reconcile]'),
    { userId, status: 'completed' },
    userId
  );
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
    const supabase = sbClient as unknown as AccountDeletionClient;
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
    const limit = Math.min(Math.max(body.limit ?? DEFAULT_BATCH_LIMIT, 1), MAX_BATCH_LIMIT);
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
