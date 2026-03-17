<template>
  <GenericCard icon="mdi-account-supervisor" icon-color="white" highlight-color="secondary">
    <template #title>
      {{ $t('page.team.card.myteam.title') }}
    </template>
    <template #content>
      <div v-if="isLoadingTeamState" class="flex items-center justify-center py-8">
        <UIcon name="i-mdi-loading" class="text-foreground-muted h-6 w-6 animate-spin" />
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
              {{
                linkVisible
                  ? $t('page.team.card.myteam.hide_link')
                  : $t('page.team.card.myteam.show_link')
              }}
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
        <div v-if="linkVisible" class="bg-shell rounded-lg p-3">
          <div class="font-mono text-sm break-all">
            {{ teamUrl }}
          </div>
        </div>
        <div v-else class="bg-shell rounded-lg p-3">
          <div class="text-foreground-muted text-sm italic">
            {{ $t('page.team.card.myteam.link_hidden_message') }}
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="border-border flex items-center justify-start gap-2 border-t p-4">
        <template v-if="isLoadingTeamState" />
        <UButton
          v-else-if="!localUserTeam"
          :disabled="loading.createTeam || !isLoggedIn"
          :loading="loading.createTeam"
          color="primary"
          icon="i-mdi-account-group"
          @click="handleCreateTeam"
        >
          {{ $t('page.team.card.myteam.create_new_team') }}
        </UButton>
        <UButton
          v-else
          :disabled="loading.leaveTeam || !isLoggedIn"
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
  import { useEdgeFunctions } from '@/composables/api/useEdgeFunctions';
  import { getTeamIdFromState, useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { useTeamStoreWithSupabase } from '@/stores/useTeamStore';
  import { delay } from '@/utils/async';
  import { GAME_MODES, LIMITS } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  import type { SystemState, TeamState } from '@/types/tarkov';
  import type { CreateTeamResponse, LeaveTeamResponse } from '@/types/team';
  const { t } = useI18n({ useScope: 'global' });
  const { teamStore } = useTeamStoreWithSupabase();
  const { systemStore, hasInitiallyLoaded } = useSystemStoreWithSupabase();
  function getCurrentGameMode(): 'pvp' | 'pve' {
    return (tarkovStore.getCurrentGameMode?.() as 'pvp' | 'pve') || GAME_MODES.PVP;
  }
  function getTeamId(): string | null {
    return getTeamIdFromState(systemStore.$state, getCurrentGameMode());
  }
  const tarkovStore = useTarkovStore();
  const { $supabase } = useNuxtApp();
  const toast = useToast();
  const { createTeam, leaveTeam } = useEdgeFunctions();
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
  const handleCreateTeam = async () => {
    loading.value.createTeam = true;
    const generatedJoinCode = buildJoinCode();
    const generatedTeamName = buildTeamName();
    const currentGameMode = getCurrentGameMode();
    try {
      validateAuth();
      const { data: membership, error: membershipError } = await $supabase.client
        .from('team_memberships')
        .select('team_id, game_mode')
        .eq('user_id', $supabase.user.id)
        .eq('game_mode', currentGameMode)
        .maybeSingle();
      if (membershipError) {
        logger.error('[MyTeam] Error checking membership:', membershipError);
        throw membershipError;
      }
      if (membership?.team_id) {
        const teamIdColumn = currentGameMode === 'pve' ? 'pve_team_id' : 'pvp_team_id';
        systemStore.$patch({
          [teamIdColumn]: membership.team_id,
        } as Partial<SystemState>);
        showNotification(
          `You are already in a ${currentGameMode.toUpperCase()} team. Leave your current team first.`,
          'error'
        );
        loading.value.createTeam = false;
        return;
      }
      const result = (await createTeam(
        generatedTeamName,
        generatedJoinCode,
        5,
        currentGameMode
      )) as CreateTeamResponse;
      if (!result?.team) {
        logger.error('[MyTeam] Invalid response structure - missing team object');
        throw new Error(t('page.team.card.myteam.create_team_error_ui_update'));
      }
      const teamIdColumn = currentGameMode === 'pve' ? 'pve_team_id' : 'pvp_team_id';
      systemStore.$patch({ [teamIdColumn]: result.team.id } as Partial<SystemState>);
      const teamResponse = result.team as unknown as {
        id: string;
        ownerId: string;
        joinCode?: string;
        join_code?: string;
      };
      const joinCode = teamResponse.joinCode ?? teamResponse.join_code ?? generatedJoinCode;
      teamStore.$patch({
        joinCode: joinCode,
        join_code: joinCode,
        owner: result.team.ownerId,
        owner_id: result.team.ownerId,
        members: [result.team.ownerId],
      } as Partial<TeamState>);
      await delay(500);
      const { data: verification, error: verificationError } = await $supabase.client
        .from('team_memberships')
        .select('team_id, game_mode')
        .eq('user_id', $supabase.user.id)
        .eq('team_id', result.team.id)
        .eq('game_mode', currentGameMode)
        .maybeSingle();
      if (verificationError) {
        logger.error('[MyTeam] Verification query error:', verificationError);
      }
      if (!verification) {
        logger.error('[MyTeam] Team membership not found in database after creation');
        throw new Error(t('page.team.card.myteam.create_team_error_ui_update'));
      }
      await nextTick();
      if (result.team.ownerId === $supabase.user.id) {
        if (!tarkovStore.getDisplayName()) {
          const defaultName = `${tarkovStore.getCurrentGameMode().toUpperCase()}-PMC`;
          tarkovStore.setDisplayName(defaultName);
        }
      }
      showNotification(t('page.team.card.myteam.create_team_success'));
    } catch (error: unknown) {
      logger.error('[MyTeam] Error creating team:', error);
      const message =
        error &&
        typeof error === 'object' &&
        'details' in error &&
        error.details &&
        typeof error.details === 'object' &&
        'error' in error.details
          ? String(error.details.error)
          : error instanceof Error
            ? error.message
            : t('page.team.card.myteam.create_team_error');
      showNotification(message, 'error');
    }
    loading.value.createTeam = false;
  };
  const handleLeaveTeam = async () => {
    loading.value.leaveTeam = true;
    const currentGameMode = getCurrentGameMode();
    const teamIdColumn = currentGameMode === 'pve' ? 'pve_team_id' : 'pvp_team_id';
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
        systemStore.$patch({
          [teamIdColumn]: null,
          team: null,
          team_id: null,
        } as Partial<SystemState>);
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
      systemStore.$patch({
        [teamIdColumn]: null,
        team: null,
        team_id: null,
      } as Partial<SystemState>);
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
        showNotification('URL copied to clipboard');
      } catch (error) {
        logger.error('[MyTeam] Failed to copy URL to clipboard:', error);
        showNotification('Failed to copy URL to clipboard', 'error');
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
