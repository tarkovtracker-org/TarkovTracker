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
    const ownerUserId = typeof state.ownerUserId === 'string' ? state.ownerUserId : null;
    const selectedModifiers = normalizeSelectedModifiers(state.selectedModifiers);
    return serializeUserScopedStorage({ selectedModifiers }, ownerUserId);
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
// Separate slots protect a saved signed-in plan while startup still appears anonymous.
const ownerStorageKey = (key: string, owner: string | null): string =>
  `${key}:${JSON.stringify(owner)}`;
const SEASON_PLANNER_STORAGE = {
  getItem(key: string): string | null {
    const owner = getCurrentSupabaseUserId();
    const saved = localStorage.getItem(ownerStorageKey(key, owner));
    if (saved !== null) return saved;
    // Existing preview users used a single envelope; migrate only its matching owner.
    const legacy = localStorage.getItem(key);
    if (legacy === null) return null;
    return parseUserScopedStorage(legacy)?._userId === owner ? legacy : null;
  },
  setItem(key: string, raw: string): void {
    const envelope = parseUserScopedStorage(raw);
    if (envelope) localStorage.setItem(ownerStorageKey(key, envelope._userId), raw);
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
        const raw = SEASON_PLANNER_STORAGE.getItem(STORAGE_KEYS.seasonPlanner);
        this.$patch(
          raw ? SEASON_PLANNER_SERIALIZER.deserialize(raw) : createEmptyState(currentUserId)
        );
        return;
      }
      this.$patch({ selectedModifiers: normalizeSelectedModifiers(this.selectedModifiers) });
    },
    isSelected(id: string): boolean {
      return this.selectedModifierIds.includes(id);
    },
    toggleModifier(id: string) {
      this.prepareForCurrentUser();
      if (!this.personalModifiers.some((candidate) => candidate.id === id)) {
        return;
      }
      const selectedIds = this.selectedModifierIds;
      const index = selectedIds.indexOf(id);
      if (index > -1) {
        this.$patch({ selectedModifiers: selectedIds.filter((selectedId) => selectedId !== id) });
        return;
      }
      if (!this.conflictsWithSelection(id, selectedIds)) {
        this.$patch({ selectedModifiers: [...selectedIds, id] });
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
      this.$patch({ selectedModifiers: normalizedIds });
    },
    reset() {
      this.prepareForCurrentUser();
      this.$patch({ selectedModifiers: [] });
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
    storage: typeof window !== 'undefined' ? SEASON_PLANNER_STORAGE : undefined,
    serializer: SEASON_PLANNER_SERIALIZER,
  },
});
