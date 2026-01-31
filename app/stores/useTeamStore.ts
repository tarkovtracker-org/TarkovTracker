import { defineStore } from 'pinia';
import { computed, nextTick, ref, watch, type Ref } from 'vue';
import { useEdgeFunctions } from '@/composables/api/useEdgeFunctions';
import { useSupabaseListener } from '@/composables/supabase/useSupabaseListener';
import type { UserState } from '@/stores/progressState';
import { useSystemStoreWithSupabase } from '@/stores/useSystemStore';
import { useTarkovStore } from '@/stores/useTarkov';
import type { MemberProfile, TeamGetters, TeamState } from '@/types/tarkov';
import { GAME_MODES } from '@/utils/constants';
import { logger } from '@/utils/logger';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Store } from 'pinia';
import { useToast } from '#imports';
/**
 * Helper to get current game mode
 */
function getCurrentGameMode(): 'pvp' | 'pve' {
  try {
    const tarkovStore = useTarkovStore();
    return (tarkovStore.getCurrentGameMode?.() as 'pvp' | 'pve') || GAME_MODES.PVP;
  } catch {
    return GAME_MODES.PVP;
  }
}
/**
 * Helper to extract team ID from system store for the current game mode
 * Reads directly from state to avoid getter reactivity issues
 */
function getTeamIdFromSystemStore(
  systemStore: ReturnType<typeof useSystemStoreWithSupabase>['systemStore']
): string | null {
  const state = systemStore.$state as {
    team?: string | null;
    team_id?: string | null;
    pvp_team_id?: string | null;
    pve_team_id?: string | null;
  };
  const mode = getCurrentGameMode();
  if (mode === 'pve') {
    return state.pve_team_id ?? state.team ?? state.team_id ?? null;
  }
  return state.pvp_team_id ?? state.team ?? state.team_id ?? null;
}
/**
 * Team store definition with getters for team info and members
 */
export const useTeamStore = defineStore<string, TeamState, TeamGetters>('team', {
  state: (): TeamState => ({
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
  let lastProgressSnapshot: {
    mode: 'pvp' | 'pve';
    displayName: string | null;
    level: number | null;
    tasksCompleted: number;
  } | null = null;
  let taskBroadcastInitialized = false;
  const pendingTaskUpdates = new Map<
    string,
    { userId: string; gameMode: 'pvp' | 'pve'; taskId: string; complete: boolean; failed: boolean }
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
  };
  const refreshMembers = async (force = false) => {
    if (refreshInFlight) {
      await refreshInFlight;
      return;
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
    try {
      refreshInFlight = (async () => {
        const { getTeamMembers } = useEdgeFunctions();
        const result = await getTeamMembers(currentTeamId);
        teamStore.$patch((state) => {
          state.members = result?.members || [];
          state.memberProfiles = result?.profiles || {};
        });
      })();
      await refreshInFlight;
    } catch (error) {
      logger.warn('[TeamStore] Failed to load team members:', error);
    } finally {
      lastMembersRefreshAt = Date.now();
      refreshInFlight = null;
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
      .on('broadcast', { event: 'progress' }, (payload) => {
        const data = (payload?.payload || {}) as {
          userId?: string;
          displayName?: string | null;
          level?: number | null;
          tasksCompleted?: number | null;
        };
        if (!data?.userId) return;
        // Update memberProfiles with the broadcasted snapshot
        teamStore.$patch((state) => {
          state.memberProfiles = {
            ...teamStore.memberProfiles,
            [data.userId as string]: {
              displayName: data.displayName ?? null,
              level: data.level ?? null,
              tasksCompleted: data.tasksCompleted ?? null,
            },
          } as Record<string, MemberProfile>;
        });
      })
      .on('broadcast', { event: 'task-update' }, (payload) => {
        const data = (payload?.payload || {}) as {
          userId?: string;
          gameMode?: 'pvp' | 'pve';
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
      await refreshMembers(true);
      setupMembershipSubscription();
    },
    { immediate: true }
  );
  const localProgressSnapshot = computed(() => {
    const mode =
      (tarkovStore.$state.currentGameMode as 'pvp' | 'pve' | undefined) || GAME_MODES.PVP;
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
      void teamChannel.value.send({
        type: 'broadcast',
        event: 'progress',
        payload: {
          userId: $supabase.user.id,
          displayName: snapshot.displayName,
          level: snapshot.level,
          tasksCompleted: snapshot.tasksCompleted,
          gameMode: snapshot.mode,
        },
      });
      teamStore.$patch((state) => {
        state.memberProfiles = {
          ...teamStore.memberProfiles,
          [$supabase.user.id as string]: {
            displayName: snapshot.displayName,
            level: snapshot.level,
            tasksCompleted: snapshot.tasksCompleted,
            gameMode: snapshot.mode,
          },
        } as Record<string, MemberProfile>;
      });
    },
    { deep: true }
  );
  // Track previous task completions to detect changes
  let prevTaskCompletions: Record<string, { complete?: boolean; failed?: boolean }> = {};
  // Watch for task completion changes and broadcast immediately
  watch(
    () => {
      const mode =
        (tarkovStore.$state.currentGameMode as 'pvp' | 'pve' | undefined) || GAME_MODES.PVP;
      const modeState = (tarkovStore.$state as unknown as Record<string, unknown>)[mode] as {
        taskCompletions?: Record<string, { complete?: boolean; failed?: boolean }>;
      } | null;
      return { mode, taskCompletions: modeState?.taskCompletions || {} };
    },
    (newVal) => {
      if (!taskBroadcastInitialized) {
        prevTaskCompletions = { ...newVal.taskCompletions };
        taskBroadcastInitialized = true;
        return;
      }
      const currentTeamId = getTeamIdFromSystemStore(systemStore);
      if (!currentTeamId || !teamChannel.value || !$supabase.user?.id) {
        prevTaskCompletions = { ...newVal.taskCompletions };
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
            void teamChannel.value.send({
              type: 'broadcast',
              event: 'task-update',
              payload: update,
            });
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
      prevTaskCompletions = { ...newVal.taskCompletions };
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
  const teammateStores = ref<Record<string, Store<string, UserState>>>({});
  const teammateUnsubscribes = ref<Record<string, () => void>>({});
  // Track pending retry timeouts for cleanup
  const pendingRetryTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
  // Watch team state changes to manage teammate stores
  watch(
    () => teamStore.$state,
    async (newState, _oldState) => {
      await nextTick();
      const { $supabase } = useNuxtApp();
      const currentUID = $supabase.user?.id;
      const newTeammatesArray =
        newState.members?.filter((member: string) => member !== currentUID) || [];
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
            await createTeammateStore(teammate);
          }
        }
      } catch (error) {
        logger.error('Error managing teammate stores:', error);
        const toast = useToast();
        toast.add({ title: 'Failed to load teammate data. Retrying…', color: 'warning' });
        // Clear any existing retry timeout before setting a new one
        if (pendingRetryTimeout.value) {
          clearTimeout(pendingRetryTimeout.value);
        }
        // Basic retry once after a short delay for transient issues
        pendingRetryTimeout.value = setTimeout(async () => {
          pendingRetryTimeout.value = null;
          try {
            for (const teammate of newTeammatesArray) {
              if (!teammateStores.value[teammate]) {
                await createTeammateStore(teammate);
              }
            }
            toast.add({ title: 'Teammate data loaded on retry', color: 'primary' });
          } catch (e) {
            logger.error('Retry failed for teammate stores:', e);
            toast.add({ title: 'Could not load teammate data', color: 'error' });
          }
        }, 1500);
      }
    },
    {
      immediate: true,
      deep: true,
    }
  );
  // Create a store for a specific teammate
  const createTeammateStore = async (teammateId: string) => {
    try {
      // Import required dependencies
      const { defineStore } = await import('pinia');
      const { getters, actions, defaultState } = await import('@/stores/progressState');
      // Define the teammate store
      const storeDefinition = defineStore(`teammate-${teammateId}`, {
        state: () => JSON.parse(JSON.stringify(defaultState)),
        getters: getters,
        actions: actions,
      });
      const storeInstance = storeDefinition();
      teammateStores.value[teammateId] = storeInstance;
      // Setup Supabase listener for this teammate with data transformation
      // Transform Supabase field names to match store structure
      const handleTeammateData = (data: Record<string, unknown> | null) => {
        if (data) {
          storeInstance.$patch({
            currentGameMode: data.current_game_mode || GAME_MODES.PVP,
            gameEdition: data.game_edition || 1,
            pvp: data.pvp_data || {},
            pve: data.pve_data || {},
          });
        }
      };
      const { cleanup } = useSupabaseListener({
        store: storeInstance,
        table: 'user_progress',
        filter: `user_id=eq.${teammateId}`,
        storeId: `teammate-${teammateId}`,
        onData: handleTeammateData,
      });
      teammateUnsubscribes.value[teammateId] = cleanup;
      // Listen for task-update broadcasts for this teammate
      const handleTaskUpdate = (event: Event) => {
        const data = (event as CustomEvent).detail as {
          userId: string;
          gameMode: 'pvp' | 'pve';
          taskId: string;
          complete: boolean;
          failed: boolean;
        };
        if (data.userId !== teammateId) return;
        // Update the teammate store with the task change
        const modeKey = data.gameMode === 'pve' ? 'pve' : 'pvp';
        const currentModeData = storeInstance.$state[modeKey] || {};
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
