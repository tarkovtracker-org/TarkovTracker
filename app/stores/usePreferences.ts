import { defineStore } from 'pinia';
import 'pinia-plugin-persistedstate';
import { useSupabaseSync } from '@/composables/supabase/useSupabaseSync';
import { pinia as pluginPinia } from '@/plugins/01.pinia.client';
import { logger } from '@/utils/logger';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { normalizeSecondaryView, normalizeSortMode } from '@/utils/taskFilterNormalization';
import type {
  NeededItemsFirFilter,
  NeededItemsFilterType,
} from '@/features/neededitems/neededitems-constants';
import type { TaskPrimaryView, TaskSecondaryView } from '@/types/taskFilter';
import type { TaskSortDirection, TaskSortMode } from '@/types/taskSort';
import type { SkillSortMode } from '@/utils/constants';
export type TaskFilterSettings = {
  taskPrimaryView: TaskPrimaryView | null;
  taskMapView: string | null;
  taskTraderView: string | null;
  taskSecondaryView: TaskSecondaryView | null;
  taskUserView: string | null;
  taskSortMode: TaskSortMode | null;
  taskSortDirection: TaskSortDirection | null;
  taskSharedByAllOnly: boolean;
  hideGlobalTasks: boolean;
  hideNonKappaTasks: boolean;
  showNonSpecialTasks: boolean;
  showLightkeeperTasks: boolean;
  onlyTasksWithRequiredKeys: boolean;
  respectTaskFiltersForImpact: boolean;
  showAllFilter: boolean;
  showAvailableFilter: boolean;
  showLockedFilter: boolean;
  showCompletedFilter: boolean;
  showFailedFilter: boolean;
};
export type TaskFilterPreset = {
  id: string;
  name: string;
  settings: TaskFilterSettings;
};
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
  neededItemsSortBy: 'priority' | 'name' | 'category' | 'count' | null;
  neededItemsSortDirection: 'asc' | 'desc' | null;
  neededItemsHideOwned: boolean;
  neededItemsCardStyle: 'compact' | 'expanded' | null;
  itemsHideNonFIR: boolean;
  hideGlobalTasks: boolean;
  hideNonKappaTasks: boolean;
  neededitemsStyle: string | null;
  hideoutPrimaryView?: string | null;
  hideoutCollapseCompleted: boolean;
  hideoutSortReadyFirst: boolean;
  hideoutRequireStationLevels: boolean;
  hideoutRequireSkillLevels: boolean;
  hideoutRequireTraderLoyalty: boolean;
  localeOverride: string | null;
  // Task filter settings
  showNonSpecialTasks: boolean;
  showLightkeeperTasks: boolean;
  onlyTasksWithRequiredKeys: boolean;
  respectTaskFiltersForImpact: boolean;
  // Task appearance settings
  showRequiredLabels: boolean;
  showExperienceRewards: boolean;
  showNextQuests: boolean;
  showPreviousQuests: boolean;
  taskCardDensity: 'comfortable' | 'compact';
  enableManualTaskFail: boolean;
  hideCompletedTaskObjectives: boolean;
  showAllFilter: boolean;
  showAvailableFilter: boolean;
  showLockedFilter: boolean;
  showCompletedFilter: boolean;
  showFailedFilter: boolean;
  // XP and Level settings
  useAutomaticLevelCalculation: boolean;
  // Holiday effects
  enableHolidayEffects: boolean;
  dashboardNoticeDismissed: boolean;
  // Map display settings
  showMapExtracts: boolean;
  mapZoomSpeed: number;
  pinnedTaskIds: string[];
  // Skills settings
  skillSortMode: SkillSortMode | null;
  taskFilterPresets: TaskFilterPreset[];
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
  neededItemsSortBy: 'priority',
  neededItemsSortDirection: 'desc',
  neededItemsHideOwned: false,
  neededItemsCardStyle: 'expanded',
  itemsHideNonFIR: false,
  hideGlobalTasks: false,
  hideNonKappaTasks: false,
  neededitemsStyle: null,
  hideoutPrimaryView: null,
  hideoutCollapseCompleted: false,
  hideoutSortReadyFirst: false,
  hideoutRequireStationLevels: true,
  hideoutRequireSkillLevels: true,
  hideoutRequireTraderLoyalty: true,
  localeOverride: null,
  // Task filter settings (all shown by default)
  showNonSpecialTasks: true,
  showLightkeeperTasks: true,
  onlyTasksWithRequiredKeys: false,
  respectTaskFiltersForImpact: true,
  // Task appearance settings
  showRequiredLabels: true,
  showExperienceRewards: true,
  showNextQuests: true,
  showPreviousQuests: true,
  taskCardDensity: 'compact',
  enableManualTaskFail: false,
  hideCompletedTaskObjectives: true,
  showAllFilter: true,
  showAvailableFilter: true,
  showLockedFilter: true,
  showCompletedFilter: true,
  showFailedFilter: true,
  // XP and Level settings
  useAutomaticLevelCalculation: false,
  // Holiday effects (enabled by default during holiday season)
  enableHolidayEffects: true,
  dashboardNoticeDismissed: false,
  // Map display settings
  showMapExtracts: true,
  mapZoomSpeed: 1,
  pinnedTaskIds: [],
  // Skills settings
  skillSortMode: null,
  taskFilterPresets: [],
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
    if (import.meta.client) {
      try {
        const rawPersistedState = localStorage.getItem(STORAGE_KEYS.preferences);
        if (rawPersistedState) {
          const persistedState = JSON.parse(rawPersistedState) as Record<string, unknown>;
          if (
            typeof persistedState.onlyTasksWithRequiredKeys !== 'boolean' &&
            typeof persistedState.onlyTasksWithSuggestedKeys === 'boolean'
          ) {
            state.onlyTasksWithRequiredKeys = persistedState.onlyTasksWithSuggestedKeys;
          }
        }
      } catch (_error) {
        logger.warn('[PreferencesStore] Failed to migrate local required keys preference:', _error);
      }
    }
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
      return normalizeSecondaryView(state.taskSecondaryView ?? 'available');
    },
    getTaskUserView: (state) => {
      return state.taskUserView ?? 'self';
    },
    getTaskSortMode: (state) => {
      return normalizeSortMode(state.taskSortMode ?? 'impact');
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
    getNeededItemsSortBy: (state) => {
      return state.neededItemsSortBy ?? 'priority';
    },
    getNeededItemsSortDirection: (state) => {
      return state.neededItemsSortDirection ?? 'desc';
    },
    getNeededItemsHideOwned: (state) => {
      return state.neededItemsHideOwned ?? false;
    },
    getNeededItemsCardStyle: (state) => {
      return state.neededItemsCardStyle ?? 'expanded';
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
    getHideoutCollapseCompleted: (state) => {
      return state.hideoutCollapseCompleted ?? false;
    },
    getHideoutSortReadyFirst: (state) => {
      return state.hideoutSortReadyFirst ?? false;
    },
    getHideoutRequireStationLevels: (state) => {
      return state.hideoutRequireStationLevels ?? true;
    },
    getHideoutRequireSkillLevels: (state) => {
      return state.hideoutRequireSkillLevels ?? true;
    },
    getHideoutRequireTraderLoyalty: (state) => {
      return state.hideoutRequireTraderLoyalty ?? true;
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
    getOnlyTasksWithRequiredKeys: (state) => {
      return state.onlyTasksWithRequiredKeys ?? false;
    },
    getRespectTaskFiltersForImpact: (state) => {
      return state.respectTaskFiltersForImpact ?? true;
    },
    // Task appearance getters
    getShowRequiredLabels: (state) => {
      return state.showRequiredLabels ?? true;
    },
    getShowExperienceRewards: (state) => {
      return state.showExperienceRewards ?? true;
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
    getHideCompletedTaskObjectives: (state) => {
      return state.hideCompletedTaskObjectives ?? true;
    },
    getShowAllFilter: (state) => {
      return state.showAllFilter ?? true;
    },
    getShowAvailableFilter: (state) => {
      return state.showAvailableFilter ?? true;
    },
    getShowLockedFilter: (state) => {
      return state.showLockedFilter ?? true;
    },
    getShowCompletedFilter: (state) => {
      return state.showCompletedFilter ?? true;
    },
    getShowFailedFilter: (state) => {
      return state.showFailedFilter ?? true;
    },
    getUseAutomaticLevelCalculation: (state) => {
      return state.useAutomaticLevelCalculation ?? false;
    },
    getEnableHolidayEffects: (state) => {
      return state.enableHolidayEffects ?? true;
    },
    getDashboardNoticeDismissed: (state) => {
      return state.dashboardNoticeDismissed ?? false;
    },
    // Map display getters
    getShowMapExtracts: (state) => {
      return state.showMapExtracts ?? true;
    },
    getPinnedTaskIds: (state) => {
      return state.pinnedTaskIds ?? [];
    },
    getTaskFilterPresets: (state) => {
      return state.taskFilterPresets ?? [];
    },
    // Skills getters
    getSkillSortMode: (state) => {
      return state.skillSortMode ?? 'priority';
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
      this.taskSecondaryView = normalizeSecondaryView(view);
    },
    setTaskUserView(view: string) {
      this.taskUserView = view;
    },
    setTaskSortMode(mode: TaskSortMode) {
      this.taskSortMode = normalizeSortMode(mode);
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
    setNeededItemsSortBy(sortBy: 'priority' | 'name' | 'category' | 'count') {
      this.neededItemsSortBy = sortBy;
    },
    setNeededItemsSortDirection(direction: 'asc' | 'desc') {
      this.neededItemsSortDirection = direction;
    },
    setNeededItemsHideOwned(hide: boolean) {
      this.neededItemsHideOwned = hide;
    },
    setNeededItemsCardStyle(style: 'compact' | 'expanded') {
      this.neededItemsCardStyle = style;
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
    setHideoutCollapseCompleted(enabled: boolean) {
      this.hideoutCollapseCompleted = enabled;
    },
    setHideoutSortReadyFirst(enabled: boolean) {
      this.hideoutSortReadyFirst = enabled;
    },
    setHideoutRequireStationLevels(enabled: boolean) {
      this.hideoutRequireStationLevels = enabled;
    },
    setHideoutRequireSkillLevels(enabled: boolean) {
      this.hideoutRequireSkillLevels = enabled;
    },
    setHideoutRequireTraderLoyalty(enabled: boolean) {
      this.hideoutRequireTraderLoyalty = enabled;
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
    setOnlyTasksWithRequiredKeys(onlyWithRequiredKeys: boolean) {
      this.onlyTasksWithRequiredKeys = onlyWithRequiredKeys;
    },
    setRespectTaskFiltersForImpact(enabled: boolean) {
      this.respectTaskFiltersForImpact = enabled;
    },
    // Task appearance actions
    setShowRequiredLabels(show: boolean) {
      this.showRequiredLabels = show;
    },
    setShowExperienceRewards(show: boolean) {
      this.showExperienceRewards = show;
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
    setHideCompletedTaskObjectives(hide: boolean) {
      this.hideCompletedTaskObjectives = hide;
    },
    setShowAllFilter(show: boolean) {
      this.showAllFilter = show;
    },
    setShowAvailableFilter(show: boolean) {
      this.showAvailableFilter = show;
    },
    setShowLockedFilter(show: boolean) {
      this.showLockedFilter = show;
    },
    setShowCompletedFilter(show: boolean) {
      this.showCompletedFilter = show;
    },
    setShowFailedFilter(show: boolean) {
      this.showFailedFilter = show;
    },
    setUseAutomaticLevelCalculation(use: boolean) {
      this.useAutomaticLevelCalculation = use;
    },
    setEnableHolidayEffects(enable: boolean) {
      this.enableHolidayEffects = enable;
    },
    setDashboardNoticeDismissed(dismissed: boolean) {
      this.dashboardNoticeDismissed = dismissed;
    },
    // Map display actions
    setShowMapExtracts(show: boolean) {
      this.showMapExtracts = show;
    },
    togglePinnedTask(taskId: string) {
      const current = this.pinnedTaskIds ?? [];
      const index = current.indexOf(taskId);
      if (index === -1) {
        this.pinnedTaskIds = [...current, taskId];
      } else {
        this.pinnedTaskIds = current.filter((id) => id !== taskId);
      }
    },
    addTaskFilterPreset(preset: TaskFilterPreset) {
      this.taskFilterPresets ??= [];
      const existingIndex = this.taskFilterPresets.findIndex(
        (existing) => existing.id === preset.id
      );
      if (existingIndex !== -1) {
        this.taskFilterPresets = this.taskFilterPresets.map((existing) =>
          existing.id === preset.id ? preset : existing
        );
        return;
      }
      this.taskFilterPresets = [...this.taskFilterPresets, preset];
    },
    removeTaskFilterPreset(id: string) {
      if (!this.taskFilterPresets) return;
      this.taskFilterPresets = this.taskFilterPresets.filter((p) => p.id !== id);
    },
    // Skills actions
    setSkillSortMode(mode: SkillSortMode) {
      this.skillSortMode = mode;
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
      'neededItemsSortBy',
      'neededItemsSortDirection',
      'neededItemsHideOwned',
      'neededItemsCardStyle',
      'itemsHideNonFIR',
      'hideGlobalTasks',
      'hideNonKappaTasks',
      'neededitemsStyle',
      'hideoutPrimaryView',
      'localeOverride',
      // Task filter settings
      'showNonSpecialTasks',
      'showLightkeeperTasks',
      'onlyTasksWithRequiredKeys',
      'respectTaskFiltersForImpact',
      // Task appearance settings
      'showRequiredLabels',
      'showExperienceRewards',
      'showNextQuests',
      'showPreviousQuests',
      'taskCardDensity',
      'enableManualTaskFail',
      'hideCompletedTaskObjectives',
      'showAllFilter',
      'showAvailableFilter',
      'showLockedFilter',
      'showCompletedFilter',
      'showFailedFilter',
      'useAutomaticLevelCalculation',
      'enableHolidayEffects',
      'dashboardNoticeDismissed',
      'hideoutCollapseCompleted',
      'hideoutSortReadyFirst',
      'hideoutRequireStationLevels',
      'hideoutRequireSkillLevels',
      'hideoutRequireTraderLoyalty',
      'showMapExtracts',
      'mapZoomSpeed',
      'pinnedTaskIds',
      'taskFilterPresets',
      'skillSortMode',
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
                  const preferenceRow = data as Record<string, unknown>;
                  const requiredKeysValue = preferenceRow.only_tasks_with_required_keys;
                  const suggestedKeysValue = preferenceRow.only_tasks_with_suggested_keys;
                  const shouldPreferRequiredKeys = typeof requiredKeysValue === 'boolean';
                  // Update store with server data
                  Object.keys(preferenceRow).forEach((key) => {
                    if (key !== 'user_id' && key !== 'created_at' && key !== 'updated_at') {
                      const value = preferenceRow[key];
                      if (key === 'only_tasks_with_suggested_keys' && shouldPreferRequiredKeys) {
                        return;
                      }
                      if (
                        key === 'only_tasks_with_required_keys' &&
                        typeof value !== 'boolean' &&
                        typeof suggestedKeysValue === 'boolean'
                      ) {
                        return;
                      }
                      const normalizedKey =
                        key === 'only_tasks_with_suggested_keys'
                          ? 'only_tasks_with_required_keys'
                          : key;
                      const camelKey = normalizedKey.replace(/_([a-z])/g, (_, letter) =>
                        letter.toUpperCase()
                      );
                      if (camelKey in preferencesStore.$state) {
                        (preferencesStore.$state as unknown as Record<string, unknown>)[camelKey] =
                          value;
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
                      only_tasks_with_required_keys: preferencesState.onlyTasksWithRequiredKeys,
                      respect_task_filters_for_impact: preferencesState.respectTaskFiltersForImpact,
                      show_required_labels: preferencesState.showRequiredLabels,
                      show_experience_rewards: preferencesState.showExperienceRewards,
                      show_next_quests: preferencesState.showNextQuests,
                      show_previous_quests: preferencesState.showPreviousQuests,
                      task_card_density: preferencesState.taskCardDensity,
                      enable_holiday_effects: preferencesState.enableHolidayEffects,
                      dashboard_notice_dismissed: preferencesState.dashboardNoticeDismissed,
                      show_map_extracts: preferencesState.showMapExtracts,
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
                      use_automatic_level_calculation:
                        preferencesState.useAutomaticLevelCalculation,
                      needed_items_sort_by: preferencesState.neededItemsSortBy,
                      needed_items_sort_direction: preferencesState.neededItemsSortDirection,
                      needed_items_hide_owned: preferencesState.neededItemsHideOwned,
                      needed_items_card_style: preferencesState.neededItemsCardStyle,
                      map_zoom_speed: preferencesState.mapZoomSpeed,
                      pinned_task_ids: preferencesState.pinnedTaskIds,
                      task_filter_presets: preferencesState.taskFilterPresets,
                      skill_sort_mode: preferencesState.skillSortMode,
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
