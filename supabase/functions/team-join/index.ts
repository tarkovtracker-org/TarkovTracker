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
import { isTeamGameMode, type TeamGameMode } from '../_shared/team-mode.ts';
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
type JoinInput = { joinCode: string; teamId: string };
const JOIN_ERROR_RESPONSES = [
  { match: 'already a member', message: 'You are already a member of this team', status: 409 },
  { match: 'Team is full', message: 'Team is full', status: 400 },
  { match: 'Invalid team join code', message: 'Invalid team join code', status: 403 },
  { match: 'Team not found', message: 'Team not found', status: 404 },
] as const;
const DEFAULT_JOIN_ERROR = { message: 'Failed to join team', status: 500 } as const;
const getTeamGameMode = (team: TeamRow): TeamGameMode | null =>
  isTeamGameMode(team.game_mode) ? team.game_mode : null;
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
const parseJoinInput = async (req: Request): Promise<MutationStep<JoinInput>> => {
  const { body, joinCode } = await readJoinCodeBody(req);
  const fieldsError = validateRequiredFields(req, { ...body, join_code: joinCode }, [
    'teamId',
    'join_code',
  ]);
  if (fieldsError) return rejectMutationStep(fieldsError);
  return acceptMutationStep({ joinCode: joinCode as string, teamId: String(body.teamId) });
};
const buildJoinContext = (
  req: Request,
  auth: { supabase: SupabaseClient; user: { id: string } },
  input: JoinInput,
  loaded: TeamRow
): MutationStep<JoinContext> => {
  const gameMode = getTeamGameMode(loaded);
  if (!gameMode) {
    return rejectMutationStep(createErrorResponse('Team has invalid game mode', 400, req));
  }
  return acceptMutationStep({
    gameMode,
    joinCode: input.joinCode,
    req,
    supabase: auth.supabase,
    team: loaded,
    teamId: input.teamId,
    userId: auth.user.id,
  });
};
const prepareJoin = async (req: Request): Promise<MutationStep<JoinContext>> => {
  const auth = await authenticateMutation(req, 'team-join');
  if (auth.response) return rejectMutationStep(auth.response);
  const input = await parseJoinInput(req);
  if (input.response) return rejectMutationStep(input.response);
  const loaded = await loadTeam(req, auth.supabase, input.value.teamId);
  if (loaded.response) return rejectMutationStep(loaded.response);
  return buildJoinContext(req, auth, input.value, loaded.value);
};
const findJoinErrorResponse = (message: string) =>
  JOIN_ERROR_RESPONSES.find(({ match }) => message.includes(match)) ?? DEFAULT_JOIN_ERROR;
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
  return null;
};
const getJoinErrorResponse = (error: { message?: string }, req: Request): Response => {
  const match = findJoinErrorResponse(error.message || '');
  return createErrorResponse(match.message, match.status, req);
};
const persistJoin = async (context: JoinContext): Promise<Response | null> => {
  const { error } = await context.supabase.rpc('join_team', {
    p_join_code: context.joinCode,
    p_team_id: context.teamId,
    p_user_id: context.userId,
  });
  if (!error) return null;
  console.error('Team join failed:', error);
  return getJoinErrorResponse(error, context.req);
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
