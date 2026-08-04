import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createErrorResponse,
  createSuccessResponse,
  validateRequiredFields,
} from '../_shared/auth.ts';
import {
  acceptMutationStep,
  authenticateMutation,
  readJoinCodeBody,
  rejectMutationStep,
  type MutationStep,
} from '../_shared/authenticated-mutation.ts';
import { isTeamGameMode, teamIdColumnForMode, type TeamGameMode } from '../_shared/team-mode.ts';
import { rejectExistingTeamMembership } from '../_shared/team-membership.ts';
type TeamRow = {
  game_mode: string;
  id: string;
  join_code: string;
  max_members: number;
  name: string;
};
type JoinContext = {
  gameMode: TeamGameMode;
  joinCode: string;
  req: Request;
  supabase: SupabaseClient;
  team: TeamRow;
  teamId: string;
  userId: string;
};
const getTeamGameMode = (team: TeamRow): TeamGameMode =>
  isTeamGameMode(team.game_mode) ? team.game_mode : 'pvp';
const loadTeam = async (
  req: Request,
  supabase: SupabaseClient,
  teamId: string
): Promise<MutationStep<TeamRow>> => {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, join_code, max_members, game_mode')
    .eq('id', teamId)
    .single();
  if (error || !data) {
    console.error('Team lookup failed:', error);
    return rejectMutationStep(createErrorResponse('Team not found', 404, req));
  }
  return acceptMutationStep(data as TeamRow);
};
const prepareJoin = async (req: Request): Promise<MutationStep<JoinContext>> => {
  const auth = await authenticateMutation(req, 'team-join');
  if (auth.response) return rejectMutationStep(auth.response);
  const { body, joinCode } = await readJoinCodeBody(req);
  const fieldsError = validateRequiredFields(req, { ...body, join_code: joinCode }, [
    'teamId',
    'join_code',
  ]);
  if (fieldsError) return rejectMutationStep(fieldsError);
  const teamId = String(body.teamId);
  const loaded = await loadTeam(req, auth.supabase, teamId);
  if (loaded.response) return rejectMutationStep(loaded.response);
  return acceptMutationStep({
    gameMode: getTeamGameMode(loaded.value),
    joinCode: joinCode as string,
    req,
    supabase: auth.supabase,
    team: loaded.value,
    teamId,
    userId: auth.user.id,
  });
};
const rejectFullTeam = async (context: JoinContext): Promise<Response | null> => {
  const { data, error } = await context.supabase
    .from('team_memberships')
    .select('user_id', { count: 'exact', head: false })
    .eq('team_id', context.teamId);
  if (error) {
    console.error('Members count failed:', error);
    return createErrorResponse('Failed to check team capacity', 500, context.req);
  }
  if (data && data.length >= context.team.max_members) {
    return createErrorResponse('Team is full', 400, context.req);
  }
  return null;
};
const validateJoinEligibility = async (context: JoinContext): Promise<Response | null> => {
  if (context.team.join_code !== context.joinCode) {
    return createErrorResponse('Invalid team join code', 403, context.req);
  }
  const membershipError = await rejectExistingTeamMembership(
    context.req,
    context.supabase,
    context.userId,
    context.gameMode
  );
  if (membershipError) return membershipError;
  return rejectFullTeam(context);
};
const insertMembership = async (context: JoinContext): Promise<Response | null> => {
  const { error } = await context.supabase.from('team_memberships').insert({
    team_id: context.teamId,
    user_id: context.userId,
    role: 'member',
    game_mode: context.gameMode,
    joined_at: new Date().toISOString(),
  });
  if (!error) return null;
  console.error('Team join failed:', error);
  if (error.code === '23505') {
    return createErrorResponse('You are already a member of this team', 409, context.req);
  }
  return createErrorResponse('Failed to join team', 500, context.req);
};
const recordJoinEvent = (context: JoinContext) =>
  context.supabase.from('team_events').insert({
    team_id: context.teamId,
    event_type: 'member_joined',
    target_user: context.userId,
    initiated_by: context.userId,
    event_data: { team_name: context.team.name },
    created_at: new Date().toISOString(),
  });
const updateTeamSystemState = async (context: JoinContext): Promise<Response | null> => {
  const { error } = await context.supabase.from('user_system').upsert({
    user_id: context.userId,
    [teamIdColumnForMode(context.gameMode)]: context.teamId,
    updated_at: new Date().toISOString(),
  });
  if (!error) return null;
  console.error('user_system upsert failed:', error);
  return createErrorResponse('Failed to update user system state', 500, context.req);
};
const persistJoin = async (context: JoinContext): Promise<Response | null> => {
  const insertError = await insertMembership(context);
  if (insertError) return insertError;
  await recordJoinEvent(context);
  return updateTeamSystemState(context);
};
const createJoinResponse = (context: JoinContext) =>
  createSuccessResponse(
    {
      success: true,
      message: 'Successfully joined team',
      team: { id: context.team.id, name: context.team.name, gameMode: context.gameMode },
    },
    200,
    context.req
  );
const handleTeamJoin = async (req: Request): Promise<Response> => {
  const prepared = await prepareJoin(req);
  if (prepared.response) return prepared.response;
  const eligibilityError = await validateJoinEligibility(prepared.value);
  if (eligibilityError) return eligibilityError;
  const persistError = await persistJoin(prepared.value);
  if (persistError) return persistError;
  return createJoinResponse(prepared.value);
};
Deno.serve((req) =>
  handleTeamJoin(req).catch((error) => {
    console.error('Team join error:', error);
    return createErrorResponse('Internal server error', 500, req);
  })
);
