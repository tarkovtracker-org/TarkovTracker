import { isPrecomputedEnvelope, type PrecomputedEnvelope } from '@/server/utils/precomputedTarkov';
import {
  TASK_IMPORT_MAX_AGE_MS,
  isTaskImportCatalog,
  type TaskImportCatalogShape,
} from '@/utils/taskImportCatalog';
export const buildTaskImportKey = (gameMode: string): string =>
  `tasks-import-json-v1-en-${gameMode}`;
const CLOCK_SKEW_ALLOWANCE_MS = 60_000;
const validAge = (storedAt: number, now: number): boolean => {
  const age = now - storedAt;
  return age >= -CLOCK_SKEW_ALLOWANCE_MS && age <= TASK_IMPORT_MAX_AGE_MS;
};
/** Missing, corrupt, wrong-mode, and expired import snapshots never fall back to runtime generation. */
export function isTaskImportSnapshot(
  value: unknown,
  gameMode: string,
  now = Date.now()
): value is PrecomputedEnvelope<TaskImportCatalogShape> {
  if (!isPrecomputedEnvelope<TaskImportCatalogShape>(value)) return false;
  return validAge(value.storedAt, now) && isTaskImportCatalog(value.payload, gameMode);
}
