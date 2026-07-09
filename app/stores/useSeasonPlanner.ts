import { defineStore } from 'pinia';
import { seasonalModifiers } from '@/data/seasonal-modifiers';
import type { PersonalModifier, SeasonPlannerState } from '@/types/season';
export const useSeasonPlannerStore = defineStore('seasonPlanner', {
  state: (): SeasonPlannerState => ({
    selectedModifiers: [],
  }),
  getters: {
    allModifiers: () => seasonalModifiers,
    personalModifiers: () =>
      seasonalModifiers.filter(
        (m): m is PersonalModifier => m.type === 'positive' || m.type === 'negative'
      ),
    selectedModifierObjects(state): PersonalModifier[] {
      const knownIds = new Set(this.personalModifiers.map((m) => m.id));
      return state.selectedModifiers
        .filter((id) => knownIds.has(id))
        .map((id) => this.personalModifiers.find((m) => m.id === id))
        .filter((m): m is PersonalModifier => Boolean(m));
    },
    totalPoints(): number {
      return this.selectedModifierObjects.reduce((acc, m) => acc + (m.points ?? 0), 0);
    },
    isValid(): boolean {
      return this.totalPoints >= 0;
    },
  },
  actions: {
    isSelected(id: string): boolean {
      return this.selectedModifiers.includes(id);
    },
    toggleModifier(id: string) {
      const index = this.selectedModifiers.indexOf(id);
      if (index > -1) {
        this.selectedModifiers.splice(index, 1);
      } else {
        this.selectedModifiers.push(id);
      }
    },
    normalizeSelection() {
      const knownIds = new Set(this.personalModifiers.map((m) => m.id));
      this.selectedModifiers = this.selectedModifiers.filter((id) => knownIds.has(id));
    },
    reset() {
      this.selectedModifiers = [];
    },
  },
  persist: {
    key: 'season-planner-v1',
  },
});
