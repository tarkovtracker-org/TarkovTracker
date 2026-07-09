import { defineStore } from 'pinia';
import seasonalModifiersData from '@/data/seasonal-modifiers.json';
import type { SeasonalModifier, SeasonPlannerState } from '@/types/season';
export const useSeasonPlannerStore = defineStore('seasonPlanner', {
  state: (): SeasonPlannerState => ({
    selectedModifiers: [],
  }),
  getters: {
    allModifiers: () => seasonalModifiersData.modifiers as SeasonalModifier[],
    selectedModifierObjects(state): SeasonalModifier[] {
      return this.allModifiers.filter((m) => state.selectedModifiers.includes(m.id));
    },
    totalPoints(): number {
      return this.selectedModifierObjects.reduce((acc, m) => acc + (m.points || 0), 0);
    },
    isValid(): boolean {
      return this.totalPoints >= 0;
    },
  },
  actions: {
    toggleModifier(id: string) {
      const index = this.selectedModifiers.indexOf(id);
      if (index > -1) {
        this.selectedModifiers.splice(index, 1);
      } else {
        this.selectedModifiers.push(id);
      }
    },
    reset() {
      this.selectedModifiers = [];
    },
  },
  persist: true,
});
