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
import { hasMaterializedProgress, summarizeModeProgressData } from '@/utils/modeProgressFallback';
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
const logTeammateModeProgressHydrationFailure = (error: unknown, teammateId: string): void => {
  logger.warn('[TeammateStore] Failed to hydrate mode progress:', {
    error,
    teammateId,
  });
};
const TEAM_MEMBER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const buildMemberProgressFilter = (
  members: string[] | null | undefined
): string | undefined => {
  const memberIds = Array.from(
    new Set((members ?? []).filter((member) => TEAM_MEMBER_ID_PATTERN.test(member)))
  );
  return memberIds.length > 0 ? `user_id=in.(${memberIds.join(',')})` : undefined;
};
export const applyLegacyPersistentProgressResult = (
  result: { data: unknown; error: unknown },
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
  if (result.data !== null) applyProgress(mode, result.data);
};
export const fetchLegacyTeammateProgress = async (
  client: Pick<SupabaseClient, 'rpc'>,
  teammateId: string,
  mode: GameMode
): Promise<{ data: unknown; error: unknown }> => {
  if (mode === GAME_MODES.SEASONAL) return { data: null, error: null };
  return client.rpc('get_teammate_legacy_progress', {
    p_game_mode: mode,
    p_user_id: teammateId,
  });
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
  const listenerScope = effectScope(true);
  const teamChannel = ref<RealtimeChannel | null>(null);
  let membershipSubscriptionVersion = 0;
  let lastMembersRefreshAt = 0;
  let refreshInFlight: Promise<void> | null = null;
  let refreshInFlightTeamId: string | null = null;
  let latestMembersRequestVersion = 0;
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
    const channelToRemove = teamChannel.value;
    teamChannel.value = null;
    if (channelToRemove) {
      void $supabase.client
        .removeChannel(channelToRemove as unknown as RealtimeChannel)
        .catch((error) => {
          logger.warn('[TeamStore] Failed to remove team realtime channel:', error);
        });
    }
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
    const memberProgressFilter = buildMemberProgressFilter(teamStore.members);
    let nextChannel = $supabase.client
      .channel(`team:${currentTeamId}`, { config: { private: true } })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_memberships',
          filter: `team_id=eq.${currentTeamId}`,
        },
        () => {
          void refreshMembershipSubscription();
        }
      );
    if (memberProgressFilter) {
      nextChannel = nextChannel.on(
        'postgres_changes',
        {
          event: '*',
          filter: memberProgressFilter,
          schema: 'public',
          table: 'user_game_mode_progress',
        },
        (payload) => {
          if (payload.eventType === 'DELETE') return;
          const data = payload.new as Record<string, unknown>;
          const userId = typeof data.user_id === 'string' ? data.user_id : null;
          const mode = data.game_mode;
          const expectedSeason = mode === GAME_MODES.SEASONAL ? ACTIVE_SEASON_NUMBER : 0;
          const existingProfile = userId ? teamStore.memberProfiles?.[userId] : undefined;
          if (
            !userId ||
            userId === $supabase.user?.id ||
            !isGameMode(mode) ||
            data.season_number !== expectedSeason ||
            !teamStore.members?.includes(userId) ||
            (existingProfile?.gameMode && existingProfile.gameMode !== mode) ||
            !hasMaterializedProgress(data.progress_data) ||
            typeof window === 'undefined'
          ) {
            return;
          }
          const summary = summarizeModeProgressData(data.progress_data);
          teamStore.$patch((state) => {
            state.memberProfiles = {
              ...state.memberProfiles,
              [userId]: {
                displayName: summary.display_name,
                gameEdition: existingProfile?.gameEdition ?? 1,
                gameMode: mode,
                level: summary.level,
                tasksCompleted: summary.tasks_completed,
              },
            };
          });
          window.dispatchEvent(new CustomEvent('teammate-mode-progress', { detail: data }));
        }
      );
    }
    teamChannel.value = nextChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void refreshMembers();
      }
    });
  };
  const refreshMembershipSubscription = async (): Promise<void> => {
    const requestVersion = ++membershipSubscriptionVersion;
    cleanupMembership();
    await refreshMembers(true);
    if (requestVersion !== membershipSubscriptionVersion) return;
    setupMembershipSubscription();
  };
  // Setup Supabase listener with custom onData handler
  // NOTE: Don't pass the store - we handle patching manually to preserve mapped fields
  const listenerState = listenerScope.run(() =>
    useSupabaseListener({
      store: teamStore,
      table: 'teams',
      filter: teamFilter,
      storeId: 'team',
      onData: handleTeamData,
      scope: listenerScope,
    })
  );
  if (!listenerState) throw new Error('Failed to create team realtime listener');
  const { cleanup: teamListenerCleanup, isSubscribed } = listenerState;
  listenerScope.run(() => {
    watch(
      teamFilter,
      () => {
        void refreshMembershipSubscription();
      },
      { immediate: true }
    );
  });
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
  listenerScope.run(() => {
    watch(
      () => localProgressSnapshot.value,
      (snapshot) => {
        const currentTeamId = getTeamIdFromSystemStore(systemStore);
        if (!currentTeamId || !$supabase.user?.id) {
          return;
        }
        const existingProfile = teamStore.memberProfiles?.[$supabase.user.id as string];
        const profileMatches =
          existingProfile &&
          existingProfile.displayName === snapshot.displayName &&
          existingProfile.level === snapshot.level &&
          existingProfile.tasksCompleted === snapshot.tasksCompleted &&
          existingProfile.gameMode === snapshot.mode;
        if (profileMatches) {
          return;
        }
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
  });
  // Watch for filter changes handled by useSupabaseListener
  const instance: TeamStoreInstance = {
    teamStore,
    isSubscribed,
    cleanup: () => {
      membershipSubscriptionVersion += 1;
      teamListenerCleanup();
      cleanupMembership();
      listenerScope.stop();
      if (teamStoreInstance === instance) teamStoreInstance = null;
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
      let hydrationActive = true;
      const isHydrationActive = () =>
        hydrationActive && teammateStores.value[teammateId] === storeInstance;
      const memberProfile = teamStore.memberProfiles?.[teammateId];
      storeInstance.$patch((state) => {
        Object.assign(state, resolveTeammateIdentity(memberProfile, getCurrentGameMode()));
      });
      const appliedModes = new Set<GameMode>();
      const applyProgressData = (mode: GameMode, progress: unknown, authoritative = false) => {
        if (!isHydrationActive()) return;
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
          if (!isHydrationActive()) return;
          if (modeRows.error) {
            logTeammateModeProgressHydrationFailure(modeRows.error, teammateId);
            return;
          }
          modeRows.data?.forEach((row) => {
            if (!isHydrationActive()) return;
            if (isGameMode(row.game_mode) && appliedModes.has(row.game_mode)) return;
            applyModeProgress(row as Record<string, unknown>);
          });
          if (!isHydrationActive()) return;
          applyLegacyPersistentProgressResult(
            legacyRow,
            appliedModes,
            teammateId,
            legacyMode,
            applyProgressData
          );
          if (!isHydrationActive()) return;
          replayProgressMetadataMigration();
        } catch (error) {
          logTeammateModeProgressHydrationFailure(error, teammateId);
        }
      };
      const handleModeProgress = (event: Event) => {
        const data = (event as CustomEvent<Record<string, unknown>>).detail;
        if (data?.user_id !== teammateId) return;
        applyModeProgress(data, true);
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('teammate-mode-progress', handleModeProgress);
      }
      teammateUnsubscribes.value[teammateId] = () => {
        hydrationActive = false;
        if (typeof window !== 'undefined') {
          window.removeEventListener('teammate-mode-progress', handleModeProgress);
        }
      };
      void hydrateModeProgress();
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
