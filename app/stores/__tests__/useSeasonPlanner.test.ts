import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSeasonPlannerStore } from '@/stores/useSeasonPlanner';
describe('useSeasonPlannerStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });
  describe('modifier data', () => {
    it('assigns the crafting bonuses to Handyman and the experience bonus to Seasoned PMCs', () => {
      const store = useSeasonPlannerStore();
      const handyman = store.allModifiers.find((modifier) => modifier.id === 'handyman');
      const seasonedPmcs = store.allModifiers.find((modifier) => modifier.id === 'seasoned_pmcs');
      expect(handyman?.description).toBe(
        'Item crafting time is reduced by 50%. Crafting skill starts at level 51.'
      );
      expect(seasonedPmcs?.description).toBe('Your character gains 25% more raid experience.');
    });
  });
  describe('toggleModifier', () => {
    it('adds a modifier when not selected', () => {
      const store = useSeasonPlannerStore();
      store.toggleModifier('kappa_protocol');
      expect(store.selectedModifiers).toEqual(['kappa_protocol']);
      expect(store.isSelected('kappa_protocol')).toBe(true);
    });
    it('removes a modifier when already selected', () => {
      const store = useSeasonPlannerStore();
      store.toggleModifier('kappa_protocol');
      store.toggleModifier('kappa_protocol');
      expect(store.selectedModifiers).toEqual([]);
      expect(store.isSelected('kappa_protocol')).toBe(false);
    });
    it('can toggle multiple modifiers independently', () => {
      const store = useSeasonPlannerStore();
      store.toggleModifier('kappa_protocol');
      store.toggleModifier('no_flea_market');
      expect(store.selectedModifiers).toHaveLength(2);
      store.toggleModifier('kappa_protocol');
      expect(store.selectedModifiers).toEqual(['no_flea_market']);
    });
    it('ignores unknown and hardcore modifier IDs', () => {
      const store = useSeasonPlannerStore();
      store.toggleModifier('nonexistent_modifier');
      store.toggleModifier('no_insurance');
      expect(store.selectedModifiers).toEqual([]);
    });
    it('prevents incompatible modifiers from being selected together', () => {
      const store = useSeasonPlannerStore();
      store.toggleModifier('sturdy_bones');
      store.toggleModifier('osteoporosis');
      expect(store.selectedModifiers).toEqual(['sturdy_bones']);
    });
    it('prevents incompatible modifiers regardless of selection order', () => {
      const store = useSeasonPlannerStore();
      store.toggleModifier('osteoporosis');
      store.toggleModifier('sturdy_bones');
      expect(store.selectedModifiers).toEqual(['osteoporosis']);
    });
  });
  describe('totalPoints', () => {
    it('returns 0 when no modifiers are selected', () => {
      const store = useSeasonPlannerStore();
      expect(store.totalPoints).toBe(0);
    });
    it('sums positive modifier costs (negative points)', () => {
      const store = useSeasonPlannerStore();
      store.toggleModifier('kappa_protocol');
      store.toggleModifier('average');
      expect(store.totalPoints).toBe(-31);
    });
    it('sums negative modifier grants (positive points)', () => {
      const store = useSeasonPlannerStore();
      store.toggleModifier('no_flea_market');
      store.toggleModifier('allergic');
      expect(store.totalPoints).toBe(9);
    });
    it('sums mixed positive and negative modifiers', () => {
      const store = useSeasonPlannerStore();
      store.toggleModifier('kappa_protocol');
      store.toggleModifier('no_flea_market');
      store.toggleModifier('allergic');
      expect(store.totalPoints).toBe(-21 + 6 + 3);
    });
  });
  describe('isValid', () => {
    it('is valid when total is exactly 0', () => {
      const store = useSeasonPlannerStore();
      expect(store.isValid).toBe(true);
    });
    it('is valid when total is positive', () => {
      const store = useSeasonPlannerStore();
      store.toggleModifier('no_flea_market');
      expect(store.isValid).toBe(true);
    });
    it('is invalid when total is negative', () => {
      const store = useSeasonPlannerStore();
      store.toggleModifier('kappa_protocol');
      expect(store.isValid).toBe(false);
    });
    it('is valid when positive and negative modifiers balance to 0', () => {
      const store = useSeasonPlannerStore();
      store.toggleModifier('sturdy_bones');
      store.toggleModifier('hemophilia');
      store.toggleModifier('polydipsia');
      expect(store.totalPoints).toBe(-3 + 2 + 1);
      expect(store.isValid).toBe(true);
    });
    it('is invalid when persisted state contains incompatible modifiers', () => {
      const store = useSeasonPlannerStore();
      store.$patch({ selectedModifiers: ['sturdy_bones', 'osteoporosis'] });
      expect(store.totalPoints).toBe(0);
      expect(store.hasConflicts).toBe(true);
      expect(store.isValid).toBe(false);
    });
  });
  describe('hardcore modifier exclusion', () => {
    it('does not include hardcore modifiers in personalModifiers', () => {
      const store = useSeasonPlannerStore();
      const hardcoreIds = store.allModifiers.filter((m) => m.type === 'hardcore').map((m) => m.id);
      expect(hardcoreIds.length).toBeGreaterThan(0);
      for (const id of hardcoreIds) {
        expect(store.personalModifiers.find((m) => m.id === id)).toBeUndefined();
      }
    });
    it('excludes hardcore modifiers from totalPoints even if in selectedModifiers', () => {
      const store = useSeasonPlannerStore();
      store.$patch({ selectedModifiers: ['no_insurance'] });
      expect(store.totalPoints).toBe(0);
      expect(store.selectedModifierObjects).toEqual([]);
    });
  });
  describe('normalizeSelection', () => {
    it('removes stale IDs not in the current modifier set', () => {
      const store = useSeasonPlannerStore();
      store.$patch({
        selectedModifiers: ['kappa_protocol', 'nonexistent_modifier', 'no_flea_market'],
      });
      store.normalizeSelection();
      expect(store.selectedModifiers).toEqual(['kappa_protocol', 'no_flea_market']);
    });
    it('removes hardcore modifier IDs from selection', () => {
      const store = useSeasonPlannerStore();
      store.$patch({ selectedModifiers: ['no_insurance', 'kappa_protocol'] });
      store.normalizeSelection();
      expect(store.selectedModifiers).toEqual(['kappa_protocol']);
    });
    it('removes duplicate and incompatible persisted IDs', () => {
      const store = useSeasonPlannerStore();
      store.$patch({
        selectedModifiers: ['sturdy_bones', 'osteoporosis', 'sturdy_bones'],
      });
      store.normalizeSelection();
      expect(store.selectedModifiers).toEqual(['sturdy_bones']);
    });
    it('removes incompatible modifiers regardless of persisted order', () => {
      const store = useSeasonPlannerStore();
      store.$patch({ selectedModifiers: ['osteoporosis', 'sturdy_bones'] });
      store.normalizeSelection();
      expect(store.selectedModifiers).toEqual(['osteoporosis']);
    });
    it('handles empty selection gracefully', () => {
      const store = useSeasonPlannerStore();
      store.normalizeSelection();
      expect(store.selectedModifiers).toEqual([]);
    });
  });
  describe('reset', () => {
    it('clears all selected modifiers', () => {
      const store = useSeasonPlannerStore();
      store.toggleModifier('kappa_protocol');
      store.toggleModifier('no_flea_market');
      store.reset();
      expect(store.selectedModifiers).toEqual([]);
      expect(store.totalPoints).toBe(0);
      expect(store.isValid).toBe(true);
    });
  });
  describe('isSelected', () => {
    it('returns true for selected modifiers', () => {
      const store = useSeasonPlannerStore();
      store.toggleModifier('kappa_protocol');
      expect(store.isSelected('kappa_protocol')).toBe(true);
    });
    it('returns false for unselected modifiers', () => {
      const store = useSeasonPlannerStore();
      expect(store.isSelected('kappa_protocol')).toBe(false);
    });
  });
});
