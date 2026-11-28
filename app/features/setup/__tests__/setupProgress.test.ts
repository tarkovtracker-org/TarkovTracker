import { describe, expect, it } from 'vitest';
import {
  expandHideoutStationPrerequisites,
  hasAnySubstantialProgress,
  isTaskEligibleForFaction,
  planSetupHideout,
  planSetupQuests,
} from '@/features/setup/setupProgress';
import { defaultState } from '@/stores/progressState';
import type { HideoutLevel, HideoutStation, Task } from '@/types/tarkov';
import type { RawTaskCompletion } from '@/utils/taskStatus';
const need = (id: string, ...status: string[]) => ({ task: { id }, status });
const task = (id: string, taskRequirements: Task['taskRequirements'] = []): Task =>
  ({
    id,
    taskRequirements,
  }) as Task;
const catalog = (...tasks: Task[]) => new Map(tasks.map((entry) => [entry.id, entry]));
const noProgress = () => undefined;
describe('setup quest review', () => {
  it('finds transitive completion gates once and never follows flattened or ambiguous routes', () => {
    const current = {
      ...task('current', [
        need('previous', 'Complete', 'completed'),
        need('previous', 'complete'),
        need('active-or-complete', 'active', 'complete'),
        need('default-status'),
        need('failed-only', 'failed'),
        need('missing', 'complete'),
      ]),
      predecessors: ['flattened'],
    };
    const tasks = catalog(
      current,
      task('previous', [need('earliest', 'completed')]),
      task('earliest', [need('current', 'complete')]),
      task('active-or-complete'),
      task('default-status'),
      task('failed-only'),
      task('flattened')
    );
    expect(planSetupQuests(tasks, new Map([['current', 'active']]), noProgress)).toEqual({
      active: ['current'],
      completed: [],
      suggested: ['previous', 'earliest'],
    });
  });
  it('records an explicit setup choice for a legacy task whose acceptance is unknown', () => {
    const tasks = catalog(task('legacy'));
    const legacy = { complete: false, failed: false };
    expect(planSetupQuests(tasks, new Map([['legacy', 'active']]), () => legacy)).toEqual({
      active: ['legacy'],
      completed: [],
      suggested: [],
    });
  });
  it('preserves saved states and does not infer the route into a story-unlocked quest', () => {
    const story = {
      ...task('story', [need('unneeded', 'complete')]),
      storyUnlocks: [{ id: 'alternate', name: 'Alternate story route' }],
    };
    const tasks = catalog(
      story,
      task('later', [need('failed', 'complete'), need('active', 'complete')]),
      task('failed'),
      task('active'),
      task('complete'),
      task('unneeded')
    );
    const existing = new Map<string, RawTaskCompletion>([
      ['failed', { complete: true, failed: true }],
      ['active', { complete: false, failed: false, active: true }],
      ['complete', true],
    ]);
    const plan = planSetupQuests(
      tasks,
      new Map([
        ['story', 'active'],
        ['later', 'completed'],
        ['failed', 'active'],
        ['complete', 'active'],
      ]),
      (id) => existing.get(id)
    );
    expect(plan).toEqual({ active: ['story'], completed: ['later'], suggested: [] });
  });
  it('filters faction-specific quests to the player PMC faction', () => {
    expect(isTaskEligibleForFaction({ factionName: 'Any' }, 'USEC')).toBe(true);
    expect(isTaskEligibleForFaction({ factionName: undefined }, 'BEAR')).toBe(true);
    expect(isTaskEligibleForFaction({ factionName: 'USEC' }, 'USEC')).toBe(true);
    expect(isTaskEligibleForFaction({ factionName: 'BEAR' }, 'USEC')).toBe(false);
    expect(isTaskEligibleForFaction({ factionName: 'BEAR' }, 'BEAR')).toBe(true);
  });
});
describe('setup hideout review', () => {
  const tier = (
    id: string,
    level: number,
    stationLevelRequirements: HideoutLevel['stationLevelRequirements'] = []
  ) => ({ id, level, stationLevelRequirements }) as HideoutLevel;
  const station = (id: string, levels: HideoutLevel[]): HideoutStation => ({
    id,
    name: id,
    levels,
  });
  const furnace = station('furnace', [tier('one', 1), tier('two', 2), tier('three', 3)]);
  const security = station('security', [tier('security-one', 1)]);
  it('adds only missing tiers of the selected station and ignores invalid levels', () => {
    const selections = new Map([
      ['furnace', 3],
      ['security', 2],
      ['unknown', 1],
    ]);
    expect(planSetupHideout([furnace, security], selections, (id) => id === 'one')).toEqual([
      tier('two', 2),
      tier('three', 3),
    ]);
  });
  it('transitively expands missing prerequisite station tiers without looping on cycles', () => {
    const gen = station('generator', [
      tier('gen-1', 1, [
        { id: 'req-sec', station: { id: 'security', name: 'Security' }, level: 1 },
      ]),
      tier('gen-2', 2, [
        { id: 'req-sec-2', station: { id: 'security', name: 'Security' }, level: 2 },
      ]),
    ]);
    const sec = station('security', [
      tier('sec-1', 1),
      tier('sec-2', 2, [
        { id: 'req-illum', station: { id: 'illumination', name: 'Illumination' }, level: 1 },
      ]),
    ]);
    const illum = station('illumination', [
      tier('illum-1', 1, [
        { id: 'req-gen-cycle', station: { id: 'generator', name: 'Generator' }, level: 1 },
      ]),
    ]);
    const expanded = expandHideoutStationPrerequisites(
      [gen, sec, illum],
      new Map([['generator', 2]]),
      () => 0
    );
    expect(expanded).toEqual(
      new Map([
        ['generator', 2],
        ['security', 2],
        ['illumination', 1],
      ])
    );
  });
});
describe('substantial progress detection', () => {
  it('ignores profile-only tweaks like faction, level, or displayName', () => {
    const state = structuredClone(defaultState);
    state.pvp.level = 5;
    state.pvp.pmcFaction = 'BEAR';
    state.pvp.displayName = 'Timmy';
    expect(hasAnySubstantialProgress(state)).toBe(false);
  });
  it('detects completed tasks, objectives, hideout modules, or story progress in any mode', () => {
    const withTask = structuredClone(defaultState);
    withTask.pve.taskCompletions = { 'task-1': { complete: true, failed: false } };
    expect(hasAnySubstantialProgress(withTask)).toBe(true);
    const withHideout = structuredClone(defaultState);
    withHideout.seasonal.hideoutModules = { 'mod-1': { complete: true } };
    expect(hasAnySubstantialProgress(withHideout)).toBe(true);
    const withStory = structuredClone(defaultState);
    withStory.pvp.storyChapters = { 'chap-1': { complete: true } };
    expect(hasAnySubstantialProgress(withStory)).toBe(true);
  });
});
