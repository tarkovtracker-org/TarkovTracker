import { describe, expect, it } from 'vitest';
import {
  categorizeObjectivesForMapView,
  resolveSelectedMapIds,
  resolveTaskObjectives,
} from '@/features/tasks/taskCardHelpers';
import type { Task, TaskObjective } from '@/types/tarkov';
const createTask = (id: string, objectives: TaskObjective[] = []): Task =>
  ({
    experience: 0,
    id,
    kappaRequired: false,
    lightkeeperRequired: false,
    minPlayerLevel: 1,
    name: `Task ${id}`,
    objectives,
    taskRequirements: [],
  }) as Task;
describe('taskCardHelpers', () => {
  it('resolves merged map ids when map belongs to merged set', () => {
    const result = resolveSelectedMapIds('streets', [
      { id: 'streets', mergedIds: ['streets', 'streets_night'] },
    ]);
    expect(result).toEqual(['streets', 'streets_night']);
  });
  it('falls back to store objectives when task props are stale', () => {
    const objective = { id: 'obj-1', type: 'visit' } as TaskObjective;
    const staleTask = createTask('task-1', []);
    const freshTask = createTask('task-1', [objective]);
    expect(resolveTaskObjectives(staleTask, freshTask)).toEqual([objective]);
  });
  it('categorizes map objectives and tracks uncompleted irrelevant objectives', () => {
    const objectives = [
      { id: 'obj-a', type: 'visit', maps: [{ id: 'woods' }] },
      { id: 'obj-b', type: 'giveItem', maps: [{ id: 'customs' }] },
      { id: 'obj-c', type: 'visit', maps: [{ id: 'customs' }] },
    ] as TaskObjective[];
    const result = categorizeObjectivesForMapView({
      isMapView: true,
      isObjectiveComplete: (id) => id === 'obj-c',
      mapIds: ['woods'],
      objectives,
    });
    expect(result.relevant.map((objective) => objective.id)).toEqual(['obj-a']);
    expect(result.irrelevant.map((objective) => objective.id)).toEqual(['obj-b', 'obj-c']);
    expect(result.uncompletedIrrelevant.map((objective) => objective.id)).toEqual(['obj-b']);
  });
});
