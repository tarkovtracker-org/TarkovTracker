<template>
  <GenericCard icon="mdi-account-supervisor" icon-color="white" highlight-color="secondary">
    <template #title>
      {{ $t('page.team.card.myteam.title') }}
    </template>
    <template #content>
      <div v-if="isLoadingTeamState" class="flex items-center justify-center py-8">
        <UIcon name="i-mdi-loading" class="text-surface-400 h-6 w-6 animate-spin" />
      </div>
      <div v-else-if="!isLoggedIn" class="p-4">
        <LoginRequiredAlert
          :title="$t('page.team.card.myteam.login_required')"
          redirect-path="/team"
        />
      </div>
      <div v-else-if="!localUserTeam" class="py-4 text-center">
        {{ $t('page.team.card.myteam.no_team') }}
      </div>
      <div v-else class="space-y-4 p-4">
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium">
            {{ $t('page.team.card.myteam.team_invite_url_label') }}
          </label>
          <div class="flex items-center gap-2">
            <UButton
              :icon="linkVisible ? 'i-mdi-eye-off' : 'i-mdi-eye'"
              variant="ghost"
              size="xs"
              @click="linkVisible = !linkVisible"
            >
              {{ linkVisible ? $t('common.hide') : $t('common.show') }}
            </UButton>
            <UButton
              v-if="linkVisible"
              icon="i-mdi-content-copy"
              variant="ghost"
              size="xs"
              @click="copyUrl"
            >
              {{ $t('page.team.card.myteam.copy_link') }}
            </UButton>
          </div>
        </div>
        <div v-if="linkVisible" class="bg-surface-800 rounded-lg p-3">
          <div class="font-mono text-sm break-all">
            {{ teamUrl }}
          </div>
        </div>
        <div v-else class="bg-surface-800 rounded-lg p-3">
          <div class="text-surface-400 text-sm italic">
            {{ $t('page.team.card.myteam.link_hidden_message') }}
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div
        v-if="!isLoadingTeamState && isLoggedIn"
        class="border-surface-700 flex items-center justify-start gap-2 border-t p-4"
      >
        <UButton
          v-if="!localUserTeam"
          :disabled="loading.createTeam"
          :loading="loading.createTeam"
          color="primary"
          icon="i-mdi-account-group"
          @click="handleCreateTeam"
        >
          {{ $t('page.team.card.myteam.create_new_team') }}
        </UButton>
        <UButton
          v-else
          :disabled="loading.leaveTeam"
          :loading="loading.leaveTeam"
          color="error"
          variant="outline"
          icon="i-mdi-account-off"
          @click="handleLeaveTeam"
        >
          {{
            isTeamOwner
              ? $t('page.team.card.myteam.disband_team')
              : $t('page.team.card.myteam.leave_team')
          }}
        </UButton>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import LoginRequiredAlert from '@/components/ui/LoginRequiredAlert.vue';
  import { useEdgeFunctions } from '@/composables/api/useEdgeFunctions';
  import {
    getTeamIdFromState,
    getTeamIdStateKey,
    useSystemStoreWithSupabase,
  } from '@/stores/useSystemStore';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { useTeamStoreWithSupabase } from '@/stores/useTeamStore';
  import { delay } from '@/utils/async';
  import { GAME_MODES, LIMITS, type GameMode } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  import type { TeamState } from '@/types/tarkov';
  import type { CreateTeamResponse, LeaveTeamResponse } from '@/types/team';
  const { t } = useI18n({ useScope: 'global' });
  const { teamStore } = useTeamStoreWithSupabase();
  const { systemStore, hasInitiallyLoaded } = useSystemStoreWithSupabase();
  function getCurrentGameMode(): GameMode {
    return tarkovStore.getCurrentGameMode?.() || GAME_MODES.PVP;
  }
  function getTeamId(): string | null {
    return getTeamIdFromState(systemStore.$state, getCurrentGameMode());
  }
  const tarkovStore = useTarkovStore();
  const { $supabase } = useNuxtApp();
  const toast = useToast();
  const { createTeam, leaveTeam } = useEdgeFunctions();
  const clearRemovedLegacyTeamId = (state: typeof systemStore.$state, removedTeamId: string) => {
    if (state.team === removedTeamId) state.team = null;
    if (state.team_id === removedTeamId) state.team_id = null;
  };
  const setLocalTeamId = (
    mode: GameMode,
    teamId: string | null,
    removedTeamId: string | null = null
  ) => {
    const key = getTeamIdStateKey(mode);
    systemStore.$patch((state) => {
      state[key] = teamId;
      if (mode === GAME_MODES.PVP) {
        state.team = teamId;
        state.team_id = teamId;
      } else if (teamId === null && removedTeamId) {
        clearRemovedLegacyTeamId(state, removedTeamId);
      }
    });
  };
  const isLoggedIn = computed(() => $supabase.user.loggedIn);
  const linkVisible = ref(false);
  const generateRandomName = (length: number = LIMITS.RANDOM_NAME_LENGTH) =>
    Array.from({ length }, () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(
        Math.floor(Math.random() * 62)
      )
    ).join('');
  const localUserTeam = computed(() => {
    return getTeamIdFromState(systemStore.$state, getCurrentGameMode());
  });
  const isLoadingTeamState = computed(() => {
    const storeHasData = Object.keys(systemStore.$state).length > 0;
    return !(hasInitiallyLoaded.value || storeHasData);
  });
  const isTeamOwner = computed(() => {
    const teamState = teamStore.$state as { owner_id?: string; owner?: string };
    const owner = teamState.owner_id ?? teamState.owner;
    const hasTeam = !!getTeamId();
    return owner === $supabase.user.id && hasTeam;
  });
  const loading = ref({ createTeam: false, leaveTeam: false });
  const validateAuth = () => {
    if (!$supabase.user.loggedIn || !$supabase.user.id) {
      throw new Error(t('page.team.card.myteam.user_not_authenticated'));
    }
  };
  const buildTeamName = () => {
    const displayName = tarkovStore.getDisplayName();
    const fallbackName =
      $supabase.user.displayName ||
      $supabase.user.username ||
      $supabase.user.email?.split('@')[0] ||
      'Team';
    return `${displayName || fallbackName}-${generateRandomName(4)}`;
  };
  const buildJoinCode = () => generateRandomName(12);
  const showNotification = (message: string, color: 'primary' | 'error' = 'primary') => {
    toast.add({ title: message, color: color === 'error' ? 'error' : 'primary' });
  };
  const restoreExistingMembership = async (mode: GameMode): Promise<boolean> => {
    const { data, error } = await $supabase.client
      .from('team_memberships')
      .select('team_id')
      .eq('user_id', $supabase.user.id)
      .eq('game_mode', mode)
      .maybeSingle();
    if (error) throw error;
    if (!data?.team_id) return false;
    setLocalTeamId(mode, data.team_id);
    showNotification(
      t('page.team.card.myteam.already_in_team', { mode: mode.toUpperCase() }),
      'error'
    );
    return true;
  };
  const applyCreatedTeam = (
    team: NonNullable<CreateTeamResponse['team']>,
    generatedJoinCode: string,
    mode: GameMode
  ) => {
    const teamWithLegacyJoinCode = team as typeof team & {
      join_code?: string;
      joinCode?: string;
    };
    const joinCode =
      teamWithLegacyJoinCode.joinCode ?? teamWithLegacyJoinCode.join_code ?? generatedJoinCode;
    setLocalTeamId(mode, team.id);
    teamStore.$patch({
      joinCode,
      join_code: joinCode,
      owner: team.ownerId,
      owner_id: team.ownerId,
      members: [team.ownerId],
    } as Partial<TeamState>);
  };
  const verifyCreatedMembership = async (teamId: string, mode: GameMode) => {
    await delay(500);
    const { data, error } = await $supabase.client
      .from('team_memberships')
      .select('team_id')
      .eq('user_id', $supabase.user.id)
      .eq('team_id', teamId)
      .eq('game_mode', mode)
      .maybeSingle();
    if (error) logger.error('[MyTeam] Verification query error:', error);
    if (!data) throw new Error(t('page.team.card.myteam.create_team_error_ui_update'));
  };
  const ensureOwnerDisplayName = async (ownerId: string) => {
    await nextTick();
    if (ownerId !== $supabase.user.id || tarkovStore.getDisplayName()) return;
    tarkovStore.setDisplayName(`${tarkovStore.getCurrentGameMode().toUpperCase()}-PMC`);
  };
  const getTeamErrorDetailMessage = (details: unknown): string | null => {
    if (!details) return null;
    if (typeof details !== 'object') return null;
    if (!('error' in details)) return null;
    return String(details.error);
  };
  const getDetailedTeamError = (error: object): string | null => {
    if (!('details' in error)) return null;
    return getTeamErrorDetailMessage(error.details);
  };
  const toErrorObject = (error: unknown): object | null => {
    if (!error) return null;
    if (typeof error !== 'object') return null;
    return error;
  };
  const getCreateTeamErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    const errorObject = toErrorObject(error);
    const detailed = errorObject ? getDetailedTeamError(errorObject) : null;
    if (detailed) return detailed;
    return t('page.team.card.myteam.create_team_error');
  };
  const requireCreatedTeam = (result: CreateTeamResponse) => {
    if (!result.team) throw new Error(t('page.team.card.myteam.create_team_error_ui_update'));
    return result.team;
  };
  const createTeamWorkflow = async () => {
    validateAuth();
    const currentGameMode = getCurrentGameMode();
    if (await restoreExistingMembership(currentGameMode)) return;
    const generatedJoinCode = buildJoinCode();
    const result = (await createTeam(
      buildTeamName(),
      generatedJoinCode,
      5,
      currentGameMode
    )) as CreateTeamResponse;
    const team = requireCreatedTeam(result);
    applyCreatedTeam(team, generatedJoinCode, currentGameMode);
    await verifyCreatedMembership(team.id, currentGameMode);
    await ensureOwnerDisplayName(team.ownerId);
    showNotification(t('page.team.card.myteam.create_team_success'));
  };
  const handleCreateTeam = async () => {
    loading.value.createTeam = true;
    try {
      await createTeamWorkflow();
    } catch (error: unknown) {
      logger.error('[MyTeam] Error creating team:', error);
      showNotification(getCreateTeamErrorMessage(error), 'error');
    } finally {
      loading.value.createTeam = false;
    }
  };
  const handleLeaveTeam = async () => {
    loading.value.leaveTeam = true;
    const currentGameMode = getCurrentGameMode();
    try {
      validateAuth();
      const currentTeamId = getTeamId();
      const { data: membershipData, error: membershipError } = await $supabase.client
        .from('team_memberships')
        .select('*')
        .eq('user_id', $supabase.user.id)
        .eq('team_id', currentTeamId)
        .eq('game_mode', currentGameMode)
        .maybeSingle();
      if (!membershipData && !membershipError) {
        setLocalTeamId(currentGameMode, null, currentTeamId);
        const { data: allMembers } = await $supabase.client
          .from('team_memberships')
          .select('user_id')
          .eq('team_id', currentTeamId);
        if (!allMembers || allMembers.length === 0) {
          const { error: deleteTeamError } = await $supabase.client
            .from('teams')
            .delete()
            .eq('id', currentTeamId);
          if (deleteTeamError) {
            logger.error('[MyTeam] Failed to delete empty team:', deleteTeamError);
          }
        }
        showNotification(
          'Your team data was in a broken state and has been cleaned up. Please create a new team.'
        );
        loading.value.leaveTeam = false;
        return;
      }
      const { data: otherMembers } = await $supabase.client
        .from('team_memberships')
        .select('*')
        .eq('team_id', currentTeamId)
        .neq('user_id', $supabase.user.id);
      if (otherMembers && otherMembers.length > 0) {
        for (const ghostMember of otherMembers) {
          const { error: deleteError } = await $supabase.client
            .from('team_memberships')
            .delete()
            .eq('team_id', currentTeamId)
            .eq('user_id', ghostMember.user_id);
          if (deleteError) {
            logger.error('[MyTeam] Failed to delete ghost member:', deleteError);
          }
        }
        await delay(500);
      }
      const currentTeamIdForLeave = getTeamId();
      if (!currentTeamIdForLeave) {
        throw new Error(t('page.team.card.myteam.no_team'));
      }
      const result = (await leaveTeam(currentTeamIdForLeave)) as LeaveTeamResponse;
      if (!result.success) {
        throw new Error(t('page.team.card.myteam.leave_team_error'));
      }
      setLocalTeamId(currentGameMode, null, currentTeamIdForLeave);
      teamStore.$reset();
      await delay(500);
      await nextTick();
      const displayName = tarkovStore.getDisplayName();
      if (displayName && displayName.startsWith('User ')) {
        tarkovStore.setDisplayName('User');
      }
      showNotification(t('page.team.card.myteam.leave_team_success'));
    } catch (error: unknown) {
      logger.error('[MyTeam] Error leaving team:', error);
      const message =
        error instanceof Error
          ? error.message
          : t('page.team.card.myteam.leave_team_error_unexpected');
      showNotification(message, 'error');
    }
    loading.value.leaveTeam = false;
  };
  const copyUrl = async () => {
    if (!navigator?.clipboard) {
      logger.warn('[MyTeam] Clipboard API is not available');
      return;
    }
    if (teamUrl.value) {
      try {
        await navigator.clipboard.writeText(teamUrl.value);
        showNotification(t('page.team.card.myteam.url_copied', 'URL copied to clipboard'));
      } catch (error) {
        logger.error('[MyTeam] Failed to copy URL to clipboard:', error);
        showNotification(
          t('page.team.card.myteam.copy_url_failed', 'Failed to copy URL to clipboard'),
          'error'
        );
      }
    }
  };
  const teamUrl = computed(() => {
    const teamId = getTeamId();
    const code = teamStore.inviteCode;
    if (!teamId || !code) return '';
    const baseUrl = window.location.href.split('?')[0];
    const params = new URLSearchParams({ team: teamId, code });
    return `${baseUrl}?${params}`;
  });
</script>
