import { defineStore, type StateTree } from 'pinia';
import 'pinia-plugin-persistedstate';
import { seasonalModifiers } from '@/data/seasonal-modifiers';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import {
  getCurrentSupabaseUserId,
  parseUserScopedStorage,
  serializeUserScopedStorage,
} from '@/utils/userScopedStorage';
import type { PersonalModifier, SeasonPlannerState } from '@/types/season';
const PERSONAL_MODIFIER_IDS = new Set(
  seasonalModifiers
    .filter((modifier): modifier is PersonalModifier => modifier.type !== 'hardcore')
    .map((modifier) => modifier.id)
);
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};
const isKnownPersonalModifierId = (value: unknown): value is string =>
  typeof value === 'string' && PERSONAL_MODIFIER_IDS.has(value);
const normalizeSelectedModifiers = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.filter(isKnownPersonalModifierId))] : [];
const createEmptyState = (
  ownerUserId: string | null = getCurrentSupabaseUserId()
): SeasonPlannerState => ({
  ownerUserId,
  selectedModifiers: [],
});
const getPersistedSelectedModifiers = (value: unknown): unknown => {
  return isRecord(value) ? value.selectedModifiers : undefined;
};
const SEASON_PLANNER_SERIALIZER = {
  serialize: (state: StateTree): string => {
    const currentUserId = getCurrentSupabaseUserId();
    const selectedModifiers =
      isRecord(state) && state.ownerUserId === currentUserId
        ? normalizeSelectedModifiers(state.selectedModifiers)
        : [];
    return serializeUserScopedStorage({ selectedModifiers }, currentUserId);
  },
  deserialize: (raw: string): SeasonPlannerState => {
    const currentUserId = getCurrentSupabaseUserId();
    const wrapped = parseUserScopedStorage<unknown>(raw);
    if (!wrapped || wrapped._userId !== currentUserId) {
      return createEmptyState(currentUserId);
    }
    return {
      ownerUserId: currentUserId,
      selectedModifiers: normalizeSelectedModifiers(getPersistedSelectedModifiers(wrapped.data)),
    };
  },
};
export const useSeasonPlannerStore = defineStore('seasonPlanner', {
  state: (): SeasonPlannerState => ({
    ownerUserId: getCurrentSupabaseUserId(),
    selectedModifiers: [],
  }),
  getters: {
    allModifiers: () => seasonalModifiers,
    personalModifiers: () =>
      seasonalModifiers.filter(
        (m): m is PersonalModifier => m.type === 'positive' || m.type === 'negative'
      ),
    selectedModifierIds(state): string[] {
      if (state.ownerUserId !== getCurrentSupabaseUserId()) {
        return [];
      }
      return normalizeSelectedModifiers(state.selectedModifiers);
    },
    selectedModifierObjects(): PersonalModifier[] {
      return this.selectedModifierIds
        .map((id) => this.personalModifiers.find((m) => m.id === id))
        .filter((m): m is PersonalModifier => Boolean(m));
    },
    totalPoints(): number {
      return this.selectedModifierObjects.reduce((acc, m) => acc + (m.points ?? 0), 0);
    },
    hasConflicts(): boolean {
      const selectedIds = new Set(this.selectedModifierIds);
      return this.selectedModifierObjects.some((modifier) =>
        modifier.incompatibleWith?.some((id) => selectedIds.has(id))
      );
    },
    isValid(): boolean {
      return this.totalPoints >= 0 && !this.hasConflicts;
    },
  },
  actions: {
    prepareForCurrentUser() {
      const currentUserId = getCurrentSupabaseUserId();
      if (this.ownerUserId !== currentUserId) {
        this.ownerUserId = currentUserId;
        this.selectedModifiers = [];
        return;
      }
      this.selectedModifiers = normalizeSelectedModifiers(this.selectedModifiers);
    },
    isSelected(id: string): boolean {
      return this.selectedModifierIds.includes(id);
    },
    toggleModifier(id: string) {
      this.prepareForCurrentUser();
      const modifier = this.personalModifiers.find((candidate) => candidate.id === id);
      if (!modifier) {
        return;
      }
      const selectedIds = this.selectedModifierIds;
      const index = selectedIds.indexOf(id);
      if (index > -1) {
        this.selectedModifiers.splice(index, 1);
        return;
      }
      if (!this.conflictsWithSelection(id, selectedIds)) {
        this.selectedModifiers.push(id);
      }
    },
    normalizeSelection() {
      this.prepareForCurrentUser();
      const normalizedIds: string[] = [];
      for (const id of this.selectedModifierIds) {
        if (!this.conflictsWithSelection(id, normalizedIds) && !normalizedIds.includes(id)) {
          normalizedIds.push(id);
        }
      }
      this.selectedModifiers = normalizedIds;
    },
    reset() {
      this.prepareForCurrentUser();
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
    key: STORAGE_KEYS.seasonPlanner,
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    serializer: SEASON_PLANNER_SERIALIZER,
  },
});
