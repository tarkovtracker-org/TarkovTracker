import { deepEqual } from '@/stores/tarkov/deepEqual';
import type { ProgressSyncSnapshot } from '@/stores/tarkov/acknowledgedModes';
type MetadataEcho = {
  writeId: string;
  metadata: ProgressSyncSnapshot;
  previousUid: number | null | undefined;
  expiresAt: number;
};
const MAX_METADATA_ECHOES = 16;
const METADATA_ECHO_TTL_MS = 30_000;
const METADATA_KEYS = new Set(['currentGameMode', 'gameEdition', 'tarkovUid']);
let echoes: MetadataEcho[] = [];
export const clearMetadataEchoes = (): void => {
  echoes = [];
};
export const readMetadataWriteId = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;
const pruneEchoes = (): void => {
  echoes = echoes.filter((echo) => echo.expiresAt > Date.now());
};
/** HTTP acknowledgements retain exact server-authored metadata transaction evidence. */
export const recordMetadataEcho = (
  writeId: unknown,
  expected: ProgressSyncSnapshot,
  previousUid: number | null | undefined
): void => {
  const id = readMetadataWriteId(writeId);
  if (!id) return;
  pruneEchoes();
  echoes.push({
    writeId: id,
    previousUid,
    expiresAt: Date.now() + METADATA_ECHO_TTL_MS,
    metadata: {
      currentGameMode: expected.currentGameMode,
      gameEdition: expected.gameEdition,
      tarkovUid: expected.tarkovUid,
    },
  });
  echoes = echoes.slice(-MAX_METADATA_ECHOES);
};
const matchesEcho = (echo: MetadataEcho, remote: ProgressSyncSnapshot): boolean => {
  if (deepEqual(echo.metadata, remote)) return true;
  if (echo.previousUid === undefined) return false;
  return deepEqual({ ...echo.metadata, tarkovUid: echo.previousUid }, remote);
};
/** A later transaction, unknown marker, mode progress, or changed metadata never matches. */
export const isAcknowledgedMetadataEcho = (
  writeId: unknown,
  remote: ProgressSyncSnapshot,
  applied: ProgressSyncSnapshot = remote
): boolean => {
  pruneEchoes();
  if (!Object.keys(applied).every((key) => METADATA_KEYS.has(key))) return false;
  return echoes.some((echo) => echo.writeId === writeId && matchesEcho(echo, remote));
};
