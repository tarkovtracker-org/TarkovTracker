<template>
  <UAlert
    v-if="hasInviteInUrl && !inInviteTeam && !declined"
    color="success"
    variant="solid"
    icon="i-mdi-handshake"
    class="mb-4"
  >
    <template #title>
      <div class="flex w-full flex-row items-center justify-between">
        <div>
          {{ $t('page.team.card.teaminvite.description') }}
        </div>
        <div class="flex gap-2">
          <UButton
            color="neutral"
            variant="outline"
            :disabled="accepting"
            :loading="accepting"
            @click="acceptInvite"
          >
            {{ $t('common.accept') }}
          </UButton>
          <UButton color="neutral" variant="outline" :disabled="accepting" @click="declined = true">
            {{ $t('page.team.card.teaminvite.decline') }}
          </UButton>
        </div>
      </div>
    </template>
  </UAlert>
</template>
<script setup lang="ts">
  import { useEdgeFunctions } from '@/composables/api/useEdgeFunctions';
  import {
    getTeamIdFromState,
    getTeamIdStateKey,
    useSystemStoreWithSupabase,
  } from '@/stores/useSystemStore';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES, type GameMode } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  const { systemStore } = useSystemStoreWithSupabase();
  const tarkovStore = useTarkovStore();
  const route = useRoute();
  const toast = useToast();
  const { t } = useI18n({ useScope: 'global' });
  const { joinTeam } = useEdgeFunctions();
  function getCurrentGameMode(): GameMode {
    return tarkovStore.getCurrentGameMode?.() || GAME_MODES.PVP;
  }
  const hasInviteInUrl = computed(() => {
    return !!(route.query.team && route.query.code);
  });
  const inInviteTeam = computed(() => {
    const currentTeamId = getTeamIdFromState(systemStore.$state, getCurrentGameMode());
    const queryTeam = route.query.team;
    const inviteTeamId = Array.isArray(queryTeam) ? queryTeam[0] : queryTeam;
    if (!inviteTeamId || !currentTeamId) return false;
    return String(currentTeamId) === String(inviteTeamId);
  });
  const declined = ref(false);
  const accepting = ref(false);
  const acceptInvite = async () => {
    if (!route.query.team || !route.query.code) return;
    accepting.value = true;
    try {
      const teamId = String(route.query.team);
      const code = String(route.query.code);
      const result = await joinTeam(teamId, code);
      if (result?.success) {
        toast.add({
          title: t('page.team.card.teaminvite.join_success', 'Joined team successfully!'),
          color: 'success',
        });
        const gameMode = Object.values(GAME_MODES).includes(result.team.gameMode as GameMode)
          ? (result.team.gameMode as GameMode)
          : getCurrentGameMode();
        const teamIdColumn = getTeamIdStateKey(gameMode);
        systemStore.$patch((state) => {
          state[teamIdColumn] = teamId;
          if (gameMode === GAME_MODES.PVP) {
            state.team = teamId;
            state.team_id = teamId;
          }
        });
        declined.value = false;
      } else {
        throw new Error(
          (result as { message?: string })?.message ||
            t('page.team.card.teaminvite.join_error', 'Failed to join team')
        );
      }
    } catch (err) {
      const error = err as Error & { data?: { message?: string } };
      const message = error?.message || error?.data?.message || String(err);
      logger.error('[TeamInvite] Error joining team:', error);
      toast.add({
        title: message,
        color: 'error',
      });
    } finally {
      accepting.value = false;
    }
  };
</script>
