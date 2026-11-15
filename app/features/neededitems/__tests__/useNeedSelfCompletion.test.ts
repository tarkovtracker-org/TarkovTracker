import { describe, expect, it, vi } from 'vitest';
import { useNeedSelfCompletion } from '@/features/neededitems/useNeedSelfCompletion';
import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
const state = vi.hoisted(() => ({ done: new Set<string>(), failed: new Set<string>() }));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    isTaskComplete: (id: string) => state.done.has(id) || state.failed.has(id),
    isTaskFailed: (id: string) => state.failed.has(id),
  }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({ moduleCompletions: { built: { self: true } } }),
}));
// Completing "branch-a" fails "quest"; the reverse is not true.
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    alternativeTasks: { 'branch-a': ['quest'] },
    alternativeTaskSources: { quest: ['branch-a'] },
  }),
}));
const task = (taskId: string) =>
  ({ id: `${taskId}-obj`, taskId, needType: 'taskObjective' }) as NeededItemTaskObjective;
const part = (moduleId: string) =>
  ({
    id: 'part',
    needType: 'hideoutModule',
    hideoutModule: { id: moduleId },
  }) as NeededItemHideoutModule;
describe('useNeedSelfCompletion', () => {
  it('finishes a need when its quest succeeds, but not when it failed', () => {
    const { isSelfCompleted } = useNeedSelfCompletion();
    state.done = new Set(['quest']);
    state.failed = new Set();
    expect(isSelfCompleted(task('quest'))).toBe(true);
    state.done = new Set();
    state.failed = new Set(['quest']);
    expect(isSelfCompleted(task('quest'))).toBe(false);
  });
  it('finishes a need once a task that fails its quest is turned in, in that direction only', () => {
    const { isSelfCompleted } = useNeedSelfCompletion();
    state.done = new Set(['branch-a']);
    state.failed = new Set();
    expect(isSelfCompleted(task('quest'))).toBe(true);
    state.done = new Set(['quest']);
    expect(isSelfCompleted(task('branch-a'))).toBe(false);
  });
  it('finishes a hideout need once its module is built', () => {
    const { isSelfCompleted } = useNeedSelfCompletion();
    expect(isSelfCompleted(part('built'))).toBe(true);
    expect(isSelfCompleted(part('open'))).toBe(false);
  });
});
