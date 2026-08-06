import type { SupabaseClient } from '@supabase/supabase-js';
import { createErrorResponse } from './auth.ts';
import { teamIdColumnForMode, type TeamGameMode } from './team-mode.ts';
const healTeamMembership = async (
  supabase: SupabaseClient,
  userId: string,
  gameMode: TeamGameMode,
  teamId: string
) => {
  const { error } = await supabase.from('user_system').upsert({
    user_id: userId,
    [teamIdColumnForMode(gameMode)]: teamId,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error('user_system heal failed:', error);
};
const getExistingTeamId = (rows: Array<{ team_id: string }> | null): string | null => {
  if (!rows) return null;
  const first = rows[0];
  return first ? first.team_id : null;
};
export const rejectExistingTeamMembership = async (
  req: Request,
  supabase: SupabaseClient,
  userId: string,
  gameMode: TeamGameMode
): Promise<Response | null> => {
  const { data, error } = await supabase
    .from('team_memberships')
    .select('team_id')
    .eq('user_id', userId)
    .eq('game_mode', gameMode)
    .limit(1);
  if (error) {
    console.error('Membership check failed:', error);
    return createErrorResponse('Failed to check existing team membership', 500, req);
  }
  const existingTeamId = getExistingTeamId(data);
  if (!existingTeamId) return null;
  await healTeamMembership(supabase, userId, gameMode, existingTeamId);
  return createErrorResponse(
    `You are already a member of a ${gameMode.toUpperCase()} team. Leave your current team first.`,
    400,
    req
  );
};
