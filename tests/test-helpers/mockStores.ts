import type { NeededItemTaskObjective } from '@/types/tarkov';
export const createDefaultNeededItem = (
  overrides: Partial<NeededItemTaskObjective> = {}
): NeededItemTaskObjective => ({
  id: 'need-1',
  needType: 'taskObjective',
  taskId: 'task-1',
  item: { id: 'item-1', name: 'Item' },
  count: 1,
  foundInRaid: false,
  ...overrides,
});
