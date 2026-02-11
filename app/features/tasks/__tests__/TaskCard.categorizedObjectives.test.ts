import { describe, expect, it } from 'vitest';
import { MAP_OBJECTIVE_TYPES, isMapObjectiveType } from '@/features/tasks/taskObjectiveTypes';
import type { TaskObjective } from '@/types/tarkov';
/**
 * Factory to create mock objectives for testing
 */
const createObjective = (
  id: string,
  type: string,
  maps: Array<{ id: string }> = []
): TaskObjective => ({
  id,
  type,
  maps: maps.length > 0 ? maps : undefined,
  count: 1,
});
interface CategorizedObjectivesOptions {
  objectives: TaskObjective[];
  onMapView: boolean;
  selectedMapId: string | null;
  completedObjectiveIds: Set<string>;
}
/**
 * Recreates the categorizedObjectives logic for testing
 */
const computeCategorizedObjectives = (options: CategorizedObjectivesOptions) => {
  const { objectives, onMapView, selectedMapId, completedObjectiveIds } = options;
  // If not in map view, all objectives are relevant
  if (!onMapView) {
    return {
      relevant: objectives,
      irrelevant: [] as TaskObjective[],
      uncompletedIrrelevant: [] as TaskObjective[],
    };
  }
  const relevant: TaskObjective[] = [];
  const irrelevant: TaskObjective[] = [];
  const uncompletedIrrelevant: TaskObjective[] = [];
  for (const objective of objectives) {
    const hasMaps = Array.isArray(objective.maps) && objective.maps.length > 0;
    const onSelectedMap =
      hasMaps && selectedMapId && objective.maps!.some((map) => map.id === selectedMapId);
    const isMapType = isMapObjectiveType(objective.type);
    // Objective is relevant if it has no maps, or is on selected map AND is a map type
    const isRelevant = !hasMaps || (onSelectedMap && isMapType);
    if (isRelevant) {
      relevant.push(objective);
    } else {
      irrelevant.push(objective);
      // Check if this irrelevant objective is also uncompleted
      if (!completedObjectiveIds.has(objective.id)) {
        uncompletedIrrelevant.push(objective);
      }
    }
  }
  return { relevant, irrelevant, uncompletedIrrelevant };
};
describe('TaskCard categorizedObjectives', () => {
  describe('non-map view', () => {
    it('returns all objectives as relevant when not in map view', () => {
      const objectives = [
        createObjective('obj-1', 'giveItem'),
        createObjective('obj-2', 'mark', [{ id: 'map-customs' }]),
        createObjective('obj-3', 'visit', [{ id: 'map-woods' }]),
      ];
      const result = computeCategorizedObjectives({
        objectives,
        onMapView: false,
        selectedMapId: 'map-customs',
        completedObjectiveIds: new Set(),
      });
      expect(result.relevant).toHaveLength(3);
      expect(result.irrelevant).toHaveLength(0);
      expect(result.uncompletedIrrelevant).toHaveLength(0);
    });
    it('includes completed objectives as relevant in non-map view', () => {
      const objectives = [
        createObjective('obj-1', 'mark', [{ id: 'map-customs' }]),
        createObjective('obj-2', 'mark', [{ id: 'map-woods' }]),
      ];
      const result = computeCategorizedObjectives({
        objectives,
        onMapView: false,
        selectedMapId: null,
        completedObjectiveIds: new Set(['obj-1']),
      });
      expect(result.relevant).toHaveLength(2);
      expect(result.relevant).toContainEqual(expect.objectContaining({ id: 'obj-1' }));
      expect(result.relevant).toContainEqual(expect.objectContaining({ id: 'obj-2' }));
    });
  });
  describe('map view with objectives that have no maps', () => {
    it('treats objectives without maps as relevant', () => {
      const objectives = [
        createObjective('obj-1', 'giveItem'), // No maps
        createObjective('obj-2', 'buildWeapon'), // No maps
        createObjective('obj-3', 'mark', [{ id: 'map-customs' }]), // Has maps
      ];
      const result = computeCategorizedObjectives({
        objectives,
        onMapView: true,
        selectedMapId: 'map-woods', // Different map selected
        completedObjectiveIds: new Set(),
      });
      expect(result.relevant).toHaveLength(2);
      expect(result.relevant).toContainEqual(expect.objectContaining({ id: 'obj-1' }));
      expect(result.relevant).toContainEqual(expect.objectContaining({ id: 'obj-2' }));
      expect(result.irrelevant).toHaveLength(1);
      expect(result.irrelevant[0]!.id).toBe('obj-3');
    });
  });
  describe('map view with objectives on selected map vs other maps', () => {
    it('marks objectives on selected map as relevant when they are map types', () => {
      const objectives = [
        createObjective('obj-1', 'mark', [{ id: 'map-customs' }]), // On selected map
        createObjective('obj-2', 'visit', [{ id: 'map-customs' }]), // On selected map
        createObjective('obj-3', 'mark', [{ id: 'map-woods' }]), // Different map
        createObjective('obj-4', 'zone', [{ id: 'map-factory' }]), // Different map
      ];
      const result = computeCategorizedObjectives({
        objectives,
        onMapView: true,
        selectedMapId: 'map-customs',
        completedObjectiveIds: new Set(),
      });
      expect(result.relevant).toHaveLength(2);
      expect(result.relevant).toContainEqual(expect.objectContaining({ id: 'obj-1' }));
      expect(result.relevant).toContainEqual(expect.objectContaining({ id: 'obj-2' }));
      expect(result.irrelevant).toHaveLength(2);
      expect(result.irrelevant).toContainEqual(expect.objectContaining({ id: 'obj-3' }));
      expect(result.irrelevant).toContainEqual(expect.objectContaining({ id: 'obj-4' }));
    });
    it('handles objectives on multiple maps correctly', () => {
      const objectives = [
        createObjective('obj-1', 'mark', [{ id: 'map-customs' }, { id: 'map-woods' }]),
        createObjective('obj-2', 'visit', [{ id: 'map-factory' }, { id: 'map-reserve' }]),
      ];
      const result = computeCategorizedObjectives({
        objectives,
        onMapView: true,
        selectedMapId: 'map-customs',
        completedObjectiveIds: new Set(),
      });
      expect(result.relevant).toHaveLength(1);
      expect(result.relevant[0]!.id).toBe('obj-1');
      expect(result.irrelevant).toHaveLength(1);
      expect(result.irrelevant[0]!.id).toBe('obj-2');
    });
  });
  describe('objectives with types in MAP_OBJECTIVE_TYPES vs not', () => {
    it('only marks map-type objectives on selected map as relevant', () => {
      const objectives = [
        createObjective('obj-1', 'mark', [{ id: 'map-customs' }]), // Map type
        createObjective('obj-2', 'zone', [{ id: 'map-customs' }]), // Map type
        createObjective('obj-3', 'giveItem', [{ id: 'map-customs' }]), // NOT map type (even though on map)
        createObjective('obj-4', 'buildWeapon', [{ id: 'map-customs' }]), // NOT map type (non-location)
      ];
      const result = computeCategorizedObjectives({
        objectives,
        onMapView: true,
        selectedMapId: 'map-customs',
        completedObjectiveIds: new Set(),
      });
      // obj-1, obj-2 are map types on selected map = relevant
      // obj-3, obj-4 have maps but are not map types = irrelevant
      expect(result.relevant).toHaveLength(2);
      expect(result.relevant).toContainEqual(expect.objectContaining({ id: 'obj-1' }));
      expect(result.relevant).toContainEqual(expect.objectContaining({ id: 'obj-2' }));
      expect(result.irrelevant).toHaveLength(2);
      expect(result.irrelevant).toContainEqual(expect.objectContaining({ id: 'obj-3' }));
      expect(result.irrelevant).toContainEqual(expect.objectContaining({ id: 'obj-4' }));
    });
    it('handles all MAP_OBJECTIVE_TYPES correctly', () => {
      const objectives = MAP_OBJECTIVE_TYPES.map((type, i) =>
        createObjective(`obj-${i}`, type, [{ id: 'map-customs' }])
      );
      const result = computeCategorizedObjectives({
        objectives,
        onMapView: true,
        selectedMapId: 'map-customs',
        completedObjectiveIds: new Set(),
      });
      expect(result.relevant).toHaveLength(MAP_OBJECTIVE_TYPES.length);
      expect(result.irrelevant).toHaveLength(0);
    });
    it('treats useItem objectives on selected map as relevant', () => {
      const objectives = [createObjective('obj-1', 'useItem', [{ id: 'map-customs' }])];
      const result = computeCategorizedObjectives({
        objectives,
        onMapView: true,
        selectedMapId: 'map-customs',
        completedObjectiveIds: new Set(),
      });
      expect(result.relevant).toContainEqual(expect.objectContaining({ id: 'obj-1' }));
      expect(result.irrelevant).toHaveLength(0);
    });
    it('treats non-map-type objectives with maps as irrelevant', () => {
      const nonMapTypes = ['giveItem', 'level', 'skill', 'traderLevel'];
      const objectives = nonMapTypes.map((type, i) =>
        createObjective(`obj-${i}`, type, [{ id: 'map-customs' }])
      );
      const result = computeCategorizedObjectives({
        objectives,
        onMapView: true,
        selectedMapId: 'map-customs',
        completedObjectiveIds: new Set(),
      });
      expect(result.relevant).toHaveLength(0);
      expect(result.irrelevant).toHaveLength(nonMapTypes.length);
    });
  });
  describe('completion tracking for irrelevant objectives', () => {
    it('tracks uncompleted irrelevant objectives separately', () => {
      const objectives = [
        createObjective('obj-1', 'mark', [{ id: 'map-woods' }]), // Completed irrelevant
        createObjective('obj-2', 'visit', [{ id: 'map-factory' }]), // Uncompleted irrelevant
        createObjective('obj-3', 'zone', [{ id: 'map-reserve' }]), // Uncompleted irrelevant
      ];
      const result = computeCategorizedObjectives({
        objectives,
        onMapView: true,
        selectedMapId: 'map-customs',
        completedObjectiveIds: new Set(['obj-1']), // obj-1 is completed
      });
      expect(result.irrelevant).toHaveLength(3);
      expect(result.uncompletedIrrelevant).toHaveLength(2);
      expect(result.uncompletedIrrelevant).toContainEqual(expect.objectContaining({ id: 'obj-2' }));
      expect(result.uncompletedIrrelevant).toContainEqual(expect.objectContaining({ id: 'obj-3' }));
      expect(result.uncompletedIrrelevant).not.toContainEqual(
        expect.objectContaining({ id: 'obj-1' })
      );
    });
    it('returns empty uncompletedIrrelevant when all irrelevant objectives are completed', () => {
      const objectives = [
        createObjective('obj-1', 'mark', [{ id: 'map-woods' }]),
        createObjective('obj-2', 'visit', [{ id: 'map-factory' }]),
      ];
      const result = computeCategorizedObjectives({
        objectives,
        onMapView: true,
        selectedMapId: 'map-customs',
        completedObjectiveIds: new Set(['obj-1', 'obj-2']),
      });
      expect(result.irrelevant).toHaveLength(2);
      expect(result.uncompletedIrrelevant).toHaveLength(0);
    });
    it('does not track completed status for relevant objectives', () => {
      const objectives = [
        createObjective('obj-1', 'mark', [{ id: 'map-customs' }]), // Relevant and completed
        createObjective('obj-2', 'visit', [{ id: 'map-customs' }]), // Relevant and uncompleted
      ];
      const result = computeCategorizedObjectives({
        objectives,
        onMapView: true,
        selectedMapId: 'map-customs',
        completedObjectiveIds: new Set(['obj-1']),
      });
      expect(result.relevant).toHaveLength(2);
      expect(result.irrelevant).toHaveLength(0);
      expect(result.uncompletedIrrelevant).toHaveLength(0);
    });
  });
  describe('edge cases', () => {
    it('handles empty objectives array', () => {
      const result = computeCategorizedObjectives({
        objectives: [],
        onMapView: true,
        selectedMapId: 'map-customs',
        completedObjectiveIds: new Set(),
      });
      expect(result.relevant).toHaveLength(0);
      expect(result.irrelevant).toHaveLength(0);
      expect(result.uncompletedIrrelevant).toHaveLength(0);
    });
    it('handles null selectedMapId in map view', () => {
      const objectives = [
        createObjective('obj-1', 'mark', [{ id: 'map-customs' }]),
        createObjective('obj-2', 'giveItem'),
      ];
      const result = computeCategorizedObjectives({
        objectives,
        onMapView: true,
        selectedMapId: null,
        completedObjectiveIds: new Set(),
      });
      // With no selected map, objectives with maps are irrelevant, without maps are relevant
      expect(result.relevant).toHaveLength(1);
      expect(result.relevant[0]!.id).toBe('obj-2');
      expect(result.irrelevant).toHaveLength(1);
      expect(result.irrelevant[0]!.id).toBe('obj-1');
    });
    it('handles objectives with empty maps array', () => {
      const objective: TaskObjective = {
        id: 'obj-1',
        type: 'mark',
        maps: [],
        count: 1,
      };
      const result = computeCategorizedObjectives({
        objectives: [objective],
        onMapView: true,
        selectedMapId: 'map-customs',
        completedObjectiveIds: new Set(),
      });
      // Empty maps array means hasMaps is false, so objective is relevant
      expect(result.relevant).toHaveLength(1);
    });
    it('handles objectives with undefined type', () => {
      const objective: TaskObjective = {
        id: 'obj-1',
        type: undefined,
        maps: [{ id: 'map-customs' }],
        count: 1,
      };
      const result = computeCategorizedObjectives({
        objectives: [objective],
        onMapView: true,
        selectedMapId: 'map-customs',
        completedObjectiveIds: new Set(),
      });
      // Undefined type is not in MAP_OBJECTIVE_TYPES, so even on selected map it's irrelevant
      expect(result.irrelevant).toHaveLength(1);
    });
  });
});
