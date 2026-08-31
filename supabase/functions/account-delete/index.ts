import {
  authenticateUser,
  handleCorsPreflight,
  validateMethod,
  createErrorResponse,
  createSuccessResponse,
} from 'shared/auth';
import {
  claimDeletionJob,
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
    const supabase = sbClient as unknown as AccountDeletionClient;
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null;
    const userAgent = req.headers.get('user-agent') || null;
    const attempt = await consumeDeletionAttempt(supabase, user.id, ipAddress, userAgent);
    if (attempt.error) {
      console.error('[account-delete] Failed to enforce deletion rate limit:', attempt.error);
      return createErrorResponse(
        'Failed to initialize account deletion. Please try again.',
        500,
        req
      );
    }
    if (!attempt.allowed) {
      console.warn('[account-delete] Rate limit exceeded for user:', user.id);
      return createErrorResponse(
        `Too many deletion requests. Please wait ${attempt.retryAfterSeconds} seconds before trying again.`,
        429,
        req
      );
    }
    const claim = await claimDeletionJob(supabase, user.id, true);
    if (claim.error) {
      console.error('[account-delete] FATAL: Failed to initialize deletion job tracking:', {
        error: serializeError(claim.error),
        userId: user.id,
      });
      return createErrorResponse(
        'Failed to initialize account deletion. Please try again later.',
        500,
        req
      );
    }
    if (!claim.claimed || !claim.claimToken) {
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
    }
    const { data: ownedTeams, error: teamQueryError } = await supabase
      .from('teams')
      .select('id')
      .eq('owner_id', user.id);
    if (teamQueryError) {
      console.error('[account-delete] Failed to fetch owned teams:', teamQueryError);
      const transition = recordDeletionFailure(
        supabase,
        user.id,
        claim.claimToken,
        'team_query_failed',
        { stage: 'team_transfer', error: serializeError(teamQueryError) },
        '[account-delete]'
      );
      return createTransitionResponse(
        transition,
        createErrorResponse('Failed to fetch owned teams', 500, req),
        req
      );
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
      const transition = recordDeletionFailure(
        supabase,
        user.id,
        claim.claimToken,
        'team_transfer_failed',
        { stage: 'team_transfer', errors: teamErrors },
        '[account-delete]'
      );
      return createTransitionResponse(
        transition,
        createErrorResponse(
          'Failed to process team ownership transfers. Please try again.',
          500,
          req
        ),
        req
      );
    }
    const authDeleteResult = await deleteUserWithRetry(supabase, user.id);
    if (!authDeleteResult.ok) {
      console.error('[account-delete] Failed to delete auth user:', authDeleteResult.lastError);
      const transition = recordDeletionFailure(
        supabase,
        user.id,
        claim.claimToken,
        'auth_delete_failed',
        {
          stage: 'auth_delete',
          attempts: authDeleteResult.attempts,
          error: serializeError(authDeleteResult.lastError),
        },
        '[account-delete]'
      );
      return createTransitionResponse(
        transition,
        createErrorResponse('Failed to delete account', 500, req),
        req
      );
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
      const transition = recordDeletionFailure(
        supabase,
        user.id,
        claim.claimToken,
        'cleanup_failed',
        { stage: 'cleanup', errors: cleanupErrors },
        '[account-delete]'
      );
      // Return 202 Accepted to indicate auth deletion succeeded but cleanup is async
      return createTransitionResponse(
        transition,
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
    return createTransitionResponse(
      markDeletionCompleted(supabase, user.id, claim.claimToken, '[account-delete]'),
      createSuccessResponse({ success: true }, 200, req),
      req
    );
  } catch (error) {
    console.error('[account-delete] Unexpected error:', error);
    return createErrorResponse('Internal server error', 500, req);
  }
});
