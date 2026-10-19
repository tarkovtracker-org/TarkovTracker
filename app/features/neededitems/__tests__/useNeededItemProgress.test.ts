import { beforeEach, describe, expect, it, vi } from 'vitest';
import { neededCountOf, useNeededItemProgress } from '@/features/neededitems/useNeededItemProgress';
import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
const { store } = vi.hoisted(() => ({
  store: {
    counts: {} as Record<string, number>,
    completeParts: new Set<string>(),
    getObjectiveCount: vi.fn(),
    getHideoutPartCount: vi.fn(),
    setObjectiveCount: vi.fn(),
    setHideoutPartCount: vi.fn(),
    isHideoutPartComplete: vi.fn(),
    setHideoutPartComplete: vi.fn(),
    setHideoutPartUncomplete: vi.fn(),
  },
}));
vi.mock('@/stores/useTarkov', () => ({ useTarkovStore: () => store }));
const objective = {
  needType: 'taskObjective',
  id: 'obj-1',
  count: 3,
} as unknown as NeededItemTaskObjective;
const part = {
  needType: 'hideoutModule',
  id: 'part-1',
  count: 2,
} as unknown as NeededItemHideoutModule;
describe('useNeededItemProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.counts = { 'obj-1': 1, 'part-1': 1 };
    store.completeParts = new Set();
    store.getObjectiveCount.mockImplementation((id: string) => store.counts[id]);
    store.getHideoutPartCount.mockImplementation((id: string) => store.counts[id]);
    store.isHideoutPartComplete.mockImplementation((id: string) => store.completeParts.has(id));
    store.setObjectiveCount.mockImplementation((id: string, count: number) => {
      store.counts[id] = count;
    });
    store.setHideoutPartCount.mockImplementation((id: string, count: number) => {
      store.counts[id] = count;
    });
  });
  it('treats a missing or zero count as one needed item', () => {
    expect(neededCountOf({ ...objective, count: 0 })).toBe(1);
    expect(neededCountOf(objective)).toBe(3);
  });
  it('reads the stored count for each need type', () => {
    store.counts = { 'obj-1': 2, 'part-1': 1 };
    const progress = useNeededItemProgress();
    expect(progress.storedCountOf(objective)).toBe(2);
    expect(progress.storedCountOf(part)).toBe(1);
  });
  it('steps objective counts and clamps at zero and the needed count', () => {
    const progress = useNeededItemProgress();
    progress.increase(objective);
    expect(store.setObjectiveCount).toHaveBeenLastCalledWith('obj-1', 2);
    progress.decrease(objective);
    expect(store.setObjectiveCount).toHaveBeenLastCalledWith('obj-1', 1);
    progress.increase(objective, 3);
    progress.decrease(objective, 0);
    expect(store.setObjectiveCount).toHaveBeenCalledTimes(2);
    expect(store.setHideoutPartCount).not.toHaveBeenCalled();
  });
  it('toggles to the needed count, and back to one below it when already complete', () => {
    const progress = useNeededItemProgress();
    progress.toggle(objective);
    expect(store.setObjectiveCount).toHaveBeenLastCalledWith('obj-1', 3);
    progress.toggle(objective, 3);
    expect(store.setObjectiveCount).toHaveBeenLastCalledWith('obj-1', 2);
    progress.toggle({ ...objective, count: 1 }, 1);
    expect(store.setObjectiveCount).toHaveBeenLastCalledWith('obj-1', 0);
    progress.toggle(objective, 5);
    expect(store.setObjectiveCount).toHaveBeenLastCalledWith('obj-1', 2);
  });
  it('completes a hideout part when its count reaches the requirement', () => {
    const progress = useNeededItemProgress();
    progress.increase(part);
    expect(store.setHideoutPartCount).toHaveBeenLastCalledWith('part-1', 2);
    expect(store.setHideoutPartComplete).toHaveBeenCalledWith('part-1');
    expect(store.setHideoutPartUncomplete).not.toHaveBeenCalled();
    expect(store.setObjectiveCount).not.toHaveBeenCalled();
  });
  it('marks over-filled hideout parts complete', () => {
    useNeededItemProgress().setCount(part, 3);
    expect(store.setHideoutPartCount).toHaveBeenCalledWith('part-1', 3);
    expect(store.setHideoutPartComplete).toHaveBeenCalledWith('part-1');
    expect(store.setHideoutPartUncomplete).not.toHaveBeenCalled();
  });
  it('uncompletes a hideout part when its count drops below the requirement', () => {
    store.counts['part-1'] = 2;
    store.completeParts.add('part-1');
    const progress = useNeededItemProgress();
    progress.decrease(part);
    expect(store.setHideoutPartCount).toHaveBeenLastCalledWith('part-1', 1);
    expect(store.setHideoutPartUncomplete).toHaveBeenCalledWith('part-1');
    expect(store.setHideoutPartComplete).not.toHaveBeenCalled();
  });
  it('leaves hideout completion alone when it already matches the count', () => {
    const progress = useNeededItemProgress();
    progress.setCount(part, 0);
    store.completeParts.add('part-1');
    progress.setCount(part, 2);
    expect(store.setHideoutPartCount).toHaveBeenCalledTimes(2);
    expect(store.setHideoutPartComplete).not.toHaveBeenCalled();
    expect(store.setHideoutPartUncomplete).not.toHaveBeenCalled();
  });
});
