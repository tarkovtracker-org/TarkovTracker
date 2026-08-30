<template>
  <section
    v-if="hasTeam && teamOwnerResolved"
    class="border-error-500/30 bg-error-950/15 font-ui space-y-4 rounded-xl border p-5 shadow-md sm:p-6"
    data-testid="team-danger-zone"
  >
    <div class="flex items-start gap-3">
      <span
        class="bg-error-500/15 border-error-500/30 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
      >
        <UIcon name="i-mdi-alert-octagon-outline" class="text-error-400 h-5 w-5" />
      </span>
      <div class="min-w-0">
        <h2 class="text-error-300 text-lg font-semibold">
          {{ $t('page.team.danger_zone.title') }}
        </h2>
        <p class="text-surface-400 mt-1 text-sm leading-5">
          {{
            isTeamOwner
              ? $t('page.team.danger_zone.disband_description')
              : $t('page.team.danger_zone.leave_description')
          }}
        </p>
      </div>
    </div>
    <UButton
      color="error"
      variant="outline"
      icon="i-mdi-account-cancel-outline"
      class="min-h-11 w-full justify-center sm:w-auto"
      data-testid="open-team-danger-confirmation"
      @click="openConfirmation"
    >
      {{ isTeamOwner ? $t('page.team.danger_zone.disband') : $t('page.team.danger_zone.leave') }}
    </UButton>
  </section>
  <UModal v-model:open="confirmationOpen" prevent-close>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi-alert-circle-outline" class="text-error-400 h-5 w-5" />
        <h3 class="text-lg font-semibold">
          {{
            confirmationIsOwner
              ? $t('page.team.danger_zone.confirm_disband_title')
              : $t('page.team.danger_zone.confirm_leave_title')
          }}
        </h3>
      </div>
    </template>
    <template #body>
      <p class="text-surface-200 text-sm leading-6">
        {{
          confirmationIsOwner
            ? $t('page.team.danger_zone.confirm_disband_description')
            : $t('page.team.danger_zone.confirm_leave_description')
        }}
      </p>
    </template>
    <template #footer>
      <div class="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <UButton
          color="neutral"
          variant="soft"
          class="min-h-11 justify-center sm:min-w-28"
          :disabled="actionPending"
          @click="confirmationOpen = false"
        >
          {{ $t('common.cancel') }}
        </UButton>
        <UButton
          color="error"
          variant="solid"
          class="min-h-11 justify-center sm:min-w-36"
          :loading="actionPending"
          :disabled="actionPending"
          data-testid="confirm-team-danger-action"
          @click="confirmDangerousAction"
        >
          {{
            confirmationIsOwner
              ? $t('page.team.danger_zone.confirm_disband')
              : $t('page.team.danger_zone.confirm_leave')
          }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
<script setup lang="ts">
  import { useEdgeFunctions } from '@/composables/api/useEdgeFunctions';
  import {
    useSystemStoreWithSupabase,
    getTeamIdFromState,
    getTeamIdStateKey,
  } from '@/stores/useSystemStore';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { useTeamStoreWithSupabase } from '@/stores/useTeamStore';
  import { GAME_MODES, type GameMode } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  const { $supabase } = useNuxtApp();
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const { disbandTeam, leaveTeam } = useEdgeFunctions();
  const { systemStore } = useSystemStoreWithSupabase();
  const { teamStore } = useTeamStoreWithSupabase();
  const tarkovStore = useTarkovStore();
  const confirmationOpen = ref(false);
  const actionPending = ref(false);
  const pendingAction = ref<{ isOwner: boolean; mode: GameMode; teamId: string } | null>(null);
  const getCurrentGameMode = (): GameMode => tarkovStore.getCurrentGameMode?.() || GAME_MODES.PVP;
  const currentTeamId = computed(() =>
    getTeamIdFromState(systemStore.$state, getCurrentGameMode())
  );
  const hasTeam = computed(() => Boolean(currentTeamId.value));
  const teamOwnerResolved = computed(
    () => teamStore.id === currentTeamId.value && typeof teamStore.owner === 'string'
  );
  const isTeamOwner = computed(() => teamStore.owner === $supabase.user.id && hasTeam.value);
  const confirmationIsOwner = computed(() => pendingAction.value?.isOwner ?? isTeamOwner.value);
  const openConfirmation = () => {
    const teamId = currentTeamId.value;
    if (!teamId || !teamOwnerResolved.value) return;
    pendingAction.value = {
      isOwner: isTeamOwner.value,
      mode: getCurrentGameMode(),
      teamId,
    };
    confirmationOpen.value = true;
  };
  watch(confirmationOpen, (isOpen) => {
    if (!isOpen) pendingAction.value = null;
  });
  const clearLocalTeam = (mode: GameMode, removedTeamId: string) => {
    const key = getTeamIdStateKey(mode);
    if (getTeamIdFromState(systemStore.$state, mode) !== removedTeamId) return;
    // fallow-ignore-next-line complexity -- cleanup guards protect replacement team state
    systemStore.$patch((state) => {
      if (getTeamIdFromState(state, mode) !== removedTeamId) return;
      state[key] = null;
      if (mode !== GAME_MODES.SEASONAL) {
        if (state.team === removedTeamId) state.team = null;
        if (state.team_id === removedTeamId) state.team_id = null;
      }
    });
    if (teamStore.id === removedTeamId) teamStore.$reset();
  };
  const showActionError = (error: unknown) => {
    logger.error('[TeamDangerZone] Team membership action failed:', error);
    toast.add({
      title: error instanceof Error ? error.message : t('page.team.danger_zone.action_error'),
      color: 'error',
    });
  };
  const getMembershipAction = (wasOwner: boolean) => (wasOwner ? disbandTeam : leaveTeam);
  const getFailureMessage = (wasOwner: boolean) =>
    wasOwner
      ? t('page.team.danger_zone.disband_error')
      : t('page.team.card.myteam.leave_team_error');
  const getSuccessMessage = (wasOwner: boolean) =>
    wasOwner
      ? t('page.team.danger_zone.disband_success')
      : t('page.team.card.myteam.leave_team_success');
  const runMembershipAction = async (teamId: string, wasOwner: boolean) => {
    const result = await getMembershipAction(wasOwner)(teamId);
    if (!result?.success) throw new Error(getFailureMessage(wasOwner));
  };
  const completeMembershipAction = (mode: GameMode, wasOwner: boolean, teamId: string) => {
    clearLocalTeam(mode, teamId);
    confirmationOpen.value = false;
    toast.add({
      title: getSuccessMessage(wasOwner),
      color: 'success',
    });
  };
  const executeDangerousAction = async (teamId: string, mode: GameMode, wasOwner: boolean) => {
    actionPending.value = true;
    try {
      await runMembershipAction(teamId, wasOwner);
      completeMembershipAction(mode, wasOwner, teamId);
    } catch (error: unknown) {
      showActionError(error);
    } finally {
      actionPending.value = false;
    }
  };
  const confirmDangerousAction = async () => {
    const action = pendingAction.value;
    if (actionPending.value || !action) return;
    await executeDangerousAction(action.teamId, action.mode, action.isOwner);
  };
</script>
