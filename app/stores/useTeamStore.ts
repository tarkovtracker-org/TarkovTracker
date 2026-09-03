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
import {
  createChannelReleaseLatch,
  logChannelSubscribeFailure,
  removeOwnedChannel,
  type OwnedRealtimeChannel,
  type SupabaseRealtimeChannel,
} from '@/utils/realtimeChannel';
import type { MemberProfile, TeamGetters, TeamState } from '@/types/tarkov';
import type { SupabaseClient } from '@supabase/supabase-js';
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
/**
 * Consecutive non-subscribed statuses tolerated before the built-in rejoin loop
 * is stopped. Realtime backs off to one rejoin every 10s and never gives up,
 * which would hammer the server indefinitely if the private-channel
 * authorization policy rejects the join.
 */
const MAX_CHANNEL_ERRORS = 5;
/** Delay before a single recovery attempt after the rejoin loop is stopped. */
const CHANNEL_RETRY_DELAY_MS = 60_000;
/** A teammate we currently track, and never the viewer's own row. */
const isTrackedTeammate = (
  members: string[] | undefined,
  viewerId: string | null | undefined,
  userId: string | null
): userId is string => userId !== null && userId !== viewerId && members?.includes(userId) === true;
/** Rejects events for a mode/season pair that is not the active one. */
const isActiveSeasonProgressEvent = (data: Record<string, unknown>): boolean => {
  const mode = data.game_mode;
  if (!isGameMode(mode)) return false;
  const expectedSeason = mode === GAME_MODES.SEASONAL ? ACTIVE_SEASON_NUMBER : 0;
  return data.season_number === expectedSeason;
};
/**
 * Keeps a profile pinned to the mode it was resolved for.
 *
 * A teammate is displayed in one game mode at a time, so an event for the other
 * mode must not overwrite the mode currently shown.
 */
const teammateProfileAcceptsMode = (profile: MemberProfile | undefined, mode: GameMode): boolean =>
  !profile?.gameMode || profile.gameMode === mode;
const teammateProgressEventApplies = (
  teamStore: ReturnType<typeof useTeamStore>,
  viewerId: string | null | undefined,
  data: Record<string, unknown>,
  userId: string | null
): userId is string => {
  if (!isTrackedTeammate(teamStore.members, viewerId, userId)) return false;
  if (!isActiveSeasonProgressEvent(data)) return false;
  return hasMaterializedProgress(data.progress_data);
};
/**
 * Applies a teammate's normalized progress event to the shared team profiles.
 *
 * Extracted from the channel binding so the filtering rules stay testable and
 * the store factory stays within its size budget.
 */
/** No-op outside the browser: the app is SPA-only but stores are unit-tested in isolation. */
const dispatchTeammateProgressEvent = (data: Record<string, unknown>): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('teammate-mode-progress', { detail: data }));
};
const readMemberProfile = (
  teamStore: ReturnType<typeof useTeamStore>,
  userId: string
): MemberProfile | undefined => teamStore.memberProfiles?.[userId];
export const applyTeammateProgressEvent = (
  teamStore: ReturnType<typeof useTeamStore>,
  viewerId: string | null | undefined,
  data: Record<string, unknown>
): void => {
  const userId = typeof data.user_id === 'string' ? data.user_id : null;
  if (!teammateProgressEventApplies(teamStore, viewerId, data, userId)) return;
  const mode = data.game_mode as GameMode;
  const existingProfile = readMemberProfile(teamStore, userId);
  if (!teammateProfileAcceptsMode(existingProfile, mode)) return;
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
  dispatchTeammateProgressEvent(data);
};
export type TeamChannelDeps = {
  /** Resolved per call: the plugin replaces the client during initialization. */
  getClient: () => SupabaseClient;
  getTeamId: () => string | null;
  getMembers: () => string[] | undefined;
  applyProgress: (data: Record<string, unknown>) => void;
  refreshMembers: (force?: boolean) => Promise<void>;
};
export type TeamChannelController = {
  /** Leaves the channel and waits for the leave to settle. */
  cleanup: () => Promise<void>;
  /** Refreshes members, then rebuilds the channel only if its bindings changed. */
  refresh: () => Promise<void>;
  /** Permanently stops the controller: no further setup or retry can run. */
  dispose: () => Promise<void>;
};
/**
 * Owns the lifetime of the single private `team:<id>` Realtime channel.
 *
 * Kept outside the store factory so the channel state machine is isolated from
 * store concerns and can be reasoned about on its own.
 */
export const createTeamChannelController = (deps: TeamChannelDeps): TeamChannelController => {
  // `shallowRef`: a Realtime channel owns a socket, timers, and internal state
  // that must not be wrapped in a deep reactive proxy. It also keeps the
  // identity check in `handleStatus` meaningful.
  const channel = shallowRef<OwnedRealtimeChannel | null>(null);
  let version = 0;
  /** Team/filter of the channel that reported `SUBSCRIBED`, not merely created. */
  let joinedTeamId: string | null = null;
  let joinedFilter: string | undefined;
  let errorCount = 0;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;
  const release = createChannelReleaseLatch();
  let disposed = false;
  const clearRetry = () => {
    if (retryTimeout === null) return;
    clearTimeout(retryTimeout);
    retryTimeout = null;
  };
  const cleanup = async (): Promise<void> => {
    clearRetry();
    const owned = channel.value;
    channel.value = null;
    joinedTeamId = null;
    joinedFilter = undefined;
    errorCount = 0;
    if (!owned) return;
    release.hold(owned, removeOwnedChannel(owned, 'TeamStore'));
    await release.release(owned.topic);
  };
  const scheduleRecovery = () => {
    const retryVersion = ++version;
    void cleanup().then(() => {
      if (disposed || retryVersion !== version) return;
      retryTimeout = setTimeout(() => {
        retryTimeout = null;
        if (disposed || retryVersion !== version) return;
        void refresh();
      }, CHANNEL_RETRY_DELAY_MS);
    });
  };
  const recordStatusFailure = (status: string, error?: Error) => {
    const failed = logChannelSubscribeFailure('TeamStore', status, error, {
      attempts: errorCount + 1,
      teamId: joinedTeamId,
    });
    if (!failed) return;
    errorCount += 1;
    if (errorCount < MAX_CHANNEL_ERRORS) return;
    scheduleRecovery();
  };
  /**
   * Reacts to every subscribe status rather than only `SUBSCRIBED`.
   *
   * The channel is private, so a rejected `realtime.messages` authorization
   * check surfaces here as `CHANNEL_ERROR`. Without this the failure is
   * invisible while Realtime rejoins forever. The binding is recorded as joined
   * only here, so a join that silently no-ops is never mistaken for a live one.
   */
  const handleStatus = (
    owned: OwnedRealtimeChannel,
    teamId: string,
    filter: string | undefined,
    status: string,
    error?: Error
  ) => {
    if (channel.value !== owned) return;
    if (status === 'SUBSCRIBED') {
      joinedTeamId = teamId;
      joinedFilter = filter;
      errorCount = 0;
      void deps.refreshMembers();
      return;
    }
    // A closed channel is no longer joined, so drop the binding to let the next
    // membership event rebuild it.
    joinedTeamId = null;
    joinedFilter = undefined;
    recordStatusFailure(status, error);
  };
  const bindProgress = (source: SupabaseRealtimeChannel, filter: string): SupabaseRealtimeChannel =>
    source.on(
      'postgres_changes',
      { event: '*', filter, schema: 'public', table: 'user_game_mode_progress' },
      (payload) => {
        if (payload.eventType === 'DELETE') return;
        deps.applyProgress(payload.new as Record<string, unknown>);
      }
    );
  const teamTopic = (teamId: string) => `team:${teamId}`;
  const buildChannel = (teamId: string, progressFilter: string | undefined) => {
    const client = deps.getClient();
    const topic = teamTopic(teamId);
    let next = client.channel(topic, { config: { private: true } }).on(
      'postgres_changes',
      {
        event: '*',
        filter: `team_id=eq.${teamId}`,
        schema: 'public',
        table: 'team_memberships',
      },
      () => void refresh()
    );
    if (progressFilter) next = bindProgress(next, progressFilter);
    const owned: OwnedRealtimeChannel = { channel: next, client, topic };
    channel.value = owned;
    next.subscribe((status, error) => handleStatus(owned, teamId, progressFilter, status, error));
  };
  const canBuild = (setupVersion: number): boolean => !disposed && setupVersion === version;
  const setup = async (setupVersion: number): Promise<void> => {
    const teamId = deps.getTeamId();
    await cleanup();
    if (!teamId) return;
    // `removeChannel` only tears the channel down on an `ok` leave, so an
    // unclean leave keeps `team:<id>` occupied and any rejoin would never join.
    // The latch is shared, so an overlapping setup waits on the same leave.
    if (!(await release.release(teamTopic(teamId)))) return;
    if (!canBuild(setupVersion)) return;
    buildChannel(teamId, buildMemberProgressFilter(deps.getMembers()));
  };
  const isCurrentBinding = (teamId: string): boolean =>
    channel.value !== null &&
    joinedTeamId === teamId &&
    joinedFilter === buildMemberProgressFilter(deps.getMembers());
  /** Resolves the team to rebind to, tearing the channel down when there is none. */
  const resolveTargetTeam = async (): Promise<string | null> => {
    const teamId = deps.getTeamId();
    if (teamId) return teamId;
    await cleanup();
    return null;
  };
  /**
   * Membership events fire on every member's client. Rejoining a channel that
   * already carries the right bindings would churn Realtime connections for no
   * benefit, so only rebuild when the topic or progress filter changed.
   */
  const needsRebuild = (teamId: string | null): boolean =>
    teamId !== null && !isCurrentBinding(teamId);
  const isStale = (requestVersion: number): boolean => disposed || requestVersion !== version;
  const shouldContinue = async (requestVersion: number): Promise<boolean> =>
    !isStale(requestVersion) && (await resolveTargetTeam()) !== null;
  const refresh = async (): Promise<void> => {
    const requestVersion = ++version;
    if (!(await shouldContinue(requestVersion))) return;
    await deps.refreshMembers(true);
    if (!(await shouldContinue(requestVersion))) return;
    if (!needsRebuild(deps.getTeamId())) return;
    await setup(requestVersion);
  };
  return {
    cleanup,
    dispose: () => {
      disposed = true;
      version += 1;
      clearRetry();
      return cleanup();
    },
    refresh,
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
      await teamChannel.cleanup();
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
  const teamChannel = createTeamChannelController({
    applyProgress: (data) => applyTeammateProgressEvent(teamStore, $supabase.user?.id, data),
    getClient: () => $supabase.client,
    getMembers: () => teamStore.members,
    getTeamId: () => getTeamIdFromSystemStore(systemStore),
    refreshMembers,
  });
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
        void teamChannel.refresh();
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
      teamListenerCleanup();
      void teamChannel.dispose();
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
      const applyModeProgressRows = (rows: Array<Record<string, unknown>> | null | undefined) => {
        rows?.forEach((row) => {
          if (!isHydrationActive()) return;
          if (isGameMode(row.game_mode) && appliedModes.has(row.game_mode)) return;
          applyModeProgress(row);
        });
      };
      const legacyMode = resolveTeammateLegacyMode(memberProfile, getCurrentGameMode());
      const applyLegacyModeProgress = (legacyRow: { data: unknown; error: unknown }) => {
        if (!isHydrationActive()) return;
        applyLegacyPersistentProgressResult(
          legacyRow,
          appliedModes,
          teammateId,
          legacyMode,
          applyProgressData
        );
      };
      const replayHydratedProgressMetadata = () => {
        if (!isHydrationActive()) return;
        replayProgressMetadataMigration();
      };
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
          applyModeProgressRows(modeRows.data);
          applyLegacyModeProgress(legacyRow);
          replayHydratedProgressMetadata();
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
  // The only consumer (`useProgressStore`) destructures `teammateStores` alone,
  // so bind teardown to the owning scope instead of relying on a caller to run
  // it; otherwise the `teammate-mode-progress` listeners outlive the store.
  onScopeDispose(cleanup);
  return {
    teammateStores,
    teammateUnsubscribes,
    cleanup,
  };
}
