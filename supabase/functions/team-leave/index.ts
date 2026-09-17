import {
  validateRequiredFields,
  validateUUIDs,
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/auth.ts';
import { authenticateMutation } from '../_shared/authenticated-mutation.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { leaveTeamResponse } from '../_shared/team-leave-result.ts';
import { invokeLeaveTeam, isRetryableLeaveError } from '../_shared/leave-team-rpc.ts';
const leaveRpcError = (req: Request, code: string) => {
  console.error('leave_team RPC failed', { code });
  const status = isRetryableLeaveError(code) ? 503 : 500;
  const response = createErrorResponse('Failed to leave team', status, req);
  if (status === 503) response.headers.set('Retry-After', '1');
  return response;
};
const performLeave = async (
  req: Request,
  supabase: SupabaseClient,
  userId: string,
  teamId: string
) => {
  const { data: result, error } = await invokeLeaveTeam(supabase, {
    p_team_id: teamId,
    p_user_id: userId,
  });
  if (error) {
    return leaveRpcError(req, error.code);
  }
  const failure = leaveTeamResponse(result);
  if (failure) return createErrorResponse(failure.message, failure.status, req);
  return createSuccessResponse(
    {
      success: true,
      message: 'Successfully left team',
    },
    200,
    req
  );
};
const validateLeave = (req: Request, body: Record<string, unknown>) =>
  validateRequiredFields(req, body, ['teamId']) ?? validateUUIDs(req, body, ['teamId']);
Deno.serve(async (req) => {
  try {
    const auth = await authenticateMutation(req, 'team-leave');
    if (auth.response) return auth.response;
    const { user, supabase } = auth;
    // Parse and validate request body
    const body = await req.json();
    const validation = validateLeave(req, body);
    if (validation) return validation;
    const { teamId } = body;
    return await performLeave(req, supabase, user.id, teamId);
  } catch (error) {
    console.error('Team leave error:', error);
    return createErrorResponse('Internal server error', 500, req);
  }
});
