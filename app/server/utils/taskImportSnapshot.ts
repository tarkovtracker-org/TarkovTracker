import { isPrecomputedEnvelope, type PrecomputedEnvelope } from '@/server/utils/precomputedTarkov';
import {
  TASK_IMPORT_MAX_AGE_MS,
  isTaskImportCatalog,
  type TaskImportCatalogPayload,
} from '@/utils/taskImportCatalog';
export const buildTaskImportKey = (gameMode: string): string =>
  `tasks-import-json-v1-en-${gameMode}`;
const validAge = (storedAt: number, now: number): boolean => {
  const age = now - storedAt;
  return age >= 0 && age <= TASK_IMPORT_MAX_AGE_MS;
};
/** Missing, corrupt, wrong-mode, and expired import snapshots never fall back to runtime generation. */
export function isTaskImportSnapshot(
  value: unknown,
  gameMode: string,
  now = Date.now()
): value is PrecomputedEnvelope<TaskImportCatalogPayload> {
  if (!isPrecomputedEnvelope<TaskImportCatalogPayload>(value)) return false;
  return validAge(value.storedAt, now) && isTaskImportCatalog(value.payload, gameMode);
}
