import { assertEquals } from 'jsr:@std/assert';
import { isTeamGameMode, teamIdColumnForMode } from './team-mode.ts';
Deno.test('maps every supported game mode to its user_system team column', () => {
  assertEquals(teamIdColumnForMode('pvp'), 'pvp_team_id');
  assertEquals(teamIdColumnForMode('pve'), 'pve_team_id');
  assertEquals(teamIdColumnForMode('seasonal'), 'seasonal_team_id');
});
Deno.test('rejects unsupported team game modes', () => {
  assertEquals(isTeamGameMode('seasonal'), true);
  assertEquals(isTeamGameMode('arena'), false);
  assertEquals(isTeamGameMode(null), false);
});
