<template>
  <TeamCard
    :title="$t('page.team.invite.title')"
    :subtitle="$t('page.team.invite.subtitle')"
    data-testid="team-invite-card"
  >
    <template #icon>
      <UIcon name="i-mdi-link-variant" class="text-primary-300 h-5 w-5" />
    </template>
    <div class="space-y-4">
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
        <p class="text-surface-300">{{ $t('page.team.card.myteam.no_team') }}</p>
        <UButton
          :disabled="loading.createTeam"
          :loading="loading.createTeam"
          color="primary"
          icon="i-mdi-account-group"
          class="mt-4 min-h-11"
          @click="handleCreateTeam"
        >
          {{ $t('page.team.card.myteam.create_new_team') }}
        </UButton>
      </div>
      <div v-else class="space-y-4">
        <div>
          <label for="team-invite-url" class="text-surface-200 text-sm font-medium">
            {{ $t('page.team.invite.link_label') }}
          </label>
          <p id="team-invite-url-help" class="text-surface-400 mt-1 text-sm leading-5">
            {{ $t('page.team.invite.helper') }}
          </p>
        </div>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start">
          <input
            id="team-invite-url"
            :value="linkVisible ? teamUrl : maskedTeamUrl"
            type="text"
            readonly
            :aria-describedby="'team-invite-url-help'"
            class="bg-surface-800 border-surface-700 focus-visible:ring-primary-500 min-h-11 min-w-0 flex-1 rounded-lg border px-3 font-mono text-sm transition outline-none focus-visible:ring-2"
          />
          <div class="flex flex-col gap-3 sm:flex-row">
            <UButton
              :icon="linkVisible ? 'i-mdi-eye-off-outline' : 'i-mdi-eye-outline'"
              color="neutral"
              variant="outline"
              size="md"
              class="min-h-11 justify-center"
              :aria-pressed="linkVisible"
              @click="linkVisible = !linkVisible"
            >
              {{ linkVisible ? $t('page.team.invite.hide') : $t('page.team.invite.show') }}
            </UButton>
            <UButton
              :icon="copied ? 'i-mdi-check' : 'i-mdi-content-copy'"
              color="primary"
              variant="solid"
              size="md"
              class="min-h-11 justify-center sm:min-w-32"
              :disabled="!teamUrl"
              data-testid="copy-team-invite"
              @click="copyUrl"
            >
              <span aria-live="polite">
                {{ copied ? $t('page.team.invite.copied') : $t('page.team.invite.copy') }}
              </span>
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </TeamCard>
</template>
<script setup lang="ts">
  import LoginRequiredAlert from '@/components/ui/LoginRequiredAlert.vue';
  import { useEdgeFunctions } from '@/composables/api/useEdgeFunctions';
  import TeamCard from '@/features/team/TeamCard.vue';
  import { useTeamInviteCopyFeedback } from '@/features/team/useTeamInviteCopyFeedback';
  import { useTeamInviteLink } from '@/features/team/useTeamInviteLink';
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
  import type { CreateTeamResponse } from '@/types/team';
  const { t } = useI18n({ useScope: 'global' });
  const { teamStore } = useTeamStoreWithSupabase();
  const { systemStore, hasInitiallyLoaded } = useSystemStoreWithSupabase();
  function getCurrentGameMode(): GameMode {
    return tarkovStore.getCurrentGameMode?.() || GAME_MODES.PVP;
  }
  const tarkovStore = useTarkovStore();
  const { $supabase } = useNuxtApp();
  const toast = useToast();
  const { createTeam } = useEdgeFunctions();
  const { copied, copyInviteLink } = useTeamInviteCopyFeedback();
  const { maskedTeamUrl, teamUrl } = useTeamInviteLink();
  const setLocalTeamId = (mode: GameMode, teamId: string | null) => {
    const key = getTeamIdStateKey(mode);
    systemStore.$patch((state) => {
      state[key] = teamId;
      if (mode === GAME_MODES.PVP) {
        state.team = teamId;
        state.team_id = teamId;
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
  const loading = ref({ createTeam: false });
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
    const joinCode = team.joinCode ?? generatedJoinCode;
    setLocalTeamId(mode, team.id);
    teamStore.$patch((state) => {
      state.id = team.id;
      state.joinCode = joinCode;
      state.owner = team.ownerId;
      state.members = [team.ownerId];
    });
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
  const copyUrl = async () => {
    await copyInviteLink(teamUrl.value);
  };
</script>
