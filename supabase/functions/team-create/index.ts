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
const DEFAULT_MAX_TEAM_MEMBERS = 5;
type TeamRow = {
  created_at: string;
  id: string;
  join_code: string;
  max_members: number;
  name: string;
  owner_id: string;
};
type CreateContext = {
  gameMode: TeamGameMode;
  joinCode: string;
  maxMembers: number;
  name: string;
  req: Request;
  supabase: SupabaseClient;
  userId: string;
};
type PersistedCreateContext = CreateContext & { team: TeamRow };
const validateTeamName = (req: Request, name: unknown): Response | null => {
  if (typeof name !== 'string') return createErrorResponse('Team name cannot be empty', 400, req);
  if (!name.trim()) return createErrorResponse('Team name cannot be empty', 400, req);
  if (name.length > 100) {
    return createErrorResponse('Team name cannot exceed 100 characters', 400, req);
  }
  return null;
};
const validateJoinCode = (req: Request, joinCode: string): Response | null => {
  if (joinCode.length < 4) {
    return createErrorResponse('Join code must be at least 4 characters', 400, req);
  }
  if (joinCode.length > 255) {
    return createErrorResponse('Join code cannot exceed 255 characters', 400, req);
  }
  return null;
};
const validateMaxMembers = (req: Request, maxMembers: unknown): Response | null => {
  if (typeof maxMembers !== 'number') {
    return createErrorResponse('Max members must be between 2 and 10', 400, req);
  }
  if (maxMembers < 2) return createErrorResponse('Max members must be between 2 and 10', 400, req);
  if (maxMembers > 10) return createErrorResponse('Max members must be between 2 and 10', 400, req);
  return null;
};
const getMaxMembers = (value: unknown): unknown =>
  value === undefined ? DEFAULT_MAX_TEAM_MEMBERS : value;
const getRequestedGameMode = (value: unknown): TeamGameMode => {
  if (typeof value !== 'string') return 'pvp';
  const normalized = value.toLowerCase();
  return isTeamGameMode(normalized) ? normalized : 'pvp';
};
const parseCreateInput = async (
  req: Request,
  supabase: SupabaseClient,
  userId: string
): Promise<MutationStep<CreateContext>> => {
  const { body, joinCode } = await readJoinCodeBody(req);
  const fieldsError = validateRequiredFields(req, { ...body, join_code: joinCode }, [
    'name',
    'join_code',
  ]);
  if (fieldsError) return rejectMutationStep(fieldsError);
  const maxMembers = getMaxMembers(body.maxMembers);
  const validationError = [
    validateTeamName(req, body.name),
    validateJoinCode(req, joinCode as string),
    validateMaxMembers(req, maxMembers),
  ].find(Boolean);
  if (validationError) return rejectMutationStep(validationError);
  return acceptMutationStep({
    gameMode: getRequestedGameMode(body.game_mode),
    joinCode: joinCode as string,
    maxMembers: maxMembers as number,
    name: body.name as string,
    req,
    supabase,
    userId,
  });
};
const prepareCreate = async (req: Request): Promise<MutationStep<CreateContext>> => {
  const auth = await authenticateMutation(req, 'team-create');
  if (auth.response) return rejectMutationStep(auth.response);
  return parseCreateInput(req, auth.supabase, auth.user.id);
};
const createTeamInsertError = (req: Request, error: { code?: string } | null): Response => {
  console.error('Team creation failed:', error);
  if (error?.code === '23505') {
    return createErrorResponse('A team with this name or join code already exists', 409, req);
  }
  return createErrorResponse('Failed to create team', 500, req);
};
const insertTeam = async (context: CreateContext): Promise<MutationStep<TeamRow>> => {
  const { data, error } = await context.supabase
    .from('teams')
    .insert({
      name: context.name.trim(),
      join_code: context.joinCode,
      max_members: context.maxMembers,
      owner_id: context.userId,
      game_mode: context.gameMode,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error || !data) return rejectMutationStep(createTeamInsertError(context.req, error));
  return acceptMutationStep(data as TeamRow);
};
const insertOwnerMembership = async (context: PersistedCreateContext): Promise<Response | null> => {
  const { error } = await context.supabase.from('team_memberships').insert({
    team_id: context.team.id,
    user_id: context.userId,
    role: 'owner',
    game_mode: context.gameMode,
    joined_at: new Date().toISOString(),
  });
  if (!error) return null;
  console.error('Membership creation failed:', error);
  await context.supabase.from('teams').delete().eq('id', context.team.id);
  return createErrorResponse('Failed to create team membership', 500, context.req);
};
const updateTeamSystemState = async (context: PersistedCreateContext): Promise<Response | null> => {
  const { error } = await context.supabase.from('user_system').upsert({
    user_id: context.userId,
    [teamIdColumnForMode(context.gameMode)]: context.team.id,
    updated_at: new Date().toISOString(),
  });
  if (!error) return null;
  console.error('user_system upsert failed:', error);
  return createErrorResponse('Failed to update user system state', 500, context.req);
};
const recordTeamCreated = (context: PersistedCreateContext) =>
  context.supabase.from('team_events').insert({
    team_id: context.team.id,
    event_type: 'team_created',
    initiated_by: context.userId,
    event_data: { team_name: context.team.name, max_members: context.maxMembers },
    created_at: new Date().toISOString(),
  });
const persistTeamCreate = async (
  context: CreateContext
): Promise<MutationStep<PersistedCreateContext>> => {
  const inserted = await insertTeam(context);
  if (inserted.response) return rejectMutationStep(inserted.response);
  const persisted = { ...context, team: inserted.value };
  const membershipError = await insertOwnerMembership(persisted);
  if (membershipError) return rejectMutationStep(membershipError);
  const systemError = await updateTeamSystemState(persisted);
  if (systemError) return rejectMutationStep(systemError);
  await recordTeamCreated(persisted);
  return acceptMutationStep(persisted);
};
const createTeamResponse = (context: PersistedCreateContext) =>
  createSuccessResponse(
    {
      success: true,
      message: 'Team created successfully',
      team: {
        id: context.team.id,
        name: context.team.name,
        maxMembers: context.team.max_members,
        ownerId: context.team.owner_id,
        createdAt: context.team.created_at,
        joinCode: context.team.join_code,
        gameMode: context.gameMode,
      },
    },
    201,
    context.req
  );
const handleTeamCreate = async (req: Request): Promise<Response> => {
  const prepared = await prepareCreate(req);
  if (prepared.response) return prepared.response;
  const membershipError = await rejectExistingTeamMembership(
    req,
    prepared.value.supabase,
    prepared.value.userId,
    prepared.value.gameMode
  );
  if (membershipError) return membershipError;
  const persisted = await persistTeamCreate(prepared.value);
  if (persisted.response) return persisted.response;
  return createTeamResponse(persisted.value);
};
Deno.serve((req) =>
  handleTeamCreate(req).catch((error) => {
    console.error('Team creation error:', error);
    return createErrorResponse('Internal server error', 500, req);
  })
);
