import {
  validateRequiredFields,
  validateUUIDs,
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/auth.ts';
import { authenticateMutation } from '../_shared/authenticated-mutation.ts';
import { isTeamGameMode, teamIdColumnForMode, type TeamGameMode } from '../_shared/team-mode.ts';
const LEAVE_COOLDOWN_MINUTES = 5;
Deno.serve(async (req) => {
  try {
    const auth = await authenticateMutation(req, 'team-leave');
    if (auth.response) return auth.response;
    const { user, supabase } = auth;
    // Parse and validate request body
    const body = await req.json();
    const fieldsError = validateRequiredFields(req, body, ['teamId']);
    if (fieldsError) return fieldsError;
    const uuidError = validateUUIDs(req, body, ['teamId']);
    if (uuidError) return uuidError;
    const { teamId } = body;
    // Get the team's game_mode first
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('game_mode')
      .eq('id', teamId)
      .single();
    if (teamError || !team) {
      console.error('Team lookup failed:', teamError);
      return createErrorResponse('Team not found', 404, req);
    }
    if (!isTeamGameMode(team.game_mode)) {
      return createErrorResponse('Team has invalid game mode', 400, req);
    }
    const game_mode: TeamGameMode = team.game_mode;
    const teamIdColumn = teamIdColumnForMode(game_mode);
    // Get user's membership in the team
    const { data: membership, error: membershipError } = await supabase
      .from('team_memberships')
      .select('role, team_id')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .single();
    if (membershipError || !membership) {
      return createErrorResponse('You are not a member of this team', 404, req);
    }
    // Check if user is the owner
    if (membership.role === 'owner') {
      return createErrorResponse(
        'Team owners must disband their team through the confirmed disband action.',
        400,
        req
      );
    }
    // Check cooldown period (5 minutes between leaves)
    const cooldownTimestamp = new Date(
      Date.now() - LEAVE_COOLDOWN_MINUTES * 60 * 1000
    ).toISOString();
    const { data: recentLeaves, error: cooldownError } = await supabase
      .from('team_events')
      .select('created_at, teams!inner(game_mode)')
      .eq('event_type', 'member_left')
      .eq('target_user', user.id)
      .eq('teams.game_mode', game_mode)
      .gte('created_at', cooldownTimestamp)
      .limit(1);
    if (cooldownError) {
      console.error('Leave cooldown check failed:', cooldownError, {
        teamId,
        userId: user.id,
        gameMode: game_mode,
      });
      return createErrorResponse('Failed to check team leave cooldown', 500, req);
    }
    if (recentLeaves && recentLeaves.length > 0) {
      const timeRemaining = Math.ceil(
        (new Date(recentLeaves[0].created_at).getTime() +
          LEAVE_COOLDOWN_MINUTES * 60 * 1000 -
          Date.now()) /
          1000 /
          60
      );
      return createErrorResponse(
        `Must wait ${timeRemaining} minute(s) before leaving another team`,
        429,
        req
      );
    }
    // Remove user from team and verify deletion
    const { error: leaveError, count: deletedCount } = await supabase
      .from('team_memberships')
      .delete({ count: 'exact' })
      .eq('team_id', teamId)
      .eq('user_id', user.id);
    if (leaveError) {
      console.error('Team leave failed:', leaveError);
      return createErrorResponse('Failed to leave team', 500, req);
    }
    if (!deletedCount || deletedCount === 0) {
      console.error('Team leave failed: User not in team', { teamId, userId: user.id });
      return createErrorResponse('User not found in team or already left', 404, req);
    }
    // Log team leave event with error handling
    const { error: eventError } = await supabase.from('team_events').insert({
      team_id: teamId,
      event_type: 'member_left',
      target_user: user.id,
      initiated_by: user.id,
      created_at: new Date().toISOString(),
    });
    if (eventError) {
      console.error('Failed to log leave event:', eventError, { teamId, userId: user.id });
      // Leave succeeded but audit log failed - continue with warning
    }
    // Clear user_system team_id for the leaver (using correct game mode column)
    const { error: systemError } = await supabase.from('user_system').upsert({
      user_id: user.id,
      [teamIdColumn]: null,
      updated_at: new Date().toISOString(),
    });
    if (systemError) {
      console.error('user_system upsert failed:', systemError);
      if (systemError.code !== '42P01' && systemError.code !== '42703') {
        return createErrorResponse('Failed to update user system state', 500, req);
      }
      console.warn('user_system table missing, continuing without system state update');
    }
    return createSuccessResponse(
      {
        success: true,
        message: 'Successfully left team',
      },
      200,
      req
    );
  } catch (error) {
    console.error('Team leave error:', error);
    return createErrorResponse('Internal server error', 500, req);
  }
});
