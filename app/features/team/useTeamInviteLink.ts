import { useSystemStoreWithSupabase, getTeamIdFromState } from '@/stores/useSystemStore';
import { useTarkovStore } from '@/stores/useTarkov';
import { useTeamStoreWithSupabase } from '@/stores/useTeamStore';
import { GAME_MODES, type GameMode } from '@/utils/constants';
export const useTeamInviteLink = () => {
  const { systemStore } = useSystemStoreWithSupabase();
  const { teamStore } = useTeamStoreWithSupabase();
  const tarkovStore = useTarkovStore();
  const getCurrentGameMode = (): GameMode => tarkovStore.getCurrentGameMode?.() || GAME_MODES.PVP;
  // fallow-ignore-next-line complexity -- both valid and stale invite states have regression coverage
  const teamUrl = computed(() => {
    const teamId = getTeamIdFromState(systemStore.$state, getCurrentGameMode());
    const code = teamStore.id === teamId ? teamStore.inviteCode : null;
    if (!teamId || !code || !import.meta.client) return '';
    const inviteUrl = new URL(window.location.href);
    inviteUrl.search = new URLSearchParams({ team: teamId, code }).toString();
    return inviteUrl.toString();
  });
  const maskedTeamUrl = computed(() => {
    if (!teamUrl.value) return '';
    const maskedUrl = new URL(teamUrl.value);
    return `${maskedUrl.origin}${maskedUrl.pathname}?team=••••••&code=••••••${maskedUrl.hash}`;
  });
  return { maskedTeamUrl, teamUrl };
};
