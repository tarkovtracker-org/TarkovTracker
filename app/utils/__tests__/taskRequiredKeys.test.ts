import { describe, expect, it } from 'vitest';
import { buildRequiredKeysFromObjectives } from '@/utils/taskRequiredKeys';
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
describe('buildRequiredKeysFromObjectives', () => {
  it('returns empty array when objectives are missing', () => {
    expect(buildRequiredKeysFromObjectives(undefined)).toEqual([]);
  });
  it('builds one required entry per objective key group', () => {
    const objective = createObjective({
      requiredKeys: [[createItem('key-1'), createItem('key-2')], [createItem('key-3')]],
    });
    const requiredKeys = buildRequiredKeysFromObjectives([objective]);
    expect(requiredKeys).toHaveLength(2);
    expect(requiredKeys[0]!.keys.map((item) => item.id)).toEqual(['key-1', 'key-2']);
    expect(requiredKeys[0]!.anyOf).toBe(true);
    expect(requiredKeys[1]!.keys.map((item) => item.id)).toEqual(['key-3']);
    expect(requiredKeys[1]!.anyOf).toBe(false);
  });
  it('keeps separate non-anyOf groups for multi-group single-key requirements', () => {
    const objective = createObjective({
      requiredKeys: [[createItem('key-1')], [createItem('key-2')]],
    });
    const requiredKeys = buildRequiredKeysFromObjectives([objective]);
    expect(requiredKeys).toHaveLength(2);
    expect(requiredKeys[0]!.keys.map((item) => item.id)).toEqual(['key-1']);
    expect(requiredKeys[0]!.anyOf).toBe(false);
    expect(requiredKeys[1]!.keys.map((item) => item.id)).toEqual(['key-2']);
    expect(requiredKeys[1]!.anyOf).toBe(false);
  });
  it('marks single-group alternatives as one-of', () => {
    const objective = createObjective({
      requiredKeys: [[createItem('key-1'), createItem('key-2')]],
    });
    const requiredKeys = buildRequiredKeysFromObjectives([objective]);
    expect(requiredKeys).toHaveLength(1);
    expect(requiredKeys[0]!.keys.map((item) => item.id)).toEqual(['key-1', 'key-2']);
    expect(requiredKeys[0]!.anyOf).toBe(true);
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
    const requiredKeys = buildRequiredKeysFromObjectives([firstObjective, secondObjective]);
    expect(requiredKeys).toHaveLength(1);
    expect(requiredKeys[0]!.keys.map((item) => item.id)).toEqual(['key-1', 'key-2']);
  });
  it('keeps separate key groups for separate required objectives on the same map', () => {
    const firstObjective = createObjective({
      id: 'objective-a',
      requiredKeys: [[createItem('key-1')]],
    });
    const secondObjective = createObjective({
      id: 'objective-b',
      requiredKeys: [[createItem('key-2')]],
    });
    const requiredKeys = buildRequiredKeysFromObjectives([firstObjective, secondObjective]);
    expect(requiredKeys).toHaveLength(2);
    expect(requiredKeys[0]!.keys.map((item) => item.id)).toEqual(['key-1']);
    expect(requiredKeys[1]!.keys.map((item) => item.id)).toEqual(['key-2']);
    expect(requiredKeys.every((group) => group.anyOf !== true)).toBe(true);
  });
  it('marks key groups as optional when objective is optional', () => {
    const optionalObjective = createObjective({
      id: 'optional-objective',
      optional: true,
      requiredKeys: [[createItem('key-1')]],
    });
    const requiredKeys = buildRequiredKeysFromObjectives([optionalObjective]);
    expect(requiredKeys).toHaveLength(1);
    expect(requiredKeys[0]!.optional).toBe(true);
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
    const requiredKeys = buildRequiredKeysFromObjectives([optionalObjective, requiredObjective]);
    expect(requiredKeys).toHaveLength(1);
    expect(requiredKeys[0]!.optional).toBe(false);
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
    const requiredKeys = buildRequiredKeysFromObjectives([optionalObjective, requiredObjective]);
    expect(requiredKeys).toHaveLength(2);
    expect(requiredKeys[0]!.keys.map((item) => item.id)).toEqual(['key-1']);
    expect(requiredKeys[1]!.keys.map((item) => item.id)).toEqual(['key-2']);
    expect(requiredKeys[1]!.optional).toBe(true);
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
    const requiredKeys = buildRequiredKeysFromObjectives([customsObjective, woodsObjective]);
    expect(requiredKeys).toHaveLength(2);
    expect(requiredKeys.map((group) => group.maps?.[0]?.id)).toEqual(['customs', 'woods']);
  });
  it('retains all objective maps for map context', () => {
    const objective = createObjective({
      maps: [
        { id: 'factory4_day', name: 'Factory' },
        { id: 'factory4_night', name: 'Factory (Night)' },
      ],
      requiredKeys: [[createItem('key-1')]],
    });
    const requiredKeys = buildRequiredKeysFromObjectives([objective]);
    expect(requiredKeys[0]!.maps).toEqual([
      { id: 'factory4_day', name: 'Factory' },
      { id: 'factory4_night', name: 'Factory (Night)' },
    ]);
  });
  it('does not collapse multiple required objectives into a one-of group', () => {
    const objectives = [
      createObjective({
        id: 'objective-1',
        requiredKeys: [[createItem('rb-ob')]],
      }),
      createObjective({
        id: 'objective-2',
        requiredKeys: [[createItem('rb-orb1')]],
      }),
      createObjective({
        id: 'objective-3',
        requiredKeys: [[createItem('rb-orb2')]],
      }),
      createObjective({
        id: 'objective-4',
        requiredKeys: [[createItem('rb-orb3')]],
      }),
    ];
    const requiredKeys = buildRequiredKeysFromObjectives(objectives);
    expect(requiredKeys).toHaveLength(4);
    expect(requiredKeys.map((group) => group.keys[0]!.id)).toEqual([
      'rb-ob',
      'rb-orb1',
      'rb-orb2',
      'rb-orb3',
    ]);
    expect(requiredKeys.every((group) => group.anyOf !== true)).toBe(true);
  });
});
