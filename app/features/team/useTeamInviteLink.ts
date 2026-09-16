import { useSystemStoreWithSupabase, getTeamIdFromState } from '@/stores/useSystemStore';
import { useTarkovStore } from '@/stores/useTarkov';
import { useTeamStoreWithSupabase } from '@/stores/useTeamStore';
import { GAME_MODES, type GameMode } from '@/utils/constants';
const buildInviteUrl = (teamId: string, code: string): string => {
  const inviteUrl = new URL(window.location.href);
  inviteUrl.search = new URLSearchParams({ team: teamId, code }).toString();
  return inviteUrl.toString();
};
export const useTeamInviteLink = () => {
  const { systemStore } = useSystemStoreWithSupabase();
  const { teamStore } = useTeamStoreWithSupabase();
  const tarkovStore = useTarkovStore();
  const getCurrentGameMode = (): GameMode => tarkovStore.getCurrentGameMode?.() || GAME_MODES.PVP;
  // Only the code issued for the team the user is currently in is shareable, so
  // a stale code left over from a previous team resolves to no invite at all.
  const resolveActiveInvite = (): { teamId: string; code: string } | null => {
    const teamId = getTeamIdFromState(systemStore.$state, getCurrentGameMode());
    const code = teamStore.id === teamId ? teamStore.inviteCode : null;
    return teamId && code ? { teamId, code } : null;
  };
  const teamUrl = computed(() => {
    const invite = resolveActiveInvite();
    if (!invite || !import.meta.client) return '';
    return buildInviteUrl(invite.teamId, invite.code);
  });
  const maskedTeamUrl = computed(() => {
    if (!teamUrl.value) return '';
    const maskedUrl = new URL(teamUrl.value);
    return `${maskedUrl.origin}${maskedUrl.pathname}?team=••••••&code=••••••${maskedUrl.hash}`;
  });
  return { maskedTeamUrl, teamUrl };
};
