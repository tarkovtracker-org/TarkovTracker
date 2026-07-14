import {
  authenticateUser,
  handleCorsPreflight,
  validateMethod,
  validateRequiredFields,
  createErrorResponse,
  createSuccessResponse,
  type AuthSuccess,
} from '../_shared/auth.ts';
import { enforceUserMutationRateLimit } from '../_shared/rate-limit.ts';

const MAX_TEAM_MEMBERS = 5;
const VALID_GAME_MODES = ['pvp', 'pve'] as const;
type GameMode = (typeof VALID_GAME_MODES)[number];

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
    const rateLimitResponse = await enforceUserMutationRateLimit(
      req,
      supabase,
      user.id,
      'team-create'
    );
    if (rateLimitResponse) return rateLimitResponse;

    // Parse and validate request body
    const body = await req.json();
    // Accept legacy "password" as alias for join_code for backward compatibility
    const joinCode =
      typeof body.join_code === 'string'
        ? body.join_code
        : typeof (body as Record<string, unknown>).password === 'string'
          ? (body as { password: string }).password
          : undefined;

    const fieldsError = validateRequiredFields(req, { ...body, join_code: joinCode }, [
      'name',
      'join_code',
    ]);
    if (fieldsError) return fieldsError;

    const { name, maxMembers = MAX_TEAM_MEMBERS } = body;
    const join_code = joinCode as string;

    // Extract and validate game_mode (default to 'pvp' for backwards compatibility)
    const rawGameMode = typeof body.game_mode === 'string' ? body.game_mode.toLowerCase() : 'pvp';
    const game_mode: GameMode = VALID_GAME_MODES.includes(rawGameMode as GameMode)
      ? (rawGameMode as GameMode)
      : 'pvp';

    // Validate team name length
    if (typeof name !== 'string' || name.trim().length === 0) {
      return createErrorResponse('Team name cannot be empty', 400, req);
    }
    if (name.length > 100) {
      return createErrorResponse('Team name cannot exceed 100 characters', 400, req);
    }

    // Validate join_code length
    if (typeof join_code !== 'string' || join_code.length < 4) {
      return createErrorResponse('Join code must be at least 4 characters', 400, req);
    }
    if (join_code.length > 255) {
      return createErrorResponse('Join code cannot exceed 255 characters', 400, req);
    }

    // Validate maxMembers
    if (typeof maxMembers !== 'number' || maxMembers < 2 || maxMembers > 10) {
      return createErrorResponse('Max members must be between 2 and 10', 400, req);
    }

    // Check if user is already in a team for this specific game mode
    const { data: existingMembership, error: membershipCheckError } = await supabase
      .from('team_memberships')
      .select('team_id, game_mode')
      .eq('user_id', user.id)
      .eq('game_mode', game_mode)
      .limit(1);

    if (membershipCheckError) {
      console.error('Membership check failed:', membershipCheckError);
      return createErrorResponse('Failed to check existing team membership', 500, req);
    }

    if (existingMembership && existingMembership.length > 0) {
      // Heal stale state: ensure user_system reflects existing team for UI sync
      const existingTeamId = existingMembership[0].team_id;
      if (existingTeamId) {
        const teamIdColumn = game_mode === 'pve' ? 'pve_team_id' : 'pvp_team_id';
        const { error: systemHealError } = await supabase.from('user_system').upsert({
          user_id: user.id,
          [teamIdColumn]: existingTeamId,
          updated_at: new Date().toISOString(),
        });
        if (systemHealError) {
          console.error('user_system heal failed:', systemHealError);
        }
      }
      return createErrorResponse(
        `You are already a member of a ${game_mode.toUpperCase()} team. Leave your current team first.`,
        400,
        req
      );
    }

    // Create the team with game_mode
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({
        name: name.trim(),
        join_code: join_code,
        max_members: maxMembers,
        owner_id: user.id,
        game_mode: game_mode,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (teamError) {
      console.error('Team creation failed:', teamError);

      // Check for unique constraint violation
      if (teamError.code === '23505') {
        return createErrorResponse('A team with this name or join code already exists', 409, req);
      }

      return createErrorResponse('Failed to create team', 500, req);
    }

    // Add creator as owner to team_memberships (game_mode is set by trigger)
    const { error: membershipError } = await supabase.from('team_memberships').insert({
      team_id: team.id,
      user_id: user.id,
      role: 'owner',
      game_mode: game_mode,
      joined_at: new Date().toISOString(),
    });

    if (membershipError) {
      console.error('Membership creation failed:', membershipError);

      // Rollback: delete the team if membership creation fails
      await supabase.from('teams').delete().eq('id', team.id);

      return createErrorResponse('Failed to create team membership', 500, req);
    }

    // Upsert user_system with the correct team_id column based on game mode
    const teamIdColumn = game_mode === 'pve' ? 'pve_team_id' : 'pvp_team_id';
    const { error: systemError } = await supabase.from('user_system').upsert({
      user_id: user.id,
      [teamIdColumn]: team.id,
      updated_at: new Date().toISOString(),
    });

    if (systemError) {
      console.error('user_system upsert failed:', systemError);
      return createErrorResponse('Failed to update user system state', 500, req);
    }

    // Log team creation event
    await supabase.from('team_events').insert({
      team_id: team.id,
      event_type: 'team_created',
      initiated_by: user.id,
      event_data: { team_name: team.name, max_members: maxMembers },
      created_at: new Date().toISOString(),
    });

    return createSuccessResponse(
      {
        success: true,
        message: 'Team created successfully',
        team: {
          id: team.id,
          name: team.name,
          maxMembers: team.max_members,
          ownerId: team.owner_id,
          createdAt: team.created_at,
          joinCode: team.join_code,
          gameMode: game_mode,
        },
      },
      201,
      req
    );
  } catch (error) {
    console.error('Team creation error:', error);
    return createErrorResponse('Internal server error', 500, req);
  }
});
