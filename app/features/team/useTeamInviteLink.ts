import { useSystemStoreWithSupabase, getTeamIdFromState } from '@/stores/useSystemStore';
import { useTarkovStore } from '@/stores/useTarkov';
import { useTeamStoreWithSupabase } from '@/stores/useTeamStore';
import { GAME_MODES, type GameMode } from '@/utils/constants';
export const useTeamInviteLink = () => {
  const { systemStore } = useSystemStoreWithSupabase();
  const { teamStore } = useTeamStoreWithSupabase();
  const tarkovStore = useTarkovStore();
  const getCurrentGameMode = (): GameMode => tarkovStore.getCurrentGameMode?.() || GAME_MODES.PVP;
  const teamUrl = computed(() => {
    const teamId = getTeamIdFromState(systemStore.$state, getCurrentGameMode());
    const code = teamStore.inviteCode;
    if (!teamId || !code || !import.meta.client) return '';
    const baseUrl = window.location.href.split('?')[0];
    const params = new URLSearchParams({ team: teamId, code });
    return `${baseUrl}?${params}`;
  });
  const maskedTeamUrl = computed(() => {
    if (!teamUrl.value) return '';
    const [baseUrl] = teamUrl.value.split('?');
    return `${baseUrl}?team=••••••&code=••••••`;
  });
  return { maskedTeamUrl, teamUrl };
};
