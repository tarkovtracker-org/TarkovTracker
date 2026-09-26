import { createProgressInvalidator } from '@shared/utils/progressInvalidation';
import type { TarkovTask } from '../types';
const catalogInvalidators = new WeakMap<
  readonly TarkovTask[],
  ReturnType<typeof createProgressInvalidator>
>();
function freezeCatalogValue(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.values(value).forEach(freezeCatalogValue);
  Object.freeze(value);
}
/** Register only normalized public catalogs. Arbitrary caller-owned arrays are not memoized. */
export function prepareTaskCatalog(tasks: TarkovTask[]): void {
  freezeCatalogValue(tasks);
  catalogInvalidators.set(tasks, createProgressInvalidator(tasks));
}
export function getTaskCatalogInvalidator(tasks: readonly TarkovTask[]) {
  return catalogInvalidators.get(tasks);
}
