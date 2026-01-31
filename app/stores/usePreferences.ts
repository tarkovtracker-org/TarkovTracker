import 'pinia-plugin-persistedstate';
import { defineStore } from 'pinia';
import { watch } from 'vue';
import { useSupabaseSync } from '@/composables/supabase/useSupabaseSync';
import type {
  NeededItemsFirFilter,
  NeededItemsFilterType,
} from '@/features/neededitems/neededitems-constants';
import { pinia as pluginPinia } from '@/plugins/01.pinia.client';
import type { TaskSortDirection, TaskSortMode } from '@/types/taskSort';
import { logger } from '@/utils/logger';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { useNuxtApp } from '#imports';
// Define the state structure
export interface PreferencesState {
  streamerMode: boolean;
  teamHide: Record<string, boolean>;
  taskTeamHideAll: boolean;
  itemsTeamHideAll: boolean;
  itemsTeamHideNonFIR: boolean;
  itemsTeamHideHideout: boolean;
  mapTeamHideAll: boolean;
  taskPrimaryView: string | null;
  taskMapView: string | null;
  taskTraderView: string | null;
  taskSecondaryView: string | null;
  taskUserView: string | null;
  taskSortMode: TaskSortMode | null;
  taskSortDirection: TaskSortDirection | null;
  taskSharedByAllOnly: boolean;
  neededTypeView: NeededItemsFilterType | null;
  neededItemsViewMode: 'list' | 'grid' | null;
  neededItemsFirFilter: NeededItemsFirFilter | null;
  neededItemsGroupByItem: boolean;
  neededItemsHideNonFirSpecialEquipment: boolean;
  neededItemsKappaOnly: boolean;
  itemsHideNonFIR: boolean;
  hideGlobalTasks: boolean;
  hideNonKappaTasks: boolean;
  neededitemsStyle: string | null;
  hideoutPrimaryView?: string | null;
  localeOverride: string | null;
  // Task filter settings
  showNonSpecialTasks: boolean;
  showLightkeeperTasks: boolean;
  // Task appearance settings
  showRequiredLabels: boolean;
  showNotRequiredLabels: boolean;
  showExperienceRewards: boolean;
  showTaskIds: boolean;
  showNextQuests: boolean;
  showPreviousQuests: boolean;
  taskCardDensity: 'comfortable' | 'compact';
  enableManualTaskFail: boolean;
  // XP and Level settings
  useAutomaticLevelCalculation: boolean;
  // Holiday effects
  enableHolidayEffects: boolean;
  // Map display settings
  showMapExtracts: boolean;
  mapZoomSpeed: number;
  saving?: {
    streamerMode: boolean;
    hideGlobalTasks: boolean;
    hideNonKappaTasks: boolean;
    itemsNeededHideNonFIR: boolean;
  };
}
// Export the default state with type annotation
export const preferencesDefaultState: PreferencesState = {
  streamerMode: false,
  teamHide: {},
  taskTeamHideAll: false,
  itemsTeamHideAll: false,
  itemsTeamHideNonFIR: false,
  itemsTeamHideHideout: false,
  mapTeamHideAll: false,
  taskPrimaryView: null,
  taskMapView: null,
  taskTraderView: null,
  taskSecondaryView: null,
  taskUserView: null,
  taskSortMode: null,
  taskSortDirection: null,
  taskSharedByAllOnly: false,
  neededTypeView: null,
  neededItemsViewMode: null,
  neededItemsFirFilter: null,
  neededItemsGroupByItem: false,
  neededItemsHideNonFirSpecialEquipment: false,
  neededItemsKappaOnly: false,
  itemsHideNonFIR: false,
  hideGlobalTasks: false,
  hideNonKappaTasks: false,
  neededitemsStyle: null,
  hideoutPrimaryView: null,
  localeOverride: null,
  // Task filter settings (all shown by default)
  showNonSpecialTasks: true,
  showLightkeeperTasks: true,
  // Task appearance settings
  showRequiredLabels: true,
  showNotRequiredLabels: true,
  showExperienceRewards: true,
  showTaskIds: true,
  showNextQuests: true,
  showPreviousQuests: true,
  taskCardDensity: 'compact',
  enableManualTaskFail: false,
  // XP and Level settings
  useAutomaticLevelCalculation: false,
  // Holiday effects (enabled by default during holiday season)
  enableHolidayEffects: true,
  // Map display settings
  showMapExtracts: true,
  mapZoomSpeed: 1,
  saving: {
    streamerMode: false,
    hideGlobalTasks: false,
    hideNonKappaTasks: false,
    itemsNeededHideNonFIR: false,
  },
};
// Per-toggle saving state (not persisted)
const initialSavingState = {
  streamerMode: false,
  hideGlobalTasks: false,
  hideNonKappaTasks: false,
  itemsNeededHideNonFIR: false,
};
export const usePreferencesStore = defineStore('preferences', {
  state: (): PreferencesState => {
    const state = JSON.parse(JSON.stringify(preferencesDefaultState));
    // Always reset saving state on store creation
    state.saving = { ...initialSavingState };
    return state;
  },
  getters: {
    getStreamerMode(state) {
      return state.streamerMode ?? false;
    },
    teamIsHidden: (state) => {
      return (teamId: string): boolean => {
        // Always show self unless explicitly hidden (though self shouldn't be hidden usually)
        // But definitely don't let "Hide All" hide self
        if (teamId === 'self') {
          return state.teamHide?.[teamId] || false;
        }
        const isHidden = state.taskTeamHideAll || state.teamHide?.[teamId] || false;
        if (isHidden) {
          logger.debug('[PreferencesStore] Teammate is hidden:', {
            teamId,
            taskTeamHideAll: state.taskTeamHideAll,
            individuallyHidden: state.teamHide?.[teamId],
          });
        }
        return isHidden;
      };
    },
    taskTeamAllHidden: (state) => {
      return state.taskTeamHideAll ?? false;
    },
    itemsTeamAllHidden: (state) => {
      return state.itemsTeamHideAll ?? false;
    },
    itemsTeamNonFIRHidden: (state) => {
      return state.itemsTeamHideAll || state.itemsTeamHideNonFIR || false;
    },
    itemsTeamHideoutHidden: (state) => {
      return state.itemsTeamHideAll || state.itemsTeamHideHideout || false;
    },
    mapTeamAllHidden: (state) => {
      return state.mapTeamHideAll ?? false;
    },
    // Add default values for views using nullish coalescing
    getTaskPrimaryView: (state) => {
      return state.taskPrimaryView ?? 'all';
    },
    getTaskMapView: (state) => {
      return state.taskMapView ?? 'all';
    },
    getTaskTraderView: (state) => {
      return state.taskTraderView ?? 'all';
    },
    getTaskSecondaryView: (state) => {
      return state.taskSecondaryView ?? 'available';
    },
    getTaskUserView: (state) => {
      return state.taskUserView ?? 'self';
    },
    getTaskSortMode: (state) => {
      return state.taskSortMode ?? 'impact';
    },
    getTaskSortDirection: (state) => {
      const sortMode = state.taskSortMode ?? 'impact';
      return state.taskSortDirection ?? (sortMode === 'impact' ? 'desc' : 'asc');
    },
    getTaskSharedByAllOnly: (state) => {
      return state.taskSharedByAllOnly ?? false;
    },
    getNeededTypeView: (state) => {
      return state.neededTypeView ?? 'all';
    },
    getNeededItemsViewMode: (state) => {
      return state.neededItemsViewMode ?? 'grid';
    },
    getNeededItemsFirFilter: (state) => {
      return state.neededItemsFirFilter ?? 'all';
    },
    getNeededItemsGroupByItem: (state) => {
      return state.neededItemsGroupByItem ?? false;
    },
    getNeededItemsHideNonFirSpecialEquipment: (state) => {
      return state.neededItemsHideNonFirSpecialEquipment ?? false;
    },
    getNeededItemsKappaOnly: (state) => {
      return state.neededItemsKappaOnly ?? false;
    },
    itemsNeededHideNonFIR: (state) => {
      return state.itemsHideNonFIR ?? false;
    },
    getHideGlobalTasks: (state) => {
      return state.hideGlobalTasks ?? false;
    },
    getHideNonKappaTasks: (state) => {
      return state.hideNonKappaTasks ?? false;
    },
    getNeededItemsStyle: (state) => {
      return state.neededitemsStyle ?? 'mediumCard';
    },
    getHideoutPrimaryView: (state) => {
      return state.hideoutPrimaryView ?? 'available';
    },
    getMapZoomSpeed: (state) => {
      return state.mapZoomSpeed ?? 1;
    },
    getLocaleOverride: (state) => {
      return state.localeOverride ?? null;
    },
    // Task filter getters
    getShowNonSpecialTasks: (state) => {
      return state.showNonSpecialTasks ?? true;
    },
    getShowLightkeeperTasks: (state) => {
      return state.showLightkeeperTasks ?? true;
    },
    // Task appearance getters
    getShowRequiredLabels: (state) => {
      return state.showRequiredLabels ?? true;
    },
    getShowNotRequiredLabels: (state) => {
      return state.showNotRequiredLabels ?? true;
    },
    getShowExperienceRewards: (state) => {
      return state.showExperienceRewards ?? true;
    },
    getShowTaskIds: (state) => {
      return state.showTaskIds ?? true;
    },
    getShowNextQuests: (state) => {
      return state.showNextQuests ?? true;
    },
    getShowPreviousQuests: (state) => {
      return state.showPreviousQuests ?? true;
    },
    getTaskCardDensity: (state) => {
      return state.taskCardDensity ?? 'compact';
    },
    getEnableManualTaskFail: (state) => {
      return state.enableManualTaskFail ?? false;
    },
    getUseAutomaticLevelCalculation: (state) => {
      return state.useAutomaticLevelCalculation ?? false;
    },
    getEnableHolidayEffects: (state) => {
      return state.enableHolidayEffects ?? true;
    },
    // Map display getters
    getShowMapExtracts: (state) => {
      return state.showMapExtracts ?? true;
    },
  },
  actions: {
    setStreamerMode(mode: boolean) {
      this.streamerMode = mode;
    },
    toggleHidden(teamId: string) {
      if (!this.teamHide) {
        this.teamHide = {};
      }
      this.teamHide[teamId] = !this.teamHide[teamId];
    },
    setQuestTeamHideAll(hide: boolean) {
      this.taskTeamHideAll = hide;
    },
    setItemsTeamHideAll(hide: boolean) {
      this.itemsTeamHideAll = hide;
    },
    setItemsTeamHideNonFIR(hide: boolean) {
      this.itemsTeamHideNonFIR = hide;
    },
    setItemsTeamHideHideout(hide: boolean) {
      this.itemsTeamHideHideout = hide;
    },
    setMapTeamHideAll(hide: boolean) {
      this.mapTeamHideAll = hide;
    },
    setTaskPrimaryView(view: string) {
      this.taskPrimaryView = view;
    },
    setMapZoomSpeed(speed: number) {
      if (!Number.isFinite(speed)) {
        this.mapZoomSpeed = 1;
        return;
      }
      const clamped = Math.min(3, Math.max(0.5, speed));
      this.mapZoomSpeed = clamped;
    },
    setTaskMapView(view: string) {
      this.taskMapView = view;
    },
    setTaskTraderView(view: string) {
      this.taskTraderView = view;
    },
    setTaskSecondaryView(view: string) {
      this.taskSecondaryView = view;
    },
    setTaskUserView(view: string) {
      this.taskUserView = view;
    },
    setTaskSortMode(mode: TaskSortMode) {
      this.taskSortMode = mode;
    },
    setTaskSortDirection(direction: TaskSortDirection) {
      this.taskSortDirection = direction;
    },
    setTaskSharedByAllOnly(enabled: boolean) {
      this.taskSharedByAllOnly = enabled;
    },
    setNeededTypeView(view: NeededItemsFilterType) {
      this.neededTypeView = view;
    },
    setNeededItemsViewMode(mode: 'list' | 'grid') {
      this.neededItemsViewMode = mode;
    },
    setNeededItemsFirFilter(filter: NeededItemsFirFilter) {
      this.neededItemsFirFilter = filter;
    },
    setNeededItemsGroupByItem(groupBy: boolean) {
      this.neededItemsGroupByItem = groupBy;
    },
    setNeededItemsHideNonFirSpecialEquipment(hide: boolean) {
      this.neededItemsHideNonFirSpecialEquipment = hide;
    },
    setNeededItemsKappaOnly(kappaOnly: boolean) {
      this.neededItemsKappaOnly = kappaOnly;
    },
    setItemsNeededHideNonFIR(hide: boolean) {
      this.itemsHideNonFIR = hide;
      // Persistence handled automatically by plugin
      this.saving = this.saving ?? { ...initialSavingState };
      this.saving.itemsNeededHideNonFIR = true;
    },
    setHideGlobalTasks(hide: boolean) {
      this.hideGlobalTasks = hide;
      // Persistence handled automatically by plugin
      this.saving = this.saving ?? { ...initialSavingState };
      this.saving.hideGlobalTasks = true;
    },
    setHideNonKappaTasks(hide: boolean) {
      this.hideNonKappaTasks = hide;
      // Persistence handled automatically by plugin
      this.saving = this.saving ?? { ...initialSavingState };
      this.saving.hideNonKappaTasks = true;
    },
    setNeededItemsStyle(style: string) {
      this.neededitemsStyle = style;
    },
    setHideoutPrimaryView(view: string) {
      this.hideoutPrimaryView = view;
    },
    setLocaleOverride(locale: string | null) {
      this.localeOverride = locale;
    },
    // Task filter actions
    setShowNonSpecialTasks(show: boolean) {
      this.showNonSpecialTasks = show;
    },
    setShowLightkeeperTasks(show: boolean) {
      this.showLightkeeperTasks = show;
    },
    // Task appearance actions
    setShowRequiredLabels(show: boolean) {
      this.showRequiredLabels = show;
    },
    setShowNotRequiredLabels(show: boolean) {
      this.showNotRequiredLabels = show;
    },
    setShowExperienceRewards(show: boolean) {
      this.showExperienceRewards = show;
    },
    setShowTaskIds(show: boolean) {
      this.showTaskIds = show;
    },
    setShowNextQuests(show: boolean) {
      this.showNextQuests = show;
    },
    setShowPreviousQuests(show: boolean) {
      this.showPreviousQuests = show;
    },
    setTaskCardDensity(density: 'comfortable' | 'compact') {
      this.taskCardDensity = density;
    },
    setEnableManualTaskFail(enable: boolean) {
      this.enableManualTaskFail = enable;
    },
    setUseAutomaticLevelCalculation(use: boolean) {
      this.useAutomaticLevelCalculation = use;
    },
    setEnableHolidayEffects(enable: boolean) {
      this.enableHolidayEffects = enable;
    },
    // Map display actions
    setShowMapExtracts(show: boolean) {
      this.showMapExtracts = show;
    },
  },
  // Enable automatic localStorage persistence
  persist: {
    key: STORAGE_KEYS.preferences, // LocalStorage key for user preference data
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    // Use serializer instead of paths for selective persistence
    serializer: {
      serialize: JSON.stringify,
      deserialize: JSON.parse,
    },
    // Pick specific properties to persist (excluding transient state)
    pick: [
      'streamerMode',
      'teamHide',
      'taskTeamHideAll',
      'itemsTeamHideAll',
      'itemsTeamHideNonFIR',
      'itemsTeamHideHideout',
      'mapTeamHideAll',
      'taskPrimaryView',
      'taskMapView',
      'taskTraderView',
      'taskSecondaryView',
      'taskUserView',
      'taskSortMode',
      'taskSortDirection',
      'taskSharedByAllOnly',
      'neededTypeView',
      'neededItemsViewMode',
      'neededItemsFirFilter',
      'neededItemsGroupByItem',
      'neededItemsHideNonFirSpecialEquipment',
      'neededItemsKappaOnly',
      'itemsHideNonFIR',
      'hideGlobalTasks',
      'hideNonKappaTasks',
      'neededitemsStyle',
      'hideoutPrimaryView',
      'localeOverride',
      // Task filter settings
      'showNonSpecialTasks',
      'showLightkeeperTasks',
      // Task appearance settings
      'showRequiredLabels',
      'showNotRequiredLabels',
      'showExperienceRewards',
      'showTaskIds',
      'showNextQuests',
      'showPreviousQuests',
      'taskCardDensity',
      'enableManualTaskFail',
      'useAutomaticLevelCalculation',
      'enableHolidayEffects',
      'showMapExtracts',
      'mapZoomSpeed',
    ],
  },
});
export type PreferencesStore = ReturnType<typeof usePreferencesStore>;
export type { TaskSortDirection, TaskSortMode } from '@/types/taskSort';
// Watch for Supabase user state changing
let stopUserWatch: (() => void) | null = null;
const shouldInitPreferencesWatchers = import.meta.client && import.meta.env.MODE !== 'test';
if (shouldInitPreferencesWatchers) {
  setTimeout(() => {
    try {
      const nuxtApp = useNuxtApp();
      // Ensure Supabase plugin is initialized before accessing
      if (nuxtApp.$supabase) {
        const { $supabase } = nuxtApp;
        // Stop any existing watcher to avoid duplicates (HMR/login churn)
        if (stopUserWatch) {
          stopUserWatch();
          stopUserWatch = null;
        }
        stopUserWatch = watch(
          () => $supabase.user.loggedIn,
          async (newValue: boolean) => {
            // User store data now managed through Supabase listeners
            try {
              const resolvedPinia = pluginPinia ?? nuxtApp.$pinia;
              if (!resolvedPinia) return;
              const preferencesStore = usePreferencesStore(resolvedPinia);
              if (newValue && $supabase.user.id) {
                // Load user preferences from Supabase
                const { data, error } = await $supabase.client
                  .from('user_preferences')
                  .select('*')
                  .eq('user_id', $supabase.user.id)
                  .maybeSingle();
                if (error && error.code !== 'PGRST116') {
                  logger.error(
                    '[PreferencesStore] Error loading preferences from Supabase:',
                    error
                  );
                }
                if (data) {
                  logger.debug('[PreferencesStore] Loading preferences from Supabase:', data);
                  // Update store with server data
                  Object.keys(data).forEach((key) => {
                    if (key !== 'user_id' && key !== 'created_at' && key !== 'updated_at') {
                      const camelKey = key.replace(/_([a-z])/g, (_, letter) =>
                        letter.toUpperCase()
                      );
                      if (camelKey in preferencesStore.$state) {
                        // Fix type issue by casting through unknown first
                        (preferencesStore.$state as unknown as Record<string, unknown>)[camelKey] =
                          data[key];
                      }
                    }
                  });
                }
                // Set up sync to Supabase
                useSupabaseSync({
                  store: preferencesStore,
                  table: 'user_preferences',
                  debounceMs: 500,
                  transform: (state: unknown) => {
                    const preferencesState = state as PreferencesState;
                    logger.debug(
                      '[PreferencesStore] Transform called - preparing preferences for sync'
                    );
                    // Convert camelCase to snake_case for Supabase
                    return {
                      user_id: $supabase.user.id,
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
                      show_non_special_tasks: preferencesState.showNonSpecialTasks,
                      show_lightkeeper_tasks: preferencesState.showLightkeeperTasks,
                      show_required_labels: preferencesState.showRequiredLabels,
                      show_not_required_labels: preferencesState.showNotRequiredLabels,
                      show_experience_rewards: preferencesState.showExperienceRewards,
                      show_task_ids: preferencesState.showTaskIds,
                      show_next_quests: preferencesState.showNextQuests,
                      show_previous_quests: preferencesState.showPreviousQuests,
                      task_card_density: preferencesState.taskCardDensity,
                      enable_holiday_effects: preferencesState.enableHolidayEffects,
                      show_map_extracts: preferencesState.showMapExtracts,
                      neededitems_style: preferencesState.neededitemsStyle,
                      hideout_primary_view: preferencesState.hideoutPrimaryView,
                      locale_override: preferencesState.localeOverride,
                      enable_manual_task_fail: preferencesState.enableManualTaskFail,
                      use_automatic_level_calculation:
                        preferencesState.useAutomaticLevelCalculation,
                    };
                  },
                });
              }
            } catch (_error) {
              logger.error(
                '[PreferencesStore] Error in preferencesStore watch for user.loggedIn:',
                _error
              );
            }
          },
          { immediate: true }
        );
        // HMR/route cleanup
        if (import.meta.hot) {
          import.meta.hot.dispose(() => {
            if (stopUserWatch) {
              stopUserWatch();
              stopUserWatch = null;
            }
          });
        }
      }
    } catch (error) {
      logger.error('[PreferencesStore] Error setting up preferences store watchers:', error);
    }
  }, 100);
}
