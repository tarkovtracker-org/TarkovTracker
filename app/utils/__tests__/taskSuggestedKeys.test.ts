import { describe, expect, it } from 'vitest';
import { buildSuggestedKeysFromObjectives } from '@/utils/taskSuggestedKeys';
import type { TaskObjective, TarkovItem } from '@/types/tarkov';
const createItem = (id: string, name = id): TarkovItem => ({
  id,
  name,
});
const createObjective = (overrides: Partial<TaskObjective> = {}): TaskObjective => ({
  id: 'objective-1',
  maps: [{ id: 'customs', name: 'Customs' }],
  requiredKeys: [[createItem('key-1', 'Dorm 206')]],
  ...overrides,
});
describe('buildSuggestedKeysFromObjectives', () => {
  it('returns empty array when objectives are missing', () => {
    expect(buildSuggestedKeysFromObjectives(undefined)).toEqual([]);
  });
  it('builds one suggested entry per objective key set', () => {
    const objective = createObjective({
      requiredKeys: [[createItem('key-1'), createItem('key-2')], [createItem('key-3')]],
    });
    const suggestedKeys = buildSuggestedKeysFromObjectives([objective]);
    expect(suggestedKeys).toHaveLength(1);
    expect(suggestedKeys[0]!.keys.map((item) => item.id)).toEqual(['key-1', 'key-2', 'key-3']);
  });
  it('keeps objective alternatives as one "one-of" group', () => {
    const objective = createObjective({
      requiredKeys: [[createItem('key-1')], [createItem('key-2')]],
    });
    const suggestedKeys = buildSuggestedKeysFromObjectives([objective]);
    expect(suggestedKeys).toHaveLength(1);
    expect(suggestedKeys[0]!.keys.map((item) => item.id)).toEqual(['key-1', 'key-2']);
  });
  it('dedupes repeated key groups on the same map set', () => {
    const firstObjective = createObjective({
      id: 'objective-a',
      requiredKeys: [[createItem('key-1'), createItem('key-1'), createItem('key-2')]],
    });
    const secondObjective = createObjective({
      id: 'objective-b',
      requiredKeys: [[createItem('key-2'), createItem('key-1')]],
    });
    const suggestedKeys = buildSuggestedKeysFromObjectives([firstObjective, secondObjective]);
    expect(suggestedKeys).toHaveLength(1);
    expect(suggestedKeys[0]!.keys.map((item) => item.id)).toEqual(['key-1', 'key-2']);
  });
  it('merges keys from multiple required objectives on the same map', () => {
    const firstObjective = createObjective({
      id: 'objective-a',
      requiredKeys: [[createItem('key-1')]],
    });
    const secondObjective = createObjective({
      id: 'objective-b',
      requiredKeys: [[createItem('key-2')]],
    });
    const suggestedKeys = buildSuggestedKeysFromObjectives([firstObjective, secondObjective]);
    expect(suggestedKeys).toHaveLength(1);
    expect(suggestedKeys[0]!.keys.map((item) => item.id)).toEqual(['key-1', 'key-2']);
  });
  it('marks key groups as optional when objective is optional', () => {
    const optionalObjective = createObjective({
      id: 'optional-objective',
      optional: true,
      requiredKeys: [[createItem('key-1')]],
    });
    const suggestedKeys = buildSuggestedKeysFromObjectives([optionalObjective]);
    expect(suggestedKeys).toHaveLength(1);
    expect(suggestedKeys[0]!.optional).toBe(true);
  });
  it('keeps groups required when shared by required and optional objectives', () => {
    const requiredObjective = createObjective({
      id: 'required-objective',
      optional: false,
      requiredKeys: [[createItem('key-1')]],
    });
    const optionalObjective = createObjective({
      id: 'optional-objective',
      optional: true,
      requiredKeys: [[createItem('key-1')]],
    });
    const suggestedKeys = buildSuggestedKeysFromObjectives([optionalObjective, requiredObjective]);
    expect(suggestedKeys).toHaveLength(1);
    expect(suggestedKeys[0]!.optional).toBe(false);
  });
  it('sorts required key groups before optional groups', () => {
    const optionalObjective = createObjective({
      id: 'optional-objective',
      optional: true,
      requiredKeys: [[createItem('key-2')]],
    });
    const requiredObjective = createObjective({
      id: 'required-objective',
      optional: false,
      requiredKeys: [[createItem('key-1')]],
    });
    const suggestedKeys = buildSuggestedKeysFromObjectives([optionalObjective, requiredObjective]);
    expect(suggestedKeys).toHaveLength(2);
    expect(suggestedKeys[0]!.keys.map((item) => item.id)).toEqual(['key-1']);
    expect(suggestedKeys[1]!.keys.map((item) => item.id)).toEqual(['key-2']);
    expect(suggestedKeys[1]!.optional).toBe(true);
  });
  it('keeps identical key groups when objectives are on different maps', () => {
    const customsObjective = createObjective({
      id: 'objective-customs',
      maps: [{ id: 'customs', name: 'Customs' }],
      requiredKeys: [[createItem('key-1')]],
    });
    const woodsObjective = createObjective({
      id: 'objective-woods',
      maps: [{ id: 'woods', name: 'Woods' }],
      requiredKeys: [[createItem('key-1')]],
    });
    const suggestedKeys = buildSuggestedKeysFromObjectives([customsObjective, woodsObjective]);
    expect(suggestedKeys).toHaveLength(2);
    expect(suggestedKeys.map((group) => group.maps?.[0]?.id)).toEqual(['customs', 'woods']);
  });
  it('retains all objective maps for map context', () => {
    const objective = createObjective({
      maps: [
        { id: 'factory4_day', name: 'Factory' },
        { id: 'factory4_night', name: 'Factory (Night)' },
      ],
      requiredKeys: [[createItem('key-1')]],
    });
    const suggestedKeys = buildSuggestedKeysFromObjectives([objective]);
    expect(suggestedKeys[0]!.maps).toEqual([
      { id: 'factory4_day', name: 'Factory' },
      { id: 'factory4_night', name: 'Factory (Night)' },
    ]);
  });
});
