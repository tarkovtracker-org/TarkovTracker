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
    hasConflicts(): boolean {
      const selectedIds = new Set(this.selectedModifiers);
      return this.selectedModifierObjects.some((modifier) =>
        modifier.incompatibleWith?.some((id) => selectedIds.has(id))
      );
    },
    isValid(): boolean {
      return this.totalPoints >= 0 && !this.hasConflicts;
    },
  },
  actions: {
    isSelected(id: string): boolean {
      return this.selectedModifiers.includes(id);
    },
    toggleModifier(id: string) {
      const modifier = this.personalModifiers.find((candidate) => candidate.id === id);
      if (!modifier) {
        return;
      }
      const index = this.selectedModifiers.indexOf(id);
      if (index > -1) {
        this.selectedModifiers.splice(index, 1);
        return;
      }
      if (!this.conflictsWithSelection(id, this.selectedModifiers)) {
        this.selectedModifiers.push(id);
      }
    },
    normalizeSelection() {
      const knownIds = new Set(this.personalModifiers.map((m) => m.id));
      const normalizedIds: string[] = [];
      for (const id of this.selectedModifiers) {
        if (!knownIds.has(id)) {
          continue;
        }
        if (!this.conflictsWithSelection(id, normalizedIds) && !normalizedIds.includes(id)) {
          normalizedIds.push(id);
        }
      }
      this.selectedModifiers = normalizedIds;
    },
    reset() {
      this.selectedModifiers = [];
    },
    conflictsWithSelection(id: string, selectedIds: readonly string[]): boolean {
      const modifier = this.personalModifiers.find((candidate) => candidate.id === id);
      if (modifier?.incompatibleWith?.some((conflictId) => selectedIds.includes(conflictId))) {
        return true;
      }
      return selectedIds.some((selectedId) => {
        const selected = this.personalModifiers.find((candidate) => candidate.id === selectedId);
        return selected?.incompatibleWith?.includes(id);
      });
    },
  },
  persist: {
    key: 'season-planner-v1',
  },
});
