import { runAccountDeletion } from '../_shared/account-deletion-workflow.ts';
import { createErrorResponse, createSuccessResponse } from '../_shared/auth.ts';
import { authenticateDeletionRequest } from '../_shared/account-deletion-request.ts';
import { readJsonObject } from '../_shared/authenticated-mutation.ts';
import {
  claimDeletionJob,
  getDeletionJobState,
  type AccountDeletionClient,
} from '../_shared/account-deletion-lifecycle.ts';
const DEFAULT_BATCH_LIMIT = 20;
const MAX_BATCH_LIMIT = 25;
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
  if (error) return false;
  return data?.[0]?.is_admin === true;
}
const listJobs = async (
  supabase: AccountDeletionClient,
  limit: number,
  includeDeadLettered: boolean
) => {
  const { data, error } = await supabase.rpc('account_lifecycle_jobs', { p_limit: limit });
  if (error) return { data: null, error } as const;
  const rows = Array.isArray(data) ? data : [];
  const jobs = rows.filter((job) => includeDeadLettered || job.status !== 'dead_lettered');
  return { data: jobs, error: null } as const;
};
const TERMINAL_DELETION_STATUSES = new Set(['completed', 'dead_lettered', 'hold', 'blocked']);
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
  if (status === 'state_unavailable') return { userId, status, retryable: true };
  const skippedResult = getSkippedJobResult(status, userId, dryRun);
  if (skippedResult) return skippedResult;
  const claim = await claimDeletionJob(supabase, userId, false);
  if (claim.error) {
    console.error('[account-delete-reconcile] Failed to claim deletion job:', claim.error);
    return { userId, status: 'claim_failed' };
  }
  if (!claim.claimToken) {
    return { userId, status: String(claim.status), skipped: true };
  }
  const result = await runAccountDeletion(supabase, userId, claim.claimToken);
  return { userId, ...result };
};
const getLimit = (body: ReconcileRequest) =>
  Math.min(Math.max(body.limit ?? DEFAULT_BATCH_LIMIT, 1), MAX_BATCH_LIMIT);
const respondWithJobs = async (
  req: Request,
  client: AccountDeletionClient,
  body: ReconcileRequest
) => {
  const { data, error } = await listJobs(client, getLimit(body), Boolean(body.includeDeadLettered));
  if (error) return createErrorResponse('Failed to list deletion jobs', 500, req);
  return createSuccessResponse({ success: true, jobs: data }, 200, req);
};
const processDueJobs = async (client: AccountDeletionClient, body: ReconcileRequest) => {
  const { data, error } = await listJobs(client, getLimit(body), Boolean(body.includeDeadLettered));
  if (error) throw new Error('Failed to fetch deletion jobs');
  const now = new Date().toISOString();
  const due = (data ?? []).filter((job) => !job.next_run_at || job.next_run_at <= now);
  const results = [];
  for (const job of due)
    results.push(await processDeletionJob(client, job.user_id, Boolean(body.dryRun)));
  return results;
};
const processBody = async (client: AccountDeletionClient, body: ReconcileRequest) => {
  if (body.userId) return [await processDeletionJob(client, body.userId, Boolean(body.dryRun))];
  return processDueJobs(client, body);
};
const getAction = (body: ReconcileRequest) => body.action ?? (body.userId ? 'process' : 'list');
const handleAdminRequest = async (req: Request, client: AccountDeletionClient, userId: string) => {
  if (!(await verifyAdminStatus(client, userId))) return createErrorResponse('Forbidden', 403, req);
  const body = (await readJsonObject(req)) as ReconcileRequest;
  if (getAction(body) === 'list') return respondWithJobs(req, client, body);
  const results = await processBody(client, body);
  return createSuccessResponse({ success: true, results }, 200, req);
};
Deno.serve(async (req) => {
  try {
    const auth = await authenticateDeletionRequest(req);
    if (auth instanceof Response) return auth;
    return await handleAdminRequest(
      req,
      auth.supabase as unknown as AccountDeletionClient,
      auth.user.id
    );
  } catch {
    return createErrorResponse('Internal server error', 500, req);
  }
});
