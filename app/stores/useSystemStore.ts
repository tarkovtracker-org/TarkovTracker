import { defineStore, type Store } from 'pinia';
import { computed, type Ref } from 'vue';
import { useSupabaseListener } from '@/composables/supabase/useSupabaseListener';
import type { SystemGetters, SystemState } from '@/types/tarkov';
import { GAME_MODES } from '@/utils/constants';
import type { PostgrestError } from '@supabase/supabase-js';
// Import useTarkovStore lazily to avoid circular dependency issues
let _useTarkovStore: (() => { getCurrentGameMode?: () => string }) | null = null;
async function loadTarkovStore() {
  if (!_useTarkovStore) {
    const module = await import('@/stores/useTarkov');
    _useTarkovStore = module.useTarkovStore;
  }
  return _useTarkovStore;
}
/**
 * Helper to get the current game mode from tarkov store.
 * Returns 'pvp' if not available.
 * Note: This is synchronous but uses cached import to avoid circular deps.
 */
function getCurrentGameMode(): 'pvp' | 'pve' {
  try {
    if (_useTarkovStore) {
      const tarkovStore = _useTarkovStore();
      return (tarkovStore.getCurrentGameMode?.() as 'pvp' | 'pve') || GAME_MODES.PVP;
    }
    // Trigger async load for next call
    loadTarkovStore().catch(() => {});
    return GAME_MODES.PVP;
  } catch {
    return GAME_MODES.PVP;
  }
}
/**
 * Helper to extract team ID from system store state.
 * Now handles game-mode-specific team IDs (pvp_team_id, pve_team_id).
 * Falls back to legacy team/team_id for backwards compatibility.
 */
export function getTeamIdFromState(state: SystemState, gameMode?: 'pvp' | 'pve'): string | null {
  const mode = gameMode || getCurrentGameMode();
  if (mode === 'pve') {
    return state.pve_team_id ?? state.team ?? state.team_id ?? null;
  }
  return state.pvp_team_id ?? state.team ?? state.team_id ?? null;
}
/**
 * Helper to check if user has a team from system store state for the current game mode.
 */
export function hasTeamInState(state: SystemState, gameMode?: 'pvp' | 'pve'): boolean {
  return !!getTeamIdFromState(state, gameMode);
}
/**
 * System store definition with getters for user tokens and team info
 */
export const useSystemStore = defineStore<string, SystemState, SystemGetters>('system', {
  state: (): SystemState => ({
    user_id: null,
    tokens: [],
    team: null,
    team_id: null,
    pvp_team_id: null,
    pve_team_id: null,
    is_admin: false,
  }),
  getters: {
    userTokens(state) {
      return state?.tokens || [];
    },
    userTokenCount(state) {
      return state?.tokens?.length || 0;
    },
    userTeam(state): string | null {
      return getTeamIdFromState(state);
    },
    userTeamIsOwn(state) {
      const { $supabase } = useNuxtApp();
      const teamId = getTeamIdFromState(state);
      return teamId === $supabase.user?.id;
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
      // Handle game-mode-specific team IDs
      const pvpTeamId = (data as { pvp_team_id?: string | null }).pvp_team_id ?? null;
      const pveTeamId = (data as { pve_team_id?: string | null }).pve_team_id ?? null;
      // Legacy team_id field for backwards compatibility
      const legacyTeamId = (data as { team_id?: string | null }).team_id ?? null;
      // Admin status (server-validated, client cannot modify - see SECURITY NOTE above)
      const isAdmin = (data as { is_admin?: boolean }).is_admin ?? false;
      systemStore.$patch({
        user_id: userId,
        pvp_team_id: pvpTeamId,
        pve_team_id: pveTeamId,
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
        team: null,
        team_id: null,
        is_admin: false,
      } as Partial<SystemState>);
    }
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
    cleanup,
    getTeamId,
    hasTeam,
  };
  systemStoreInstance = instance;
  return instance;
}
