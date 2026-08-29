import { defineStore } from 'pinia';
import { useEdgeFunctions } from '@/composables/api/useEdgeFunctions';
import { useSupabaseListener } from '@/composables/supabase/useSupabaseListener';
import { useSafeToast } from '@/composables/useSafeToast';
import { actions, defaultState, getters, type UserState } from '@/stores/progressState';
import { replayProgressMetadataMigration } from '@/stores/tarkov/metadataStoreBridge';
import { getTeamIdFromState, useSystemStoreWithSupabase } from '@/stores/useSystemStore';
import { useTarkovStore } from '@/stores/useTarkov';
import { getCurrentGameMode } from '@/stores/utils/gameMode';
import { ACTIVE_SEASON_NUMBER, GAME_MODES, isGameMode, type GameMode } from '@/utils/constants';
import { getErrorStatus } from '@/utils/errors';
import { logger } from '@/utils/logger';
import {
  getLegacyModeProgressField,
  hasMaterializedProgress,
  resolveModeProgressData,
} from '@/utils/modeProgressFallback';
import { sanitizeTeammateProgressData } from '@/utils/progressSanitizers';
import type { MemberProfile, TeamGetters, TeamState } from '@/types/tarkov';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Store } from 'pinia';
/**
 * Helper to extract team ID from system store for the current game mode
 * Reads directly from state to avoid getter reactivity issues
 */
function getTeamIdFromSystemStore(
  systemStore: ReturnType<typeof useSystemStoreWithSupabase>['systemStore']
): string | null {
  return getTeamIdFromState(systemStore.$state, getCurrentGameMode());
}
/**
 * Team store definition with getters for team info and members
 */
export const useTeamStore = defineStore<string, TeamState, TeamGetters>('team', {
  state: (): TeamState => ({
    // fallow-ignore-next-line unused-store-member -- read directly by Team page consumers
    id: null,
    owner: null,
    joinCode: null,
    members: [],
    memberProfiles: {},
  }),
  getters: {
    teamOwner(state) {
      return state?.owner || null;
    },
    isOwner(state) {
      const { $supabase } = useNuxtApp();
      const owner = state.owner;
      return owner === $supabase.user?.id;
    },
    /**
     * Get the invite code for team joining
     */
    inviteCode(state) {
      // fall back to raw join_code (supabase column) in case mapping misses
      const rawJoinCode = (state as unknown as { join_code?: string | null }).join_code;
      return state?.joinCode || rawJoinCode || null;
    },
    teamMembers(state) {
      return state?.members || [];
    },
    teammates(state) {
      const currentMembers = state?.members;
      const { $supabase } = useNuxtApp();
      const currentUID = $supabase.user?.id;
      if (currentMembers && currentUID) {
        return currentMembers.filter((member) => member !== currentUID);
      }
      return [];
    },
  },
});
// Type for the team store instance to avoid circular reference
interface TeamStoreInstance {
  teamStore: ReturnType<typeof useTeamStore>;
  isSubscribed: Ref<boolean>;
  cleanup: () => void;
}
type TaskCompletionSnapshot = Record<string, { complete?: boolean; failed?: boolean }>;
const TEAM_PROGRESS_REFRESH_DELAY_MS = 5500;
const logTeammateModeProgressHydrationFailure = (error: unknown, teammateId: string): void => {
  logger.warn('[TeammateStore] Failed to hydrate mode progress:', {
    error,
    teammateId,
  });
};
const applyLegacyPersistentProgressResult = (
  result: { data: { pve_data?: unknown; pvp_data?: unknown } | null; error: unknown },
  appliedModes: Set<GameMode>,
  teammateId: string,
  mode: GameMode,
  applyProgress: (mode: GameMode, progress: unknown) => void
): void => {
  if (result.error) {
    logTeammateModeProgressHydrationFailure(result.error, teammateId);
    return;
  }
  if (appliedModes.has(mode)) return;
  const legacyProgress = resolveModeProgressData(mode, null, result.data);
  if (legacyProgress !== null) applyProgress(mode, legacyProgress);
};
const fetchLegacyTeammateProgress = async (
  client: Pick<SupabaseClient, 'from'>,
  teammateId: string,
  mode: GameMode
) => {
  const legacyProgressField = getLegacyModeProgressField(mode);
  if (!legacyProgressField) return { data: null, error: null };
  return client
    .from('user_progress')
    .select(legacyProgressField)
    .eq('user_id', teammateId)
    .maybeSingle();
};
const resolveTeammateLegacyMode = (
  memberProfile: MemberProfile | undefined,
  currentMode: GameMode
): GameMode => memberProfile?.gameMode ?? currentMode;
export type TeammateIdentity = {
  currentGameMode: GameMode;
  gameEdition: number;
};
export const resolveTeammateIdentity = (
  profile: MemberProfile | undefined,
  fallbackMode: GameMode
): TeammateIdentity => {
  const identity: TeammateIdentity = {
    currentGameMode: fallbackMode,
    gameEdition: defaultState.gameEdition,
  };
  if (!profile) return identity;
  identity.currentGameMode = profile.gameMode ?? fallbackMode;
  identity.gameEdition = profile.gameEdition ?? defaultState.gameEdition;
  return identity;
};
export type MemberProfileBroadcast = {
  userId: string;
  displayName?: string | null;
  gameEdition?: number;
  gameMode?: GameMode;
  level?: number | null;
  tasksCompleted?: number | null;
};
export const mergeMemberProfileBroadcast = (
  profiles: Record<string, MemberProfile>,
  data: MemberProfileBroadcast
): Record<string, MemberProfile> => {
  const existingProfile = profiles[data.userId];
  const { displayName = null, level = null, tasksCompleted = null } = data;
  return {
    ...profiles,
    [data.userId]: {
      ...existingProfile,
      displayName,
      level,
      tasksCompleted,
    },
  };
};
function cloneTaskCompletions(
  taskCompletions: TaskCompletionSnapshot | undefined
): TaskCompletionSnapshot {
  return Object.fromEntries(
    Object.entries(taskCompletions ?? {}).map(([taskId, completion]) => [
      taskId,
      {
        complete: completion?.complete,
        failed: completion?.failed,
      },
    ])
  );
}
// Singleton instance to prevent multiple listener setups
let teamStoreInstance: TeamStoreInstance | null = null;
export function useTeamStoreWithSupabase(): TeamStoreInstance {
  // Return cached instance if it exists
  if (teamStoreInstance) {
    return teamStoreInstance;
  }
  const { systemStore } = useSystemStoreWithSupabase();
  const tarkovStore = useTarkovStore();
  const teamStore = useTeamStore();
  const { $supabase } = useNuxtApp();
  const teamChannel = ref<RealtimeChannel | null>(null);
  let lastMembersRefreshAt = 0;
  let refreshInFlight: Promise<void> | null = null;
  let refreshInFlightTeamId: string | null = null;
  let latestMembersRequestVersion = 0;
  let lastProgressSnapshot: {
    mode: GameMode;
    displayName: string | null;
    gameEdition: number;
    level: number | null;
    tasksCompleted: number;
  } | null = null;
  let prevTaskCompletions: TaskCompletionSnapshot = {};
  let taskBroadcastInitialized = false;
  let progressRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingTaskUpdates = new Map<
    string,
    { userId: string; gameMode: GameMode; taskId: string; complete: boolean; failed: boolean }
  >();
  let taskBroadcastTimer: ReturnType<typeof setTimeout> | null = null;
  // Computed reference to the team document based on system store
  const teamFilter = computed(() => {
    const currentSystemStateTeam = getTeamIdFromSystemStore(systemStore);
    return $supabase.user?.loggedIn &&
      currentSystemStateTeam &&
      typeof currentSystemStateTeam === 'string'
      ? `id=eq.${currentSystemStateTeam}`
      : undefined;
  });
  // Custom data handler that transforms DB data before patching to store
  const handleTeamData = (data: Record<string, unknown> | null) => {
    if (data) {
      // Transform database fields to client fields BEFORE patching
      const transformed: Partial<TeamState> & {
        owner_id?: string | null;
        join_code?: string | null;
      } = {
        ...data,
      };
      // Map owner_id to owner
      if ('owner_id' in data && typeof data.owner_id === 'string') {
        transformed.owner = data.owner_id;
      } else if ('owner_id' in data && data.owner_id === null) {
        transformed.owner = null;
      }
      // Map join_code to joinCode
      if ('join_code' in data && typeof data.join_code === 'string') {
        transformed.joinCode = data.join_code;
      } else if ('join_code' in data && data.join_code === null) {
        transformed.joinCode = null;
      }
      teamStore.$patch(transformed as Partial<TeamState>);
      void refreshMembers();
    } else {
      teamStore.$reset();
      teamStore.$patch((state) => {
        state.members = [];
      });
    }
  };
  const cleanupMembership = () => {
    if (teamChannel.value) {
      $supabase.client.removeChannel(teamChannel.value as unknown as RealtimeChannel);
      teamChannel.value = null;
    }
    if (taskBroadcastTimer) {
      clearTimeout(taskBroadcastTimer);
      taskBroadcastTimer = null;
    }
    if (progressRefreshTimer) {
      clearTimeout(progressRefreshTimer);
      progressRefreshTimer = null;
    }
    pendingTaskUpdates.clear();
    prevTaskCompletions = {};
    taskBroadcastInitialized = false;
    lastProgressSnapshot = null;
  };
  const refreshMembers = async (force = false) => {
    if (!$supabase.user?.loggedIn || !$supabase.user?.id) {
      teamStore.$patch((state) => {
        state.members = [];
        state.memberProfiles = {};
      });
      return;
    }
    if (refreshInFlight) {
      const currentTeamId = getTeamIdFromSystemStore(systemStore);
      if (!currentTeamId || refreshInFlightTeamId !== currentTeamId) {
        refreshInFlight = null;
        refreshInFlightTeamId = null;
      } else {
        try {
          await refreshInFlight;
        } catch (error) {
          const status = getErrorStatus(error);
          if (status === 401 || status === 403) {
            logger.debug('[TeamStore] Skipping team member refresh due auth/membership status:', {
              status,
            });
            return;
          }
          logger.warn('[TeamStore] Failed to load team members:', error);
        }
        return;
      }
    }
    const now = Date.now();
    if (!force && now - lastMembersRefreshAt < 2000) {
      return;
    }
    const currentTeamId = getTeamIdFromSystemStore(systemStore);
    if (!currentTeamId) {
      teamStore.$patch((state) => {
        state.members = [];
        state.memberProfiles = {};
      });
      cleanupMembership();
      return;
    }
    const requestVersion = ++latestMembersRequestVersion;
    const inFlightRequest = (async () => {
      const { getTeamMembers } = useEdgeFunctions();
      const result = await getTeamMembers(currentTeamId, force);
      if (requestVersion !== latestMembersRequestVersion) {
        return;
      }
      if (getTeamIdFromSystemStore(systemStore) !== currentTeamId) {
        return;
      }
      teamStore.$patch((state) => {
        state.members = result?.members || [];
        state.memberProfiles = result?.profiles || {};
      });
    })();
    refreshInFlight = inFlightRequest;
    refreshInFlightTeamId = currentTeamId;
    try {
      await inFlightRequest;
    } catch (error) {
      const status = getErrorStatus(error);
      if (status === 401 || status === 403) {
        logger.debug('[TeamStore] Skipping team member refresh due auth/membership status:', {
          status,
        });
        return;
      }
      logger.warn('[TeamStore] Failed to load team members:', error);
    } finally {
      if (refreshInFlight === inFlightRequest) {
        lastMembersRefreshAt = Date.now();
        refreshInFlight = null;
        refreshInFlightTeamId = null;
      }
    }
  };
  const setupMembershipSubscription = () => {
    const currentTeamId = getTeamIdFromSystemStore(systemStore);
    cleanupMembership();
    if (!currentTeamId) return;
    teamChannel.value = $supabase.client
      .channel(`team:${currentTeamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_memberships',
          filter: `team_id=eq.${currentTeamId}`,
        },
        () => {
          void refreshMembers();
        }
      )
      .on('broadcast', { event: 'progress' }, () => {
        if (progressRefreshTimer) clearTimeout(progressRefreshTimer);
        progressRefreshTimer = setTimeout(() => {
          progressRefreshTimer = null;
          void refreshMembers(true);
        }, TEAM_PROGRESS_REFRESH_DELAY_MS);
      })
      .on('broadcast', { event: 'task-update' }, (payload) => {
        const data = (payload?.payload || {}) as {
          userId?: string;
          gameMode?: GameMode;
          taskId?: string;
          complete?: boolean;
          failed?: boolean;
        };
        if (!data?.userId || !data?.taskId || data.userId === $supabase.user?.id) return;
        // Emit event for teammate stores to pick up
        logger.debug('[TeamStore] Received task-update broadcast:', data);
        window.dispatchEvent(new CustomEvent('teammate-task-update', { detail: data }));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void refreshMembers();
        }
      });
  };
  // Setup Supabase listener with custom onData handler
  // NOTE: Don't pass the store - we handle patching manually to preserve mapped fields
  const { cleanup: teamListenerCleanup, isSubscribed } = useSupabaseListener({
    store: teamStore,
    table: 'teams',
    filter: teamFilter,
    storeId: 'team',
    onData: handleTeamData,
  });
  watch(
    teamFilter,
    async () => {
      cleanupMembership();
      await refreshMembers(true);
      setupMembershipSubscription();
    },
    { immediate: true }
  );
  const localProgressSnapshot = computed(() => {
    const mode = tarkovStore.$state.currentGameMode || GAME_MODES.PVP;
    const modeState = (tarkovStore.$state as unknown as Record<string, unknown>)[mode] as {
      displayName?: string | null;
      level?: number | null;
      taskCompletions?: Record<string, { complete?: boolean; failed?: boolean }>;
    } | null;
    const completed = modeState?.taskCompletions
      ? Object.values(modeState.taskCompletions).filter((t) => t?.complete).length
      : 0;
    return {
      mode,
      displayName: modeState?.displayName ?? null,
      gameEdition: tarkovStore.$state.gameEdition,
      level: modeState?.level ?? null,
      tasksCompleted: completed,
    };
  });
  watch(
    () => localProgressSnapshot.value,
    (snapshot) => {
      const currentTeamId = getTeamIdFromSystemStore(systemStore);
      if (!currentTeamId || !teamChannel.value || !$supabase.user?.id) {
        return;
      }
      const existingProfile = teamStore.memberProfiles?.[$supabase.user.id as string];
      const snapshotMatches =
        lastProgressSnapshot &&
        lastProgressSnapshot.mode === snapshot.mode &&
        lastProgressSnapshot.displayName === snapshot.displayName &&
        lastProgressSnapshot.gameEdition === snapshot.gameEdition &&
        lastProgressSnapshot.level === snapshot.level &&
        lastProgressSnapshot.tasksCompleted === snapshot.tasksCompleted;
      const profileMatches =
        existingProfile &&
        existingProfile.displayName === snapshot.displayName &&
        existingProfile.level === snapshot.level &&
        existingProfile.tasksCompleted === snapshot.tasksCompleted &&
        existingProfile.gameMode === snapshot.mode;
      if (snapshotMatches && profileMatches) {
        return;
      }
      lastProgressSnapshot = { ...snapshot };
      void teamChannel.value.httpSend('progress', {
        userId: $supabase.user.id,
        displayName: snapshot.displayName,
        gameEdition: snapshot.gameEdition,
        level: snapshot.level,
        tasksCompleted: snapshot.tasksCompleted,
        gameMode: snapshot.mode,
      });
      teamStore.$patch((state) => {
        state.memberProfiles = {
          ...teamStore.memberProfiles,
          [$supabase.user.id as string]: {
            displayName: snapshot.displayName,
            gameEdition: snapshot.gameEdition,
            level: snapshot.level,
            tasksCompleted: snapshot.tasksCompleted,
            gameMode: snapshot.mode,
          },
        } as Record<string, MemberProfile>;
      });
    }
  );
  watch(
    () => {
      const mode = tarkovStore.$state.currentGameMode || GAME_MODES.PVP;
      const modeState = (tarkovStore.$state as unknown as Record<string, unknown>)[mode] as {
        taskCompletions?: Record<string, { complete?: boolean; failed?: boolean }>;
      } | null;
      return { mode, taskCompletions: modeState?.taskCompletions || {} };
    },
    (newVal) => {
      if (!taskBroadcastInitialized) {
        prevTaskCompletions = cloneTaskCompletions(newVal.taskCompletions);
        taskBroadcastInitialized = true;
        return;
      }
      const currentTeamId = getTeamIdFromSystemStore(systemStore);
      if (!currentTeamId || !teamChannel.value || !$supabase.user?.id) {
        prevTaskCompletions = cloneTaskCompletions(newVal.taskCompletions);
        return;
      }
      const scheduleBroadcastFlush = () => {
        if (taskBroadcastTimer) return;
        taskBroadcastTimer = setTimeout(() => {
          taskBroadcastTimer = null;
          if (!teamChannel.value) {
            pendingTaskUpdates.clear();
            return;
          }
          for (const update of pendingTaskUpdates.values()) {
            void teamChannel.value.httpSend('task-update', update);
          }
          pendingTaskUpdates.clear();
        }, 500);
      };
      // Find changed tasks
      for (const [taskId, completion] of Object.entries(newVal.taskCompletions)) {
        const prev = prevTaskCompletions[taskId];
        if (!prev || prev.complete !== completion?.complete || prev.failed !== completion?.failed) {
          pendingTaskUpdates.set(taskId, {
            userId: $supabase.user.id,
            gameMode: newVal.mode,
            taskId,
            complete: completion?.complete ?? false,
            failed: completion?.failed ?? false,
          });
        }
      }
      if (pendingTaskUpdates.size > 0) {
        scheduleBroadcastFlush();
      }
      prevTaskCompletions = cloneTaskCompletions(newVal.taskCompletions);
    },
    { deep: true }
  );
  // Watch for filter changes handled by useSupabaseListener
  const instance = {
    teamStore,
    isSubscribed,
    cleanup: () => {
      teamListenerCleanup();
      cleanupMembership();
    },
  };
  // Cache the instance for singleton pattern
  teamStoreInstance = instance;
  return instance;
}
/**
 * Composable for managing teammate stores dynamically
 */
export function useTeammateStores() {
  const { teamStore } = useTeamStoreWithSupabase();
  const { $supabase } = useNuxtApp();
  const teammateStores = ref<Record<string, Store<string, UserState>>>({});
  const teammateUnsubscribes = ref<Record<string, () => void>>({});
  const toast = useSafeToast();
  // Track pending retry timeouts for cleanup
  const pendingRetryTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
  // Watch team state changes to manage teammate stores
  watch(
    [() => teamStore.members, () => teamStore.memberProfiles],
    async ([members]) => {
      await nextTick();
      const currentUID = $supabase.user?.id;
      const newTeammatesArray = members?.filter((member: string) => member !== currentUID) || [];
      // Remove stores for teammates no longer in the team
      for (const teammate of Object.keys(teammateStores.value)) {
        if (!newTeammatesArray.includes(teammate)) {
          if (teammateUnsubscribes.value[teammate]) {
            teammateUnsubscribes.value[teammate]();
            const { [teammate]: _removed, ...rest } = teammateUnsubscribes.value;
            teammateUnsubscribes.value = rest;
          }
          const { [teammate]: _storeRemoved, ...restStores } = teammateStores.value;
          teammateStores.value = restStores as typeof teammateStores.value;
        }
      }
      // Add stores for new teammates
      try {
        for (const teammate of newTeammatesArray) {
          if (!teammateStores.value[teammate]) {
            createTeammateStore(teammate);
          } else {
            const memberProfile = teamStore.memberProfiles?.[teammate];
            teammateStores.value[teammate].$patch((state) => {
              Object.assign(state, resolveTeammateIdentity(memberProfile, getCurrentGameMode()));
            });
          }
        }
      } catch (error) {
        logger.error('Error managing teammate stores:', error);
        toast?.add({ title: 'Failed to load teammate data. Retrying…', color: 'warning' });
        // Clear any existing retry timeout before setting a new one
        if (pendingRetryTimeout.value) {
          clearTimeout(pendingRetryTimeout.value);
        }
        // Basic retry once after a short delay for transient issues
        pendingRetryTimeout.value = setTimeout(() => {
          pendingRetryTimeout.value = null;
          try {
            for (const teammate of newTeammatesArray) {
              if (!teammateStores.value[teammate]) {
                createTeammateStore(teammate);
              }
            }
            toast?.add({ title: 'Teammate data loaded on retry', color: 'primary' });
          } catch (e) {
            logger.error('Retry failed for teammate stores:', e);
            toast?.add({ title: 'Could not load teammate data', color: 'error' });
          }
        }, 1500);
      }
    },
    {
      immediate: true,
    }
  );
  // Create a store for a specific teammate
  const createTeammateStore = (teammateId: string) => {
    try {
      // Define the teammate store
      const storeDefinition = defineStore(`teammate-${teammateId}`, {
        state: () => structuredClone(defaultState),
        getters: getters,
        actions: actions,
      });
      const storeInstance = storeDefinition();
      teammateStores.value[teammateId] = storeInstance;
      const memberProfile = teamStore.memberProfiles?.[teammateId];
      storeInstance.$patch((state) => {
        Object.assign(state, resolveTeammateIdentity(memberProfile, getCurrentGameMode()));
      });
      const appliedModes = new Set<GameMode>();
      const applyProgressData = (mode: GameMode, progress: unknown, authoritative = false) => {
        if (authoritative || hasMaterializedProgress(progress)) appliedModes.add(mode);
        storeInstance.$patch((state) => {
          state[mode] = {
            ...defaultState[mode],
            ...sanitizeTeammateProgressData(progress),
          };
        });
      };
      const applyModeProgress = (
        row: Record<string, unknown>,
        authoritative = false
      ): GameMode | null => {
        const mode = row.game_mode;
        if (!isGameMode(mode)) return null;
        const expectedSeason = mode === GAME_MODES.SEASONAL ? ACTIVE_SEASON_NUMBER : 0;
        if (row.season_number !== expectedSeason) return null;
        applyProgressData(mode, row.progress_data, authoritative);
        return mode;
      };
      const legacyMode = resolveTeammateLegacyMode(memberProfile, getCurrentGameMode());
      const hydrateModeProgress = async () => {
        try {
          const [modeRows, legacyRow] = await Promise.all([
            $supabase.client
              .from('user_game_mode_progress')
              .select('game_mode,season_number,progress_data')
              .eq('user_id', teammateId),
            fetchLegacyTeammateProgress($supabase.client, teammateId, legacyMode),
          ]);
          if (modeRows.error) {
            logTeammateModeProgressHydrationFailure(modeRows.error, teammateId);
            return;
          }
          modeRows.data?.forEach((row) => applyModeProgress(row as Record<string, unknown>));
          applyLegacyPersistentProgressResult(
            legacyRow,
            appliedModes,
            teammateId,
            legacyMode,
            applyProgressData
          );
          replayProgressMetadataMigration();
        } catch (error) {
          logTeammateModeProgressHydrationFailure(error, teammateId);
        }
      };
      const modeChannel = $supabase.client
        .channel(`teammate-mode-progress-${teammateId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_game_mode_progress',
            filter: `user_id=eq.${teammateId}`,
          },
          (payload) => applyModeProgress(payload.new as Record<string, unknown>, true)
        )
        .subscribe();
      void hydrateModeProgress();
      teammateUnsubscribes.value[teammateId] = () => {
        void $supabase.client.removeChannel(modeChannel);
      };
      // Listen for task-update broadcasts for this teammate
      const handleTaskUpdate = (event: Event) => {
        const data = (event as CustomEvent).detail as {
          userId: string;
          gameMode: GameMode;
          taskId: string;
          complete: boolean;
          failed: boolean;
        };
        if (data.userId !== teammateId) return;
        // Update the teammate store with the task change
        const modeKey = data.gameMode;
        if (!isGameMode(modeKey)) return;
        const currentModeData = storeInstance.$state[modeKey] || {};
        appliedModes.add(modeKey);
        const currentCompletions =
          (
            currentModeData as {
              taskCompletions?: Record<string, { complete?: boolean; failed?: boolean }>;
            }
          ).taskCompletions || {};
        storeInstance.$patch({
          [modeKey]: {
            ...currentModeData,
            taskCompletions: {
              ...currentCompletions,
              [data.taskId]: { complete: data.complete, failed: data.failed },
            },
          },
        });
        logger.debug(`[TeammateStore] Applied task-update for ${teammateId}:`, data);
      };
      window.addEventListener('teammate-task-update', handleTaskUpdate);
      // Update cleanup to also remove the event listener
      const originalCleanup = teammateUnsubscribes.value[teammateId];
      teammateUnsubscribes.value[teammateId] = () => {
        window.removeEventListener('teammate-task-update', handleTaskUpdate);
        originalCleanup?.();
      };
    } catch (error) {
      logger.error(`Error creating store for teammate ${teammateId}:`, error);
    }
  };
  // Cleanup all teammate stores
  const cleanup = () => {
    // Clear any pending retry timeout
    if (pendingRetryTimeout.value) {
      clearTimeout(pendingRetryTimeout.value);
      pendingRetryTimeout.value = null;
    }
    Object.values(teammateUnsubscribes.value).forEach((unsubscribe) => {
      if (unsubscribe) unsubscribe();
    });
    teammateUnsubscribes.value = {};
    teammateStores.value = {};
  };
  return {
    teammateStores,
    teammateUnsubscribes,
    cleanup,
  };
}
