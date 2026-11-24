import { describe, expect, it } from 'vitest';
import { planSetupHideout, planSetupQuests } from '@/features/setup/setupProgress';
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
      ['active', { complete: false, failed: false }],
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
});
describe('setup hideout review', () => {
  const tier = (id: string, level: number) => ({ id, level }) as HideoutLevel;
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
});
