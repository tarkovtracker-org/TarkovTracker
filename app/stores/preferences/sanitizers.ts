import {
  normalizeNeededItemsCardStyle,
  normalizeNeededItemsFilterType,
  normalizeNeededItemsFirFilter,
  normalizeNeededItemsSortBy,
  normalizeNeededItemsSortDirection,
  normalizeNeededItemsViewMode,
} from '@/features/neededitems/neededItemsFilterNormalization';
import { isValidPrimaryView, type TaskPrimaryView } from '@/types/taskFilter';
import { isValidSortDirection, type TaskSortDirection } from '@/types/taskSort';
import { DEFAULT_KEYBINDS, sanitizeKeybind } from '@/utils/keybinds';
import { logger } from '@/utils/logger';
import { normalizeSecondaryView, normalizeSortMode } from '@/utils/taskFilterNormalization';
import type { NeededItemsFilterType } from '@/features/neededitems/neededitems-constants';
import type { PreferencesState } from '@/stores/usePreferences';
export type PersistedPreferencesState = Partial<Omit<PreferencesState, 'saving'>>;
export type PersistedPreferencesStateWithLegacy = PersistedPreferencesState & {
  neededItemsHideCollected?: boolean;
  onlyTasksWithSuggestedKeys?: boolean;
};
export const requiresLegacyPreferencesMigration = (
  persistedState: PersistedPreferencesStateWithLegacy
): boolean => {
  return (
    'neededItemsHideCollected' in persistedState || 'onlyTasksWithSuggestedKeys' in persistedState
  );
};
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const isBlockedBrowserObject = (value: object): boolean => {
  const tag = Object.prototype.toString.call(value);
  return (
    tag === '[object Window]' ||
    tag === '[object DOMWindow]' ||
    tag === '[object Document]' ||
    tag === '[object Location]' ||
    tag.endsWith('Event]') ||
    tag.startsWith('[object HTML')
  );
};
const extractSelectionString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && 'value' in value) {
    const candidate = (value as { value?: unknown }).value;
    return typeof candidate === 'string' ? candidate : null;
  }
  return null;
};
const cloneSerializablePreferencesValue = (
  value: unknown,
  seen = new WeakMap<object, unknown>()
): unknown => {
  const rawValue = value !== null && typeof value === 'object' ? toRaw(value) : value;
  if (
    rawValue === null ||
    rawValue === undefined ||
    typeof rawValue === 'string' ||
    typeof rawValue === 'number' ||
    typeof rawValue === 'boolean'
  ) {
    return rawValue;
  }
  if (typeof rawValue === 'bigint') {
    return rawValue.toString();
  }
  if (typeof rawValue === 'function' || typeof rawValue === 'symbol') {
    return undefined;
  }
  if (!(rawValue instanceof Object)) {
    return rawValue;
  }
  if (seen.has(rawValue)) {
    return seen.get(rawValue);
  }
  if (rawValue instanceof Date) {
    return new Date(rawValue.getTime());
  }
  if (Array.isArray(rawValue)) {
    const clonedArray: unknown[] = [];
    seen.set(rawValue, clonedArray);
    for (const item of rawValue) {
      const clonedItem = cloneSerializablePreferencesValue(item, seen);
      clonedArray.push(clonedItem === undefined ? null : clonedItem);
    }
    return clonedArray;
  }
  if (isBlockedBrowserObject(rawValue)) {
    return undefined;
  }
  if (isPlainObject(rawValue)) {
    const clonedRecord: Record<string, unknown> = {};
    seen.set(rawValue, clonedRecord);
    for (const [key, nestedValue] of Object.entries(rawValue)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      const clonedValue = cloneSerializablePreferencesValue(nestedValue, seen);
      if (clonedValue !== undefined) {
        clonedRecord[key] = clonedValue;
      }
    }
    return clonedRecord;
  }
  try {
    return structuredClone(rawValue);
  } catch {
    return undefined;
  }
};
export const normalizeOptionalStringSelection = (value: unknown): string | null => {
  const candidate = extractSelectionString(value);
  return candidate && candidate.length > 0 ? candidate : null;
};
export const normalizeOptionalTaskPrimaryView = (value: unknown): TaskPrimaryView | null => {
  const candidate = extractSelectionString(value);
  return candidate && isValidPrimaryView(candidate) ? candidate : null;
};
export const normalizeOptionalTaskSortDirection = (value: unknown): TaskSortDirection | null => {
  const candidate = extractSelectionString(value);
  return candidate && isValidSortDirection(candidate) ? candidate : null;
};
const normalizeOptionalNeededItemsFilterType = (
  value: unknown
): NeededItemsFilterType | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return normalizeNeededItemsFilterType(value);
};
const normalizeOptionalNeededItemsViewMode = (
  value: unknown
): PreferencesState['neededItemsViewMode'] => {
  if (value === undefined) {
    return null;
  }
  return normalizeNeededItemsViewMode(value);
};
const normalizeOptionalNeededItemsFirFilter = (
  value: unknown
): PreferencesState['neededItemsFirFilter'] => {
  if (value === undefined) {
    return null;
  }
  return normalizeNeededItemsFirFilter(value);
};
const normalizeOptionalNeededItemsCardStyle = (
  value: unknown
): PreferencesState['neededItemsCardStyle'] => {
  if (value === undefined) {
    return null;
  }
  return normalizeNeededItemsCardStyle(value);
};
export const clonePreferencesSnapshot = <T>(value: T): T => {
  return cloneSerializablePreferencesValue(value) as T;
};
export const sanitizePersistedPreferencesState = (
  persistedState: PersistedPreferencesStateWithLegacy = {}
): PersistedPreferencesState => {
  const sanitizedState = clonePreferencesSnapshot(
    persistedState
  ) as PersistedPreferencesStateWithLegacy;
  const legacyHideCollected = sanitizedState.neededItemsHideCollected;
  if (
    typeof sanitizedState.neededItemsHideOwned !== 'boolean' &&
    typeof legacyHideCollected === 'boolean'
  ) {
    sanitizedState.neededItemsHideOwned = legacyHideCollected;
  }
  if ('neededItemsHideCollected' in sanitizedState) {
    delete sanitizedState.neededItemsHideCollected;
  }
  if (
    typeof sanitizedState.onlyTasksWithRequiredKeys !== 'boolean' &&
    typeof sanitizedState.onlyTasksWithSuggestedKeys === 'boolean'
  ) {
    sanitizedState.onlyTasksWithRequiredKeys = sanitizedState.onlyTasksWithSuggestedKeys;
  }
  if ('onlyTasksWithSuggestedKeys' in sanitizedState) {
    delete sanitizedState.onlyTasksWithSuggestedKeys;
  }
  if ('taskPrimaryView' in sanitizedState) {
    sanitizedState.taskPrimaryView = normalizeOptionalTaskPrimaryView(
      sanitizedState.taskPrimaryView
    );
  }
  if ('taskMapView' in sanitizedState) {
    sanitizedState.taskMapView = normalizeOptionalStringSelection(sanitizedState.taskMapView);
  }
  if ('taskTraderView' in sanitizedState) {
    sanitizedState.taskTraderView = normalizeOptionalStringSelection(sanitizedState.taskTraderView);
  }
  if ('taskSecondaryView' in sanitizedState) {
    sanitizedState.taskSecondaryView =
      sanitizedState.taskSecondaryView === undefined
        ? undefined
        : normalizeSecondaryView(sanitizedState.taskSecondaryView);
  }
  if ('taskUserView' in sanitizedState) {
    sanitizedState.taskUserView = normalizeOptionalStringSelection(sanitizedState.taskUserView);
  }
  if ('taskSortMode' in sanitizedState) {
    sanitizedState.taskSortMode =
      sanitizedState.taskSortMode === undefined
        ? undefined
        : normalizeSortMode(sanitizedState.taskSortMode);
  }
  if ('taskSortDirection' in sanitizedState) {
    sanitizedState.taskSortDirection = normalizeOptionalTaskSortDirection(
      sanitizedState.taskSortDirection
    );
  }
  if ('neededTypeView' in sanitizedState) {
    sanitizedState.neededTypeView = normalizeOptionalNeededItemsFilterType(
      sanitizedState.neededTypeView
    );
  }
  if ('neededItemsViewMode' in sanitizedState) {
    sanitizedState.neededItemsViewMode = normalizeOptionalNeededItemsViewMode(
      sanitizedState.neededItemsViewMode
    );
  }
  if ('neededItemsFirFilter' in sanitizedState) {
    sanitizedState.neededItemsFirFilter = normalizeOptionalNeededItemsFirFilter(
      sanitizedState.neededItemsFirFilter
    );
  }
  if ('neededItemsSortBy' in sanitizedState) {
    sanitizedState.neededItemsSortBy = normalizeNeededItemsSortBy(sanitizedState.neededItemsSortBy);
  }
  if ('neededItemsSortDirection' in sanitizedState) {
    sanitizedState.neededItemsSortDirection = normalizeNeededItemsSortDirection(
      sanitizedState.neededItemsSortDirection
    );
  }
  if ('neededItemsCardStyle' in sanitizedState) {
    sanitizedState.neededItemsCardStyle = normalizeOptionalNeededItemsCardStyle(
      sanitizedState.neededItemsCardStyle
    );
  }
  if ('keybindOmnibar' in sanitizedState) {
    sanitizedState.keybindOmnibar = sanitizeKeybind(
      sanitizedState.keybindOmnibar,
      DEFAULT_KEYBINDS.omnibar
    );
  }
  if ('keybindUndo' in sanitizedState) {
    sanitizedState.keybindUndo = sanitizeKeybind(sanitizedState.keybindUndo, DEFAULT_KEYBINDS.undo);
  }
  return sanitizedState;
};
export const isPersistedPreferencesStateRecord = (
  value: unknown
): value is PersistedPreferencesState => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};
export const parseLegacyPersistedPreferencesState = (
  rawPersistedState: string
): PersistedPreferencesState | null => {
  try {
    const parsed = JSON.parse(rawPersistedState) as unknown;
    return isPersistedPreferencesStateRecord(parsed) ? parsed : null;
  } catch (error) {
    logger.warn('[PreferencesStore] Failed to parse local preferences', {
      feature: 'preferences',
      action: 'parseLegacyPersistedPreferencesState',
      error,
    });
    return null;
  }
};
