import {
  validateRequiredFields,
  validateUUIDs,
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/auth.ts';
import {
  authenticateMutation,
  type AuthenticatedMutation,
} from '../_shared/authenticated-mutation.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { kickTeamResponse } from '../_shared/team-kick-result.ts';
import { invokeKickTeam, isRetryableKickError } from '../_shared/kick-team-rpc.ts';
type KickContext = {
  req: Request;
  supabase: SupabaseClient;
  userId: string;
  teamId: string;
  memberId: string;
};
const kickRpcError = (req: Request, code: string) => {
  console.error('kick_team RPC failed', { code });
  const status = isRetryableKickError(code) ? 503 : 500;
  const response = createErrorResponse('Failed to kick team member', status, req);
  if (status === 503) response.headers.set('Retry-After', '1');
  return response;
};
const performKick = async ({
  req,
  supabase,
  userId,
  teamId,
  memberId,
}: KickContext) => {
  const { data: result, error } = await invokeKickTeam(supabase, {
    p_team_id: teamId,
    p_initiator_id: userId,
    p_member_id: memberId,
  });
  if (error) {
    return kickRpcError(req, error.code);
  }
  const failure = kickTeamResponse(result);
  if (failure) return createErrorResponse(failure.message, failure.status, req);
  return createSuccessResponse(
    {
      success: true,
      message: 'Team member kicked successfully',
    },
    200,
    req
  );
};
const validateKick = (req: Request, body: Record<string, unknown>) =>
  validateRequiredFields(req, body, ['teamId', 'memberId']) ??
  validateUUIDs(req, body, ['teamId', 'memberId']);
const readKick = async (req: Request, auth: AuthenticatedMutation) => {
  const body = await req.json();
  const validation = validateKick(req, body);
  if (validation) return validation;
  return performKick({
    req,
    supabase: auth.supabase,
    userId: auth.user.id,
    teamId: body.teamId,
    memberId: body.memberId,
  });
};
Deno.serve(async (req) => {
  try {
    const auth = await authenticateMutation(req, 'team-kick');
    if (auth.response) return auth.response;
    return await readKick(req, auth);
  } catch (error) {
    console.error('Team kick error:', error);
    return createErrorResponse('Internal server error', 500, req);
  }
});
