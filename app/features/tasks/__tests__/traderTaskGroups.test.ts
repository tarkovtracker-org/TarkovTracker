import { describe, expect, it } from 'vitest';
import {
  groupTasksByTraderSection,
  hasTraderTaskGroups,
  orderTasksByTraderSection,
} from '@/features/tasks/traderTaskGroups';
import type { Task, TraderTaskGroup } from '@/types/tarkov';
const task = (id: string, traderTaskGroup?: TraderTaskGroup): Task =>
  traderTaskGroup === undefined ? { id } : { id, traderTaskGroup };
describe('trader task sections', () => {
  const tasks = [
    task('essential-a', 0),
    task('unknown'),
    task('ll2-a', 2),
    task('ll1-a', 1),
    task('essential-b', 0),
    task('ll1-b', 1),
  ];
  it('groups in the in-game order and keeps the sort order inside each section', () => {
    expect(
      groupTasksByTraderSection(tasks).map((group) => [
        group.section,
        group.tasks.map((entry) => entry.id),
      ])
    ).toEqual([
      ['ll1', ['ll1-a', 'll1-b']],
      ['ll2', ['ll2-a']],
      ['essential', ['essential-a', 'essential-b']],
      ['other', ['unknown']],
    ]);
  });
  it('orders tasks section by section for incremental rendering', () => {
    expect(orderTasksByTraderSection(tasks).map((entry) => entry.id)).toEqual([
      'll1-a',
      'll1-b',
      'll2-a',
      'essential-a',
      'essential-b',
      'unknown',
    ]);
  });
  it('sections only when at least one task has a known group', () => {
    expect(hasTraderTaskGroups([task('a'), task('b')])).toBe(false);
    expect(hasTraderTaskGroups([task('a'), task('b', 0)])).toBe(true);
    expect(hasTraderTaskGroups([])).toBe(false);
  });
});
