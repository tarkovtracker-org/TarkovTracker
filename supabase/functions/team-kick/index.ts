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
type KickContext = {
  req: Request;
  supabase: SupabaseClient;
  userId: string;
  teamId: string;
  memberId: string;
};
const checkOwner = async ({ req, supabase, userId, teamId }: KickContext) => {
  const { data, error } = await supabase
    .from('team_memberships')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single();
  if (error || !data) return createErrorResponse('Team not found or user not a member', 404, req);
  if (data.role !== 'owner')
    return createErrorResponse('Only team owners can kick members', 403, req);
  return null;
};
const checkCooldown = async ({ req, supabase, userId, teamId }: KickContext) => {
  const now = new Date();
  const { data, error } = await supabase
    .from('team_events')
    .select('created_at')
    .eq('team_id', teamId)
    .eq('event_type', 'member_kicked')
    .eq('initiated_by', userId)
    .eq('server_verified', true)
    .gte('created_at', new Date(now.getTime() - 5 * 60 * 1000).toISOString())
    .lte('created_at', now.toISOString())
    .limit(1);
  if (error) return createErrorResponse('Failed to check team kick cooldown', 500, req);
  if (data?.length) return createErrorResponse('Must wait 5 minutes between kicks', 429, req);
  return null;
};
const removeMember = async ({ req, supabase, userId, teamId, memberId }: KickContext) => {
  const { error, count } = await supabase
    .from('team_memberships')
    .delete({ count: 'exact' })
    .eq('team_id', teamId)
    .eq('user_id', memberId);
  if (error) return createErrorResponse('Failed to kick team member', 500, req);
  if (!count) return createErrorResponse('Member not found in team or already removed', 404, req);
  const { error: eventError } = await supabase
    .from('team_events')
    .insert({
      team_id: teamId,
      event_type: 'member_kicked',
      target_user: memberId,
      initiated_by: userId,
    });
  if (eventError)
    return createSuccessResponse(
      {
        success: true,
        message: 'Team member kicked successfully',
        warning: 'Audit log may not have been recorded',
      },
      200,
      req
    );
  return createSuccessResponse(
    { success: true, message: 'Team member kicked successfully' },
    200,
    req
  );
};
const executeKick = async (context: KickContext) => {
  const ownerError = await checkOwner(context);
  if (ownerError) return ownerError;
  if (context.memberId === context.userId)
    return createErrorResponse('Cannot kick yourself from the team', 400, context.req);
  const cooldown = await checkCooldown(context);
  if (cooldown) return cooldown;
  return removeMember(context);
};
const validateKick = (req: Request, body: Record<string, unknown>) =>
  validateRequiredFields(req, body, ['teamId', 'memberId']) ??
  validateUUIDs(req, body, ['teamId', 'memberId']);
const readKick = async (req: Request, auth: AuthenticatedMutation) => {
  const body = await req.json();
  const validation = validateKick(req, body);
  if (validation) return validation;
  return executeKick({
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
