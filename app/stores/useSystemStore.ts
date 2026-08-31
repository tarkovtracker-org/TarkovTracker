import { defineStore, type Store } from 'pinia';
import { useSupabaseListener } from '@/composables/supabase/useSupabaseListener';
import { getCurrentGameMode } from '@/stores/utils/gameMode';
import { collectTeamMembershipIds } from '@/utils/teamMemberships';
import type { SystemGetters, SystemState } from '@/types/tarkov';
import type { GameMode } from '@/utils/constants';
import type { PostgrestError, RealtimeChannel } from '@supabase/supabase-js';
/**
 * Helper to extract team ID from system store state.
 * Now handles game-mode-specific team IDs (pvp_team_id, pve_team_id).
 * Falls back to legacy team/team_id for backwards compatibility.
 */
const getLegacyTeamId = (state: SystemState): string | null =>
  [state.team, state.team_id].find((teamId) => typeof teamId === 'string' && teamId.length > 0) ??
  null;
export function getTeamIdFromState(state: SystemState, gameMode?: GameMode): string | null {
  const mode = gameMode || getCurrentGameMode();
  const modeSpecificTeamId = state[getTeamIdStateKey(mode)];
  if (modeSpecificTeamId) return modeSpecificTeamId;
  if (mode === 'seasonal') return null;
  if ([state.pvp_team_id, state.pve_team_id].some(Boolean)) return null;
  return getLegacyTeamId(state);
}
export function getTeamIdStateKey(
  gameMode: GameMode
): 'pve_team_id' | 'pvp_team_id' | 'seasonal_team_id' {
  if (gameMode === 'seasonal') return 'seasonal_team_id';
  if (gameMode === 'pve') return 'pve_team_id';
  return 'pvp_team_id';
}
/**
 * Helper to check if user has a team from system store state for the current game mode.
 */
export function hasTeamInState(state: SystemState, gameMode?: GameMode): boolean {
  return !!getTeamIdFromState(state, gameMode);
}
/**
 * System store definition with getters for user tokens and team info
 */
export const useSystemStore = defineStore<string, SystemState, SystemGetters>('system', {
  state: (): SystemState => ({
    // fallow-ignore-next-line unused-store-member -- state hydrated/accessed via Supabase $state and middleware
    user_id: null,
    // fallow-ignore-next-line unused-store-member -- state hydrated/accessed via Supabase $state and middleware
    team: null,
    // fallow-ignore-next-line unused-store-member -- state hydrated/accessed via Supabase $state and middleware
    team_id: null,
    // fallow-ignore-next-line unused-store-member -- state hydrated/accessed via Supabase $state and middleware
    pvp_team_id: null,
    // fallow-ignore-next-line unused-store-member -- state hydrated/accessed via Supabase $state and middleware
    pve_team_id: null,
    // fallow-ignore-next-line unused-store-member -- state hydrated/accessed via membership queries and $state
    seasonal_team_id: null,
    // fallow-ignore-next-line unused-store-member -- state hydrated/accessed via Supabase $state and middleware
    is_admin: false,
  }),
  getters: {
    // fallow-ignore-next-line unused-store-member -- state hydrated/accessed via Supabase $state and middleware
    userTeam(state): string | null {
      return getTeamIdFromState(state);
    },
    isAdmin(state): boolean {
      return state.is_admin === true;
    },
  },
});
// Type for the system store instance to avoid circular reference
interface SystemStoreInstance {
  systemStore: Store<string, SystemState, SystemGetters>;
  isSubscribed: Ref<boolean>;
  /** Whether initial data fetch has completed (true even if no data was found) */
  hasInitiallyLoaded: Ref<boolean>;
  /**
   * Error encountered during data fetch, if any.
   *
   * Common causes:
   * - Network failures (connection timeout, DNS resolution)
   * - Authentication issues (expired/invalid session, missing auth token)
   * - Permission/RLS policy denials (user lacks access to requested rows)
   * - Malformed queries (invalid filter syntax, unsupported operators)
   * - Server-side errors (database constraints, function failures)
   *
   * Value is null when no error occurred, PostgrestError otherwise.
   *
   * Handling:
   * - Inspect error.status (HTTP status code), error.message, error.code
   * - Show user-friendly messages for expected errors (401, 403)
   * - Implement retry logic for transient errors (network, timeouts)
   * - Escalate authentication/permission issues to login flow
   * - Log unexpected errors for debugging
   */
  loadError: Ref<PostgrestError | null>;
  cleanup: () => void;
  /** Get the current team ID (handles both team and team_id fields) */
  getTeamId: () => string | null;
  /** Check if user has a team */
  hasTeam: () => boolean;
}
// Singleton instance to prevent multiple listener setups
let systemStoreInstance: SystemStoreInstance | null = null;
export function useSystemStoreWithSupabase(): SystemStoreInstance {
  // Return cached instance if it exists
  if (systemStoreInstance) {
    return systemStoreInstance;
  }
  const systemStore = useSystemStore();
  const { $supabase } = useNuxtApp();
  const membershipChannel = ref<RealtimeChannel | null>(null);
  let membershipRequestId = 0;
  let membershipSessionId = 0;
  const getAuthenticatedUserId = (): string | null =>
    $supabase.user?.loggedIn ? ($supabase.user.id ?? null) : null;
  const isCurrentMembershipSession = (sessionId: number, userId?: string) =>
    sessionId === membershipSessionId &&
    (userId === undefined || getAuthenticatedUserId() === userId);
  /**
   * Handles system data snapshots from Supabase.
   *
   * SECURITY NOTE - Admin Flag Enforcement:
   * The is_admin field is protected by multiple layers of server-side security:
   *
   * 1. Row Level Security (RLS):
   *    - Users can only SELECT their own user_system row (WHERE auth.uid() = user_id)
   *    - Migration: 20251128093000_create_user_system_table.sql
   *
   * 2. Column-Level Permissions:
   *    - INSERT (is_admin) and UPDATE (is_admin) are REVOKED from anon, authenticated roles
   *    - Migration: 20251225140000_lock_down_user_system_admin.sql
   *
   * 3. Trigger-Based Protection:
   *    - prevent_user_system_admin_mutation() trigger blocks any client attempt to set/change is_admin
   *    - Only service_role or direct SQL (no JWT) can modify this field
   *    - Raises exception if non-privileged user attempts modification
   *    - Migration: 20251225140000_lock_down_user_system_admin.sql
   *
   * Client-side checks (isAdmin getter) are for UX only. All admin-only actions MUST be
   * protected server-side via RLS policies, edge function authorization, or service-role-only operations.
   */
  const handleSystemSnapshot = (data: Record<string, unknown> | null) => {
    if (data) {
      // User ID from the user_system row
      const userId = (data as { user_id?: string | null }).user_id ?? null;
      if (!userId || userId !== getAuthenticatedUserId()) return;
      // Handle game-mode-specific team IDs
      const pvpTeamId = (data as { pvp_team_id?: string | null }).pvp_team_id ?? null;
      const pveTeamId = (data as { pve_team_id?: string | null }).pve_team_id ?? null;
      const seasonalTeamId =
        (data as { seasonal_team_id?: string | null }).seasonal_team_id ?? null;
      // Legacy team_id field for backwards compatibility
      const legacyTeamId = (data as { team_id?: string | null }).team_id ?? null;
      // Admin status (server-validated, client cannot modify - see SECURITY NOTE above)
      const isAdmin = (data as { is_admin?: boolean }).is_admin ?? false;
      systemStore.$patch({
        user_id: userId,
        pvp_team_id: pvpTeamId,
        pve_team_id: pveTeamId,
        seasonal_team_id: seasonalTeamId,
        // Keep legacy fields updated for backwards compatibility
        team: legacyTeamId || pvpTeamId,
        team_id: legacyTeamId || pvpTeamId,
        is_admin: isAdmin,
      } as Partial<SystemState>);
    } else {
      systemStore.$patch({
        user_id: null,
        pvp_team_id: null,
        pve_team_id: null,
        seasonal_team_id: null,
        team: null,
        team_id: null,
        is_admin: false,
      } as Partial<SystemState>);
    }
  };
  const refreshTeamMemberships = async (userId: string, sessionId: number) => {
    const requestId = ++membershipRequestId;
    const { data, error } = await $supabase.client
      .from('team_memberships')
      .select('team_id,game_mode')
      .eq('user_id', userId);
    if (requestId !== membershipRequestId || !isCurrentMembershipSession(sessionId, userId)) return;
    if (error) return;
    const teamIds = collectTeamMembershipIds(data);
    systemStore.$patch((state) => {
      state.pvp_team_id = teamIds.pvp ?? null;
      state.pve_team_id = teamIds.pve ?? null;
      state.seasonal_team_id = teamIds.seasonal ?? null;
    });
  };
  // Computed reference to the system document - passed as ref for reactivity
  const systemFilter = computed(() => {
    return $supabase.user?.loggedIn && $supabase.user?.id
      ? `user_id=eq.${$supabase.user.id}`
      : undefined;
  });
  // Setup Supabase listener with reactive filter ref
  const { cleanup, isSubscribed, hasInitiallyLoaded, loadError } = useSupabaseListener({
    store: systemStore,
    table: 'user_system',
    filter: systemFilter,
    storeId: 'system',
    onData: handleSystemSnapshot,
  });
  const cleanupMembershipChannel = async () => {
    if (!membershipChannel.value) return;
    await $supabase.client.removeChannel(membershipChannel.value as unknown as RealtimeChannel);
    membershipChannel.value = null;
  };
  const setupMembershipChannel = async () => {
    const sessionId = ++membershipSessionId;
    await cleanupMembershipChannel();
    if (!isCurrentMembershipSession(sessionId)) return;
    const userId = getAuthenticatedUserId();
    if (!userId) return;
    await refreshTeamMemberships(userId, sessionId);
    if (!isCurrentMembershipSession(sessionId, userId)) return;
    membershipChannel.value = $supabase.client
      .channel(`system-team-memberships-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_memberships',
          filter: `user_id=eq.${userId}`,
        },
        () => void refreshTeamMemberships(userId, sessionId)
      )
      .subscribe();
  };
  const stopMembershipAuthWatch = watch(
    () => [$supabase.user?.loggedIn, $supabase.user?.id] as const,
    () => {
      systemStore.$patch({
        user_id: getAuthenticatedUserId(),
        pvp_team_id: null,
        pve_team_id: null,
        seasonal_team_id: null,
        team: null,
        team_id: null,
        is_admin: false,
      } as Partial<SystemState>);
      void setupMembershipChannel();
    },
    { immediate: true }
  );
  // Helper functions that provide properly typed access to team state
  const getTeamId = (): string | null => {
    // Pinia guarantees $state is always an object
    return getTeamIdFromState(systemStore.$state);
  };
  const hasTeam = (): boolean => {
    // Pinia guarantees $state is always an object
    return hasTeamInState(systemStore.$state);
  };
  // Cache the instance
  const instance: SystemStoreInstance = {
    systemStore,
    isSubscribed,
    hasInitiallyLoaded,
    loadError,
    cleanup: () => {
      membershipSessionId += 1;
      stopMembershipAuthWatch();
      cleanup();
      void cleanupMembershipChannel();
    },
    getTeamId,
    hasTeam,
  };
  systemStoreInstance = instance;
  return instance;
}
