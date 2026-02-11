import { useSupabaseSync } from '@/composables/supabase/useSupabaseSync';
import { usePreferencesStore, type PreferencesState } from '@/stores/usePreferences';
import { SKILL_SORT_MODES } from '@/utils/constants';
import { logger } from '@/utils/logger';
import { normalizeMapMarkerColors } from '@/utils/theme-colors';
import type { Pinia } from 'pinia';
const NEEDED_ITEMS_CARD_STYLES = ['compact', 'expanded'] as const;
const NEEDED_ITEMS_SORT_DIRECTIONS = ['asc', 'desc'] as const;
const NEEDED_ITEMS_SORT_FIELDS = ['priority', 'name', 'category', 'count'] as const;
function normalizeEnum<T>(value: T, allowed: readonly T[]): T | null {
  return value && allowed.includes(value) ? value : null;
}
let stopUserWatch: (() => void) | null = null;
let preferencesSyncController: ReturnType<typeof useSupabaseSync> | null = null;
type SupabasePreferencesClient = {
  from: (table: string) => {
    select: (query: string) => {
      eq: (
        column: string,
        value: string
      ) => {
        maybeSingle: () => Promise<{ data: unknown; error: { code?: string } | null }>;
      };
    };
  };
};
type SupabasePreferencesApi = {
  client: SupabasePreferencesClient;
  user: {
    loggedIn: boolean;
    id: string | null;
  };
};
const stopPreferencesSync = () => {
  if (!preferencesSyncController) return;
  preferencesSyncController.cleanup();
  preferencesSyncController = null;
};
const startPreferencesSync = (
  preferencesStore: ReturnType<typeof usePreferencesStore>,
  userId: string
) => {
  preferencesSyncController = useSupabaseSync({
    store: preferencesStore,
    table: 'user_preferences',
    debounceMs: 500,
    transform: (state: unknown) => {
      const preferencesState = state as PreferencesState;
      return buildPreferencesSyncPayload(preferencesState, userId);
    },
  });
};
const applyPreferencesRow = (
  preferencesStore: ReturnType<typeof usePreferencesStore>,
  row: Record<string, unknown>
) => {
  const requiredKeysValue = row.only_tasks_with_required_keys;
  const suggestedKeysValue = row.only_tasks_with_suggested_keys;
  const shouldPreferRequiredKeys = typeof requiredKeysValue === 'boolean';
  for (const [key, value] of Object.entries(row)) {
    if (key === 'user_id' || key === 'created_at' || key === 'updated_at') continue;
    if (key === 'only_tasks_with_suggested_keys' && shouldPreferRequiredKeys) continue;
    if (
      key === 'only_tasks_with_required_keys' &&
      typeof value !== 'boolean' &&
      typeof suggestedKeysValue === 'boolean'
    ) {
      continue;
    }
    const normalizedKey =
      key === 'only_tasks_with_suggested_keys' ? 'only_tasks_with_required_keys' : key;
    const camelKey = normalizedKey.replace(/_([a-z])/g, (_, letter: string) =>
      letter.toUpperCase()
    );
    if (camelKey in preferencesStore.$state) {
      (preferencesStore.$state as unknown as Record<string, unknown>)[camelKey] = value;
    }
  }
};
const buildPreferencesSyncPayload = (
  preferencesState: PreferencesState,
  userId: string
): Record<string, unknown> => {
  return {
    user_id: userId,
    streamer_mode: preferencesState.streamerMode,
    team_hide: preferencesState.teamHide,
    task_team_hide_all: preferencesState.taskTeamHideAll,
    items_team_hide_all: preferencesState.itemsTeamHideAll,
    items_team_hide_non_fir: preferencesState.itemsTeamHideNonFIR,
    items_team_hide_hideout: preferencesState.itemsTeamHideHideout,
    map_team_hide_all: preferencesState.mapTeamHideAll,
    task_primary_view: preferencesState.taskPrimaryView,
    task_map_view: preferencesState.taskMapView,
    task_trader_view: preferencesState.taskTraderView,
    task_secondary_view: preferencesState.taskSecondaryView,
    task_user_view: preferencesState.taskUserView,
    task_sort_mode: preferencesState.taskSortMode,
    task_sort_direction: preferencesState.taskSortDirection,
    task_shared_by_all_only: preferencesState.taskSharedByAllOnly,
    needed_type_view: preferencesState.neededTypeView,
    needed_items_view_mode: preferencesState.neededItemsViewMode,
    needed_items_fir_filter: preferencesState.neededItemsFirFilter,
    needed_items_group_by_item: preferencesState.neededItemsGroupByItem,
    needed_items_hide_non_fir_special_equipment:
      preferencesState.neededItemsHideNonFirSpecialEquipment,
    needed_items_kappa_only: preferencesState.neededItemsKappaOnly,
    items_hide_non_fir: preferencesState.itemsHideNonFIR,
    hide_global_tasks: preferencesState.hideGlobalTasks,
    hide_non_kappa_tasks: preferencesState.hideNonKappaTasks,
    hide_completed_map_objectives: preferencesState.hideCompletedMapObjectives,
    show_non_special_tasks: preferencesState.showNonSpecialTasks,
    show_lightkeeper_tasks: preferencesState.showLightkeeperTasks,
    only_tasks_with_required_keys: Boolean(preferencesState.onlyTasksWithRequiredKeys),
    respect_task_filters_for_impact: preferencesState.respectTaskFiltersForImpact,
    show_required_labels: preferencesState.showRequiredLabels,
    show_experience_rewards: preferencesState.showExperienceRewards,
    show_next_quests: preferencesState.showNextQuests,
    show_previous_quests: preferencesState.showPreviousQuests,
    task_card_density: preferencesState.taskCardDensity,
    dashboard_notice_dismissed: preferencesState.dashboardNoticeDismissed,
    show_map_extracts: preferencesState.showMapExtracts,
    map_marker_colors: normalizeMapMarkerColors(preferencesState.mapMarkerColors),
    neededitems_style: preferencesState.neededitemsStyle,
    hideout_primary_view: preferencesState.hideoutPrimaryView,
    hideout_collapse_completed: preferencesState.hideoutCollapseCompleted,
    hideout_sort_ready_first: preferencesState.hideoutSortReadyFirst,
    hideout_require_station_levels: preferencesState.hideoutRequireStationLevels,
    hideout_require_skill_levels: preferencesState.hideoutRequireSkillLevels,
    hideout_require_trader_loyalty: preferencesState.hideoutRequireTraderLoyalty,
    locale_override: preferencesState.localeOverride,
    enable_manual_task_fail: preferencesState.enableManualTaskFail,
    hide_completed_task_objectives: preferencesState.hideCompletedTaskObjectives,
    show_all_filter: preferencesState.showAllFilter,
    show_available_filter: preferencesState.showAvailableFilter,
    show_locked_filter: preferencesState.showLockedFilter,
    show_completed_filter: preferencesState.showCompletedFilter,
    show_failed_filter: preferencesState.showFailedFilter,
    use_automatic_level_calculation: preferencesState.useAutomaticLevelCalculation,
    needed_items_sort_by: normalizeEnum(
      preferencesState.neededItemsSortBy,
      NEEDED_ITEMS_SORT_FIELDS
    ),
    needed_items_sort_direction: normalizeEnum(
      preferencesState.neededItemsSortDirection,
      NEEDED_ITEMS_SORT_DIRECTIONS
    ),
    needed_items_hide_owned: preferencesState.neededItemsHideOwned,
    needed_items_card_style: normalizeEnum(
      preferencesState.neededItemsCardStyle,
      NEEDED_ITEMS_CARD_STYLES
    ),
    map_zoom_speed: preferencesState.mapZoomSpeed,
    map_pan_speed: preferencesState.mapPanSpeed,
    pinned_task_ids: Array.isArray(preferencesState.pinnedTaskIds)
      ? preferencesState.pinnedTaskIds.filter(
          (taskId): taskId is string => typeof taskId === 'string' && taskId.length > 0
        )
      : [],
    task_filter_presets: Array.isArray(preferencesState.taskFilterPresets)
      ? preferencesState.taskFilterPresets
      : [],
    skill_sort_mode: normalizeEnum(preferencesState.skillSortMode, SKILL_SORT_MODES),
  };
};
export default defineNuxtPlugin((nuxtApp) => {
  if (import.meta.env.MODE === 'test') return;
  const pinia = nuxtApp.$pinia as Pinia | undefined;
  const $supabase = (nuxtApp as unknown as { $supabase?: SupabasePreferencesApi }).$supabase;
  if (!pinia || !$supabase) {
    logger.warn('[PreferencesSyncPlugin] Missing pinia or supabase context');
    return;
  }
  const preferencesStore = usePreferencesStore(pinia);
  if (stopUserWatch) {
    stopUserWatch();
    stopUserWatch = null;
  }
  stopPreferencesSync();
  stopUserWatch = watch(
    () => [$supabase.user.loggedIn, $supabase.user.id] as const,
    async ([loggedIn, userId]) => {
      try {
        stopPreferencesSync();
        if (!loggedIn || !userId) return;
        const { data, error } = await $supabase.client
          .from('user_preferences')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        if (error && error.code !== 'PGRST116') {
          logger.error('[PreferencesSyncPlugin] Error loading preferences from Supabase:', error);
        } else if (data) {
          logger.debug('[PreferencesSyncPlugin] Loading preferences from Supabase:', data);
          applyPreferencesRow(preferencesStore, data as Record<string, unknown>);
        }
      } catch (error) {
        logger.error('[PreferencesSyncPlugin] Failed to initialize preferences sync:', error);
      }
      if (!$supabase.user.loggedIn || !userId || $supabase.user.id !== userId) return;
      startPreferencesSync(preferencesStore, userId);
    },
    { immediate: true }
  );
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      if (stopUserWatch) {
        stopUserWatch();
        stopUserWatch = null;
      }
      stopPreferencesSync();
    });
  }
});
