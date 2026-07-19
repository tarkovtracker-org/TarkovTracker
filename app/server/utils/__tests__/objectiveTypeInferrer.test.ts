import { describe, expect, it } from 'vitest';
import { inferObjectiveType } from '@/server/utils/objectiveTypeInferrer';
describe('objectiveTypeInferrer', () => {
  it('prefers composite prefix matches over shorter prefixes', () => {
    expect(inferObjectiveType({ description: 'Find and hand over the item' })).toBe('giveItem');
    expect(inferObjectiveType({ description: 'Find the item' })).toBe('findItem');
  });
  it('maps known prefixes to expected objective types', () => {
    const cases: Array<[string, string]> = [
      ['Hand over the item', 'giveItem'],
      ['Launch the flare', 'useItem'],
      ['Locate the convoy', 'visit'],
      ['Mark the objective', 'mark'],
      ['Eat the snack', 'useItem'],
    ];
    for (const [description, expected] of cases) {
      expect(inferObjectiveType({ description })).toBe(expected);
    }
  });
  it('returns undefined for empty string description', () => {
    expect(inferObjectiveType({ description: '' })).toBeUndefined();
  });
  it('returns undefined for undefined description', () => {
    expect(inferObjectiveType({ description: undefined })).toBeUndefined();
  });
  it('returns undefined for descriptions that match no known prefix', () => {
    expect(inferObjectiveType({ description: 'Random text with no match' })).toBeUndefined();
    expect(inferObjectiveType({ description: 'xyz123 unknown prefix' })).toBeUndefined();
  });
  it('handles leading, trailing, and multiple spaces', () => {
    expect(inferObjectiveType({ description: '  Find the item  ' })).toBe('findItem');
    expect(inferObjectiveType({ description: 'Find   the item' })).toBe('findItem');
  });
  it('handles different casing in descriptions', () => {
    expect(inferObjectiveType({ description: 'FIND the item' })).toBe('findItem');
    expect(inferObjectiveType({ description: 'find THE ITEM' })).toBe('findItem');
    expect(inferObjectiveType({ description: 'FiNd AnD hAnD oVeR the item' })).toBe('giveItem');
  });
  it('handles very long description strings without crashing', () => {
    const longDescription = 'Find the item ' + 'a'.repeat(10000);
    expect(() => inferObjectiveType({ description: longDescription })).not.toThrow();
    expect(inferObjectiveType({ description: longDescription })).toBe('findItem');
  });
});
