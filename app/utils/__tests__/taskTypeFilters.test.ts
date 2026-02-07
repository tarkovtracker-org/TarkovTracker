import { describe, expect, it } from 'vitest';
import {
  buildTaskTypeFilterOptions,
  filterTasksByTypeSettings,
  type TaskTypeFilterOptions,
} from '@/utils/taskTypeFilters';
import type { Task } from '@/types/tarkov';
const createBaseTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  name: 'Test Task',
  factionName: 'Any',
  ...overrides,
});
const createOptions = (overrides: Partial<TaskTypeFilterOptions> = {}): TaskTypeFilterOptions => ({
  showKappa: true,
  showLightkeeper: true,
  showNonSpecial: true,
  userPrestigeLevel: 0,
  prestigeTaskMap: new Map<string, number>(),
  excludedTaskIds: new Set<string>(),
  ...overrides,
});
describe('filterTasksByTypeSettings', () => {
  describe('prestige filtering', () => {
    it('excludes prestige tasks not matching user level', () => {
      const tasks = [
        createBaseTask({ id: 'prestige-1', name: 'Prestige Task' }),
        createBaseTask({ id: 'normal-1', name: 'Normal Task' }),
      ];
      const prestigeTaskMap = new Map([['prestige-1', 1]]);
      const options = createOptions({
        userPrestigeLevel: 0,
        prestigeTaskMap,
      });
      const result = filterTasksByTypeSettings(tasks, options);
      expect(result.map((t) => t.id)).toEqual(['normal-1']);
    });
    it('includes prestige tasks matching user level', () => {
      const tasks = [
        createBaseTask({ id: 'prestige-1', name: 'Prestige Task' }),
        createBaseTask({ id: 'normal-1', name: 'Normal Task' }),
      ];
      const prestigeTaskMap = new Map([['prestige-1', 1]]);
      const options = createOptions({
        userPrestigeLevel: 1,
        prestigeTaskMap,
      });
      const result = filterTasksByTypeSettings(tasks, options);
      expect(result.map((t) => t.id)).toEqual(['prestige-1', 'normal-1']);
    });
  });
  describe('edition filtering', () => {
    it('excludes tasks excluded by game edition', () => {
      const tasks = [
        createBaseTask({ id: 'eod-only', name: 'EOD Task' }),
        createBaseTask({ id: 'all-editions', name: 'All Editions Task' }),
      ];
      const options = createOptions({
        excludedTaskIds: new Set(['eod-only']),
      });
      const result = filterTasksByTypeSettings(tasks, options);
      expect(result.map((t) => t.id)).toEqual(['all-editions']);
    });
  });
  describe('kappa filtering', () => {
    it('shows kappa-required tasks when showKappa is true', () => {
      const tasks = [
        createBaseTask({ id: 'kappa-1', name: 'Kappa Task', kappaRequired: true }),
        createBaseTask({ id: 'non-kappa', name: 'Non Kappa Task' }),
      ];
      const options = createOptions({
        showKappa: true,
        showLightkeeper: false,
        showNonSpecial: false,
      });
      const result = filterTasksByTypeSettings(tasks, options);
      expect(result.map((t) => t.id)).toEqual(['kappa-1']);
    });
    it('hides kappa-required tasks when showKappa is false', () => {
      const tasks = [
        createBaseTask({ id: 'kappa-1', name: 'Kappa Task', kappaRequired: true }),
        createBaseTask({ id: 'non-kappa', name: 'Non Kappa Task' }),
      ];
      const options = createOptions({
        showKappa: false,
        showLightkeeper: false,
        showNonSpecial: true,
      });
      const result = filterTasksByTypeSettings(tasks, options);
      expect(result.map((t) => t.id)).toEqual(['non-kappa']);
    });
  });
  describe('lightkeeper filtering', () => {
    it('shows lightkeeper-required tasks when showLightkeeper is true', () => {
      const tasks = [
        createBaseTask({ id: 'lk-1', name: 'LK Task', lightkeeperRequired: true }),
        createBaseTask({ id: 'non-lk', name: 'Non LK Task' }),
      ];
      const options = createOptions({
        showKappa: false,
        showLightkeeper: true,
        showNonSpecial: false,
      });
      const result = filterTasksByTypeSettings(tasks, options);
      expect(result.map((t) => t.id)).toEqual(['lk-1']);
    });
  });
  describe('non-special filtering', () => {
    it('hides non-special tasks when showNonSpecial is false', () => {
      const tasks = [
        createBaseTask({ id: 'kappa', name: 'Kappa', kappaRequired: true }),
        createBaseTask({ id: 'lk', name: 'LK', lightkeeperRequired: true }),
        createBaseTask({ id: 'normal', name: 'Normal' }),
      ];
      const options = createOptions({
        showKappa: true,
        showLightkeeper: true,
        showNonSpecial: false,
      });
      const result = filterTasksByTypeSettings(tasks, options);
      expect(result.map((t) => t.id)).toEqual(['kappa', 'lk']);
    });
    it('shows non-special tasks when showNonSpecial is true', () => {
      const tasks = [createBaseTask({ id: 'normal', name: 'Normal' })];
      const options = createOptions({
        showKappa: false,
        showLightkeeper: false,
        showNonSpecial: true,
      });
      const result = filterTasksByTypeSettings(tasks, options);
      expect(result.map((t) => t.id)).toEqual(['normal']);
    });
  });
  describe('edge cases', () => {
    it('handles empty task list gracefully', () => {
      const options = createOptions();
      const result = filterTasksByTypeSettings([], options);
      expect(result).toEqual([]);
    });
    it('handles all filters disabled by showing all task categories', () => {
      const tasks = [
        createBaseTask({ id: 'kappa', kappaRequired: true }),
        createBaseTask({ id: 'lk', lightkeeperRequired: true }),
        createBaseTask({ id: 'normal' }),
      ];
      const options = createOptions({
        showKappa: false,
        showLightkeeper: false,
        showNonSpecial: false,
      });
      const result = filterTasksByTypeSettings(tasks, options);
      expect(result.map((t) => t.id)).toEqual(['kappa', 'lk', 'normal']);
    });
    it('handles task with both kappa and lightkeeper required', () => {
      const tasks = [
        createBaseTask({
          id: 'both',
          kappaRequired: true,
          lightkeeperRequired: true,
        }),
      ];
      const options = createOptions({
        showKappa: true,
        showLightkeeper: false,
        showNonSpecial: false,
      });
      const result = filterTasksByTypeSettings(tasks, options);
      expect(result.map((t) => t.id)).toEqual(['both']);
    });
  });
});
describe('buildTaskTypeFilterOptions', () => {
  const createPreferencesStore = (overrides = {}) => ({
    getHideNonKappaTasks: false,
    getShowLightkeeperTasks: true,
    getShowNonSpecialTasks: true,
    ...overrides,
  });
  const createTarkovStore = (overrides = {}) => ({
    getPrestigeLevel: () => 0,
    getGameEdition: () => 1,
    ...overrides,
  });
  const createMetadataStore = (overrides = {}) => ({
    prestigeTaskMap: new Map<string, number>(),
    getExcludedTaskIdsForEdition: () => new Set<string>(),
    ...overrides,
  });
  it('respects getShowNonSpecialTasks independently of hideNonKappaTasks', () => {
    const preferencesStore = createPreferencesStore({
      getHideNonKappaTasks: true,
      getShowLightkeeperTasks: false,
      getShowNonSpecialTasks: true,
    });
    const result = buildTaskTypeFilterOptions(
      preferencesStore,
      createTarkovStore(),
      createMetadataStore()
    );
    expect(result.showKappa).toBe(false);
    expect(result.showLightkeeper).toBe(false);
    expect(result.showNonSpecial).toBe(true);
  });
  it('returns showNonSpecial as true when showKappa is true', () => {
    const preferencesStore = createPreferencesStore({
      getHideNonKappaTasks: false,
      getShowLightkeeperTasks: false,
      getShowNonSpecialTasks: true,
    });
    const result = buildTaskTypeFilterOptions(
      preferencesStore,
      createTarkovStore(),
      createMetadataStore()
    );
    expect(result.showKappa).toBe(true);
    expect(result.showNonSpecial).toBe(true);
  });
  it('forwards userPrestigeLevel from tarkovStore', () => {
    const tarkovStore = createTarkovStore({
      getPrestigeLevel: () => 2,
    });
    const result = buildTaskTypeFilterOptions(
      createPreferencesStore(),
      tarkovStore,
      createMetadataStore()
    );
    expect(result.userPrestigeLevel).toBe(2);
  });
  it('forwards prestigeTaskMap from metadataStore', () => {
    const prestigeMap = new Map([['task-1', 1]]);
    const metadataStore = createMetadataStore({
      prestigeTaskMap: prestigeMap,
    });
    const result = buildTaskTypeFilterOptions(
      createPreferencesStore(),
      createTarkovStore(),
      metadataStore
    );
    expect(result.prestigeTaskMap).toBe(prestigeMap);
  });
  it('includes excludedTaskIds in the returned object', () => {
    const excludedIds = new Set(['excluded-1', 'excluded-2']);
    const metadataStore = createMetadataStore({
      getExcludedTaskIdsForEdition: () => excludedIds,
    });
    const result = buildTaskTypeFilterOptions(
      createPreferencesStore(),
      createTarkovStore(),
      metadataStore
    );
    expect(result.excludedTaskIds).toBe(excludedIds);
  });
  it('handles default/empty state', () => {
    const result = buildTaskTypeFilterOptions(
      createPreferencesStore(),
      createTarkovStore(),
      createMetadataStore()
    );
    expect(result).toHaveProperty('showKappa');
    expect(result).toHaveProperty('showLightkeeper');
    expect(result).toHaveProperty('showNonSpecial');
    expect(result).toHaveProperty('userPrestigeLevel');
    expect(result).toHaveProperty('prestigeTaskMap');
    expect(result).toHaveProperty('excludedTaskIds');
  });
});
