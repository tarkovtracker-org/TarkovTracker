import { describe, expect, it } from 'vitest';
import { getSkillCategory, sortSkillsByGameOrder } from '@/utils/constants';
describe('constants', () => {
  describe('sortSkillsByGameOrder', () => {
    it('sorts Endurance first in in-game order', () => {
      const skills = [
        { id: 'Strength', name: 'Strength' },
        { id: 'Endurance', name: 'Endurance' },
        { id: 'Vitality', name: 'Vitality' },
      ];
      const sorted = sortSkillsByGameOrder(skills);
      expect(sorted.map((skill) => skill.id)).toEqual(['Endurance', 'Strength', 'Vitality']);
    });
    it('places unknown skills at the end alphabetically', () => {
      const skills = [
        { id: 'Strength', name: 'Strength' },
        { id: 'MyUnknownB', name: 'My Unknown B' },
        { id: 'MyUnknownA', name: 'My Unknown A' },
      ];
      const sorted = sortSkillsByGameOrder(skills);
      expect(sorted.map((skill) => skill.id)).toEqual(['Strength', 'MyUnknownA', 'MyUnknownB']);
    });
  });
  describe('getSkillCategory', () => {
    it('maps known skills to their in-game group', () => {
      expect(getSkillCategory({ id: 'Endurance' })).toBe('physical');
      expect(getSkillCategory({ id: 'Charisma' })).toBe('mental');
      expect(getSkillCategory({ id: 'DMR' })).toBe('combat');
      expect(getSkillCategory({ id: 'HideoutManagement' })).toBe('practical');
    });
    it('falls back to the key when the id is missing', () => {
      expect(getSkillCategory({ key: 'Surgery' })).toBe('practical');
    });
    it('places unknown skills in other', () => {
      expect(getSkillCategory({ id: 'BearAksystems' })).toBe('other');
      expect(getSkillCategory({ id: 'toString' })).toBe('other');
      expect(getSkillCategory({})).toBe('other');
    });
  });
});
