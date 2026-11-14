import {
  authenticateUser,
  handleCorsPreflight,
  validateMethod,
  createErrorResponse,
  createSuccessResponse,
  type AuthSuccess,
} from 'shared/auth';
import {
  claimRequestedDeletionJob,
  cleanupUserData,
  consumeDeletionAttempt,
  deleteUserWithRetry,
  getErrorMessage,
  markDeletionCompleted,
  recordDeletionFailure,
  serializeError,
  type AccountDeletionClient,
  type DeletionTransitionResult,
} from '../_shared/account-deletion-lifecycle.ts';
import {
  clearEndedDeletionSubscription,
  DeletionBillingError,
  endedDeletionSubscription,
} from '../_shared/account-deletion-billing.ts';
import {
  hasDeletionConfirmation,
  readDeletionAuthorization,
  type DeletionAuthorization,
} from '../_shared/account-deletion-authorization.ts';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const AUTH_ISSUER =
  Deno.env.get('SUPABASE_AUTH_ISSUER') ||
  `${(Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '')}/auth/v1`;
const recentLoginResponse = (req: Request) =>
  createErrorResponse('account_deletion_recent_login_required', 403, req);
type AuthorizedDeletionRequest = AuthSuccess & { authorization: DeletionAuthorization };
type DeletionRequestResult = AuthorizedDeletionRequest | { response: Response };
const authorizeDeletionRequest = async (
  req: Request,
  auth: AuthSuccess
): Promise<DeletionRequestResult> => {
  const authorization = readDeletionAuthorization(auth.claims, AUTH_ISSUER);
  if (!authorization) return { response: recentLoginResponse(req) };
  if (authorization.userId !== auth.user.id) return { response: recentLoginResponse(req) };
  if (!hasDeletionConfirmation(await req.json().catch(() => null))) {
    return { response: createErrorResponse('account_deletion_confirmation_required', 400, req) };
  }
  return { ...auth, authorization };
};
const authenticateDeletionRequest = async (req: Request) => {
  const methodError = validateMethod(req, ['POST']);
  if (methodError) return { response: methodError };
  const auth = await authenticateUser(req);
  if ('error' in auth) return { response: createErrorResponse(auth.error, auth.status, req) };
  return authorizeDeletionRequest(req, auth);
};
const isDeletionAuthorizationError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === '28000';
const createLeaseLostResponse = (req: Request) =>
  createSuccessResponse(
    {
      success: false,
      cleanupScheduled: true,
      message: 'Account deletion is already in progress.',
    },
    202,
    req
  );
const createTransitionResponse = async (
  transition: Promise<DeletionTransitionResult>,
  response: Response,
  req: Request
) => {
  const result = await transition;
  if (result === 'persisted') return response;
  if (result === 'lease_lost') return createLeaseLostResponse(req);
  return createErrorResponse('Failed to update account deletion status.', 500, req);
};
interface DeletionContext {
  req: Request;
  client: AccountDeletionClient;
  userId: string;
  claimToken: string;
}
type RequestedClaim = Awaited<ReturnType<typeof claimRequestedDeletionJob>>;
async function deletionRateLimit(req: Request, client: AccountDeletionClient, userId: string) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null;
  const attempt = await consumeDeletionAttempt(client, userId, ip, req.headers.get('user-agent'));
  if (attempt.error) {
    console.error('[account-delete] Failed to enforce deletion rate limit:', attempt.error);
    return createErrorResponse(
      'Failed to initialize account deletion. Please try again.',
      500,
      req
    );
  }
  if (!attempt.allowed)
    return createErrorResponse(
      `Too many deletion requests. Please wait ${attempt.retryAfterSeconds} seconds before trying again.`,
      429,
      req
    );
  return null;
}
function claimFailureResponse(req: Request, userId: string, error: unknown) {
  if (isDeletionAuthorizationError(error)) return recentLoginResponse(req);
  console.error('[account-delete] FATAL: Failed to initialize deletion job tracking:', {
    error: serializeError(error),
    userId,
  });
  return createErrorResponse(
    'Failed to initialize account deletion. Please try again later.',
    500,
    req
  );
}
function claimResponse(req: Request, userId: string, claim: RequestedClaim) {
  if (claim.error) return claimFailureResponse(req, userId, claim.error);
  if ([!claim.claimed, !claim.claimToken].some(Boolean))
    return createSuccessResponse(
      {
        success: claim.status === 'completed',
        cleanupScheduled: claim.status !== 'completed',
        message:
          claim.status === 'completed'
            ? 'Account deletion is already complete.'
            : 'Account deletion is already in progress.',
      },
      202,
      req
    );
  return null;
}
function deletionFailure(
  context: DeletionContext,
  code: string,
  details: Record<string, unknown>,
  message: string
) {
  const { client, userId, claimToken, req } = context;
  return createTransitionResponse(
    recordDeletionFailure(client, userId, claimToken, code, details, '[account-delete]'),
    createErrorResponse(message, 500, req),
    req
  );
}
async function moveOwnedTeam(context: DeletionContext, teamId: string, newOwner: unknown) {
  if (newOwner)
    return {
      ...(await context.client.rpc('transfer_team_ownership', {
        p_team_id: teamId,
        p_old_owner_id: context.userId,
        p_new_owner_id: newOwner,
      })),
      message: 'Failed to transfer ownership',
    };
  return {
    ...(await context.client.from('teams').delete().eq('id', teamId)),
    message: 'Failed to delete team',
  };
}
async function prepareOwnedTeam(context: DeletionContext, teamId: string) {
  const { data: members, error } = await context.client
    .from('team_memberships')
    .select('user_id, joined_at')
    .eq('team_id', teamId)
    .neq('user_id', context.userId)
    .order('joined_at', { ascending: true });
  if (error) {
    console.error('[account-delete] Failed to fetch team members:', error);
    return { teamId, error: `Failed to fetch members: ${getErrorMessage(error)}` };
  }
  const result = await moveOwnedTeam(context, teamId, members?.[0]?.user_id);
  if (result.error) {
    console.error(`[account-delete] ${result.message}:`, result.error);
    return { teamId, error: `${result.message}: ${getErrorMessage(result.error)}` };
  }
  return null;
}
async function prepareOwnedTeams(context: DeletionContext, teams: { id: string }[]) {
  const errors = [];
  for (const team of teams) {
    const error = await prepareOwnedTeam(context, team.id);
    if (error) errors.push(error);
  }
  return errors;
}
async function transferOwnedTeams(context: DeletionContext) {
  const { data: teams, error } = await context.client
    .from('teams')
    .select('id')
    .eq('owner_id', context.userId);
  if (error) {
    console.error('[account-delete] Failed to fetch owned teams:', error);
    return deletionFailure(
      context,
      'team_query_failed',
      { stage: 'team_transfer', error: serializeError(error) },
      'Failed to fetch owned teams'
    );
  }
  const errors = await prepareOwnedTeams(context, teams ?? []);
  if (errors.length)
    return deletionFailure(
      context,
      'team_transfer_failed',
      { stage: 'team_transfer', errors },
      'Failed to process team ownership transfers. Please try again.'
    );
  return null;
}
function scheduleDataCleanup(context: DeletionContext, errors: Record<string, unknown>) {
  const { client, userId, claimToken, req } = context;
  const sanitized = Object.fromEntries(
    Object.entries(errors).map(([table, error]) => [
      table,
      table === 'api_tokens' ? 'Deletion failed' : error,
    ])
  );
  console.error('[account-delete] Cleanup errors after auth delete:', sanitized);
  return createTransitionResponse(
    recordDeletionFailure(
      client,
      userId,
      claimToken,
      'cleanup_failed',
      { stage: 'cleanup', errors },
      '[account-delete]'
    ),
    createSuccessResponse(
      {
        success: true,
        cleanupScheduled: true,
        message: 'Account deleted. Data cleanup will complete shortly.',
      },
      202,
      req
    ),
    req
  );
}
async function finishAccountDeletion(context: DeletionContext) {
  const { client, userId, claimToken, req } = context;
  const result = await deleteUserWithRetry(client, userId);
  if (!result.ok) {
    console.error('[account-delete] Failed to delete auth user:', result.lastError);
    return deletionFailure(
      context,
      'auth_delete_failed',
      { stage: 'auth_delete', attempts: result.attempts, error: serializeError(result.lastError) },
      'Failed to delete account'
    );
  }
  const errors = await cleanupUserData(client, userId);
  if (Object.keys(errors).length) return scheduleDataCleanup(context, errors);
  return createTransitionResponse(
    markDeletionCompleted(client, userId, claimToken, '[account-delete]'),
    createSuccessResponse({ success: true }, 200, req),
    req
  );
}
async function startAuthorizedDeletion(req: Request, authorized: AuthorizedDeletionRequest) {
  const client = authorized.supabase as unknown as AccountDeletionClient;
  const userId = authorized.user.id;
  // Billing denial still precedes job creation and every destructive side effect.
  const billing = await endedDeletionSubscription(client, userId, STRIPE_SECRET_KEY);
  const claim = await claimRequestedDeletionJob(client, authorized.authorization);
  const response = claimResponse(req, userId, claim);
  if (response) return response;
  const context = { req, client, userId, claimToken: claim.claimToken! };
  await clearClaimedBilling(client, userId, billing, context.claimToken);
  const teamResponse = await transferOwnedTeams(context);
  if (teamResponse) return teamResponse;
  return finishAccountDeletion(context);
}
async function handleDeletionRequest(req: Request) {
  const authorized = await authenticateDeletionRequest(req);
  if ('response' in authorized) return authorized.response;
  const client = authorized.supabase as unknown as AccountDeletionClient;
  const response = await deletionRateLimit(req, client, authorized.user.id);
  if (response) return response;
  return startAuthorizedDeletion(req, authorized);
}
Deno.serve(async (req) => {
  const cors = handleCorsPreflight(req);
  if (cors) return cors;
  try {
    return await handleDeletionRequest(req);
  } catch (error) {
    return accountDeletionError(error, req);
  }
});
async function clearClaimedBilling(
  client: AccountDeletionClient,
  userId: string,
  billing: Awaited<ReturnType<typeof endedDeletionSubscription>>,
  claimToken: string
): Promise<void> {
  try {
    await clearEndedDeletionSubscription(client, userId, billing, claimToken);
  } catch (error) {
    await recordDeletionFailure(
      client,
      userId,
      claimToken,
      'billing_verification_changed',
      { stage: 'billing', error: serializeError(error) },
      '[account-delete]'
    );
    throw error;
  }
}
function accountDeletionError(error: unknown, req: Request): Response {
  if (error instanceof DeletionBillingError)
    return createErrorResponse(error.code, error.status, req);
  console.error('[account-delete] Unexpected error:', error);
  return createErrorResponse('Internal server error', 500, req);
}
