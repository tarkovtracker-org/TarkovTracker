import { describe, expect, it } from 'vitest';
import { getListHiddenTaskIds } from '@/features/tasks/hiddenTasks';
const base = { searchActive: false, secondaryView: 'available' as const, focusTaskId: null };
describe('getListHiddenTaskIds', () => {
  it('moves hidden tasks out of the to-do views', () => {
    for (const secondaryView of ['all', 'available', 'locked'] as const)
      expect([...getListHiddenTaskIds(['a', 'b'], { ...base, secondaryView })]).toEqual(['a', 'b']);
  });
  it('lists hidden tasks normally once they are completed or failed', () => {
    for (const secondaryView of ['completed', 'failed'] as const)
      expect(getListHiddenTaskIds(['a'], { ...base, secondaryView }).size).toBe(0);
  });
  it('lists hidden tasks normally while searching', () => {
    expect(getListHiddenTaskIds(['a'], { ...base, searchActive: true }).size).toBe(0);
  });
  it('never hides the deep-linked task', () => {
    expect([...getListHiddenTaskIds(['a', 'b'], { ...base, focusTaskId: 'a' })]).toEqual(['b']);
  });
});
