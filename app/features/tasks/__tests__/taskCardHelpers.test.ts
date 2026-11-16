import { describe, expect, it, vi } from 'vitest';
import {
  categorizeObjectivesForMapView,
  resolveSelectedMapIds,
  resolveTaskObjectives,
} from '@/features/tasks/taskCardHelpers';
import type { Task, TaskObjective } from '@/types/tarkov';
const createObjective = (
  id: string,
  type: TaskObjective['type'],
  maps?: Array<{ id: string }>
): TaskObjective => ({ id, type, maps, count: 1 });
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
  it('keeps every objective in input order outside map view, regardless of completion', () => {
    const objectives = [
      createObjective('handover', 'giveItem'),
      createObjective('woods', 'mark', [{ id: 'woods' }]),
      createObjective('customs', 'visit', [{ id: 'customs' }]),
    ];
    const isObjectiveComplete = vi.fn(() => true);
    expect(
      categorizeObjectivesForMapView({
        isMapView: false,
        isObjectiveComplete,
        mapIds: ['woods'],
        objectives,
      })
    ).toEqual({ relevant: objectives, irrelevant: [], uncompletedIrrelevant: [] });
    expect(isObjectiveComplete).not.toHaveBeenCalled();
  });
  it.each([
    'mark',
    'zone',
    'extract',
    'visit',
    'findItem',
    'findQuestItem',
    'plantItem',
    'plantQuestItem',
    'shoot',
    'useItem',
    'place',
  ])('keeps %s objectives on any selected map relevant even when complete', (type) => {
    const objective = createObjective('selected', type, [{ id: 'factory' }, { id: 'woods' }]);
    expect(
      categorizeObjectivesForMapView({
        isMapView: true,
        isObjectiveComplete: () => true,
        mapIds: ['customs', 'woods'],
        objectives: [objective],
      })
    ).toEqual({ relevant: [objective], irrelevant: [], uncompletedIrrelevant: [] });
  });
  it.each(['giveItem', 'buildWeapon', 'level', 'skill', 'traderLevel', undefined])(
    'keeps %s objectives with maps irrelevant even on the selected map',
    (type) => {
      const objective = createObjective('non-location', type, [{ id: 'woods' }]);
      expect(
        categorizeObjectivesForMapView({
          isMapView: true,
          isObjectiveComplete: () => false,
          mapIds: ['woods'],
          objectives: [objective],
        })
      ).toEqual({ relevant: [], irrelevant: [objective], uncompletedIrrelevant: [objective] });
    }
  );
  it('keeps mapless objectives relevant with no selected map and preserves incomplete ordering', () => {
    const objectives = [
      createObjective('pending-a', 'visit', [{ id: 'woods' }]),
      createObjective('mapless', 'giveItem'),
      createObjective('complete', 'mark', [{ id: 'customs' }]),
      createObjective('empty-maps', 'visit', []),
      createObjective('pending-b', 'zone', [{ id: 'factory' }]),
    ];
    const result = categorizeObjectivesForMapView({
      isMapView: true,
      isObjectiveComplete: (id) => id === 'complete',
      mapIds: [],
      objectives,
    });
    expect(result.relevant.map(({ id }) => id)).toEqual(['mapless', 'empty-maps']);
    expect(result.irrelevant.map(({ id }) => id)).toEqual(['pending-a', 'complete', 'pending-b']);
    expect(result.uncompletedIrrelevant.map(({ id }) => id)).toEqual(['pending-a', 'pending-b']);
  });
  it.each([{ maps: undefined }, { maps: [] }])(
    'keeps mapless objectives relevant with a selected map ($maps)',
    ({ maps }) => {
      const objective = createObjective('mapless', 'giveItem', maps);
      expect(
        categorizeObjectivesForMapView({
          isMapView: true,
          isObjectiveComplete: () => false,
          mapIds: ['woods'],
          objectives: [objective],
        })
      ).toEqual({ relevant: [objective], irrelevant: [], uncompletedIrrelevant: [] });
    }
  );
  it('categorizes objectives on merged map variants using the resolved selection', () => {
    const objective = createObjective('night', 'shoot', [{ id: 'streets_night' }]);
    const mapIds = resolveSelectedMapIds('streets', [
      { id: 'streets', mergedIds: ['streets', 'streets_night'] },
    ]);
    expect(
      categorizeObjectivesForMapView({
        isMapView: true,
        isObjectiveComplete: () => false,
        mapIds,
        objectives: [objective],
      })
    ).toEqual({ relevant: [objective], irrelevant: [], uncompletedIrrelevant: [] });
  });
  it('has no incomplete objectives when every irrelevant objective is complete', () => {
    const objective = createObjective('complete', 'mark', [{ id: 'woods' }]);
    expect(
      categorizeObjectivesForMapView({
        isMapView: true,
        isObjectiveComplete: () => true,
        mapIds: ['customs'],
        objectives: [objective],
      })
    ).toEqual({ relevant: [], irrelevant: [objective], uncompletedIrrelevant: [] });
  });
  it('returns empty categories for an empty objective list', () => {
    expect(
      categorizeObjectivesForMapView({
        isMapView: true,
        isObjectiveComplete: () => false,
        mapIds: ['woods'],
        objectives: [],
      })
    ).toEqual({ relevant: [], irrelevant: [], uncompletedIrrelevant: [] });
  });
});
