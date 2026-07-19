import {
  authenticateUser,
  handleCorsPreflight,
  validateMethod,
  validateRequiredFields,
  validateUUIDs,
  createErrorResponse,
  createSuccessResponse,
  type AuthSuccess,
} from 'shared/auth';
import { enforceUserMutationRateLimit } from '../_shared/rate-limit.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  const corsResponse = handleCorsPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    // Validate HTTP method
    const methodError = validateMethod(req, ['POST']);
    if (methodError) return methodError;

    // Authenticate user
    const authResult = await authenticateUser(req);
    if ('error' in authResult) {
      return createErrorResponse(authResult.error, authResult.status, req);
    }
    const { user, supabase } = authResult as AuthSuccess;
    const rateLimitResponse = await enforceUserMutationRateLimit(req, supabase, user.id, 'team-kick');
    if (rateLimitResponse) return rateLimitResponse;

    // Parse and validate request body
    const body = await req.json();
    const fieldsError = validateRequiredFields(req, body, ['teamId', 'memberId']);
    if (fieldsError) return fieldsError;

    const uuidError = validateUUIDs(req, body, ['teamId', 'memberId']);
    if (uuidError) return uuidError;

    const { teamId, memberId } = body;

    // Check if user is the team owner
    const { data: membership, error: membershipError } = await supabase
      .from('team_memberships')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      return createErrorResponse('Team not found or user not a member', 404, req);
    }

    if (membership.role !== 'owner') {
      return createErrorResponse('Only team owners can kick members', 403, req);
    }

    // Cannot kick the owner
    if (memberId === user.id) {
      return createErrorResponse('Cannot kick yourself from the team', 400, req);
    }

    // Check cooldown period (5 minutes between kicks)
    const { data: recentKicks, error: cooldownError } = await supabase
      .from('team_events')
      .select('created_at')
      .eq('team_id', teamId)
      .eq('event_type', 'member_kicked')
      .eq('initiated_by', user.id)
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .limit(1);

    if (!cooldownError && recentKicks && recentKicks.length > 0) {
      return createErrorResponse('Must wait 5 minutes between kicks', 429, req);
    }

    // Remove the member from the team and verify deletion
    const { error: kickError, count: deletedCount } = await supabase
      .from('team_memberships')
      .delete({ count: 'exact' })
      .eq('team_id', teamId)
      .eq('user_id', memberId);

    if (kickError) {
      console.error('Team kick failed:', kickError);
      return createErrorResponse('Failed to kick team member', 500, req);
    }

    if (!deletedCount || deletedCount === 0) {
      console.error('Team kick failed: Member not found in team', { teamId, memberId });
      return createErrorResponse('Member not found in team or already removed', 404, req);
    }

    // Log the kick event with error handling
    const { error: eventError } = await supabase.from('team_events').insert({
      team_id: teamId,
      event_type: 'member_kicked',
      target_user: memberId,
      initiated_by: user.id,
      created_at: new Date().toISOString(),
    });

    if (eventError) {
      console.error('Failed to log kick event:', eventError, { teamId, memberId, userId: user.id });
      // Kick succeeded but audit log failed - return success with warning
      return createSuccessResponse(
        {
          success: true,
          message: 'Team member kicked successfully',
          warning: 'Audit log may not have been recorded',
        },
        200,
        req
      );
    }

    return createSuccessResponse(
      {
        success: true,
        message: 'Team member kicked successfully',
      },
      200,
      req
    );
  } catch (error) {
    console.error('Team kick error:', error);
    return createErrorResponse('Internal server error', 500, req);
  }
});
