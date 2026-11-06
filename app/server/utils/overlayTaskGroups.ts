/**
 * Consumer for the overlay's `traderTaskGroups` registry: the in-game trader task-list group per
 * task (`0` Essential Tasks, `1`-`4` Loyalty Level N). Display grouping only, never a gate. A
 * malformed registry is applied nowhere and stays reported as an unconsumed section.
 *
 * Contract: https://github.com/tarkovtracker-org/tarkov-data-overlay/blob/main/docs/INTEGRATION.md#trader-task-groups
 */
import { isPlainObject } from './deepMerge';
import type { OverlayData } from './overlayTypes';
import type { TraderTaskGroup } from '@/types/tarkov';
const GROUP_MODES: ReadonlySet<string> = new Set(['regular', 'pve', 'pvp-season']);
const TASK_ID = /^[0-9a-f]{24}$/;
type GroupRegistry = Record<string, Record<string, TraderTaskGroup>>;
const isGroup = (value: unknown): value is TraderTaskGroup =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 4;
const validModeGroups = (groups: unknown): boolean =>
  isPlainObject(groups) &&
  Object.entries(groups).every(([taskId, group]) => TASK_ID.test(taskId) && isGroup(group));
/** Mirrors the overlay's `trader-task-group.schema.json`; `{}` is a valid empty registry. */
export const validTraderTaskGroups = (value: unknown): value is GroupRegistry =>
  isPlainObject(value) &&
  Object.entries(value).every(([mode, groups]) => GROUP_MODES.has(mode) && validModeGroups(groups));
const modeGroups = (
  overlay: Pick<OverlayData, 'traderTaskGroups'>,
  mode: string
): Record<string, TraderTaskGroup> => {
  const registry = overlay.traderTaskGroups;
  if (!validTraderTaskGroups(registry) || !Object.hasOwn(registry, mode)) return {};
  return registry[mode]!;
};
/** The registry is the only source: any `traderTaskGroup` a task patch supplied is replaced. */
export const attachTraderTaskGroups = <T extends { id: string; traderTaskGroup?: unknown }>(
  tasks: T[],
  overlay: Pick<OverlayData, 'traderTaskGroups'>,
  mode: string
): T[] => {
  const groups = modeGroups(overlay, mode);
  return tasks.map(({ traderTaskGroup: _ignored, ...task }) =>
    Object.hasOwn(groups, task.id)
      ? ({ ...task, traderTaskGroup: groups[task.id] } as T)
      : (task as T)
  );
};
