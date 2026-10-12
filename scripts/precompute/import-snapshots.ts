import { applyOverlay } from '@/server/utils/overlay';
import { buildPrecomputedEnvelope } from '@/server/utils/precomputedTarkov';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
import { createTarkovJsonTasksImportFetcher } from '@/server/utils/tarkov-json';
import { buildTaskImportKey, isTaskImportSnapshot } from '@/server/utils/taskImportSnapshot';
import { TASK_IMPORT_MAX_AGE_MS } from '@/utils/taskImportCatalog';
import type { KvWriter, PrecomputeFilter } from './precompute';
const requiredSnapshot = (payload: unknown, mode: string, expectedSha: string) => {
  const envelope = buildPrecomputedEnvelope(payload);
  if (!isTaskImportSnapshot(envelope, mode))
    throw new Error('Invalid import snapshot; retaining previous entry');
  if (envelope.overlay?.sha256 !== expectedSha)
    throw new Error('Import overlay SHA differs from release; retaining previous entry');
  return envelope;
};
const generateSnapshot = async (mode: (typeof VALID_GAME_MODES)[number], expectedSha?: string) => {
  if (!expectedSha)
    throw new Error('Import overlay release SHA unavailable; retaining previous entry');
  const base = await createTarkovJsonTasksImportFetcher({ gameMode: mode, lang: 'en' })();
  const corrected = await applyOverlay(base, { gameMode: mode, locale: 'en' });
  const payload = { ...corrected, catalog: { lang: 'en' as const, gameMode: mode } };
  return requiredSnapshot(payload, mode, expectedSha);
};
/** Each mode publishes one whole last-good catalog; the three writes are not atomic together. */
const publishSnapshot = async (
  kv: KvWriter,
  mode: (typeof VALID_GAME_MODES)[number],
  expectedSha?: string
) => {
  const key = buildTaskImportKey(mode);
  try {
    const snapshot = await generateSnapshot(mode, expectedSha);
    await kv.put(key, JSON.stringify(snapshot), { expirationTtl: TASK_IMPORT_MAX_AGE_MS / 1000 });
    return { key, error: null };
  } catch (error) {
    return { key, error: error instanceof Error ? error.message : String(error) };
  }
};
export async function runImportPrecompute(
  kv: KvWriter,
  filter: PrecomputeFilter = {},
  expectedSha?: string
) {
  const successes: string[] = [];
  const failures: Array<{ key: string; error: string }> = [];
  if (!wantsEnglishSnapshot(filter.lang)) return { successes, failures };
  const modes = VALID_GAME_MODES.filter((mode) => !filter.gameMode || filter.gameMode === mode);
  for (const mode of modes) {
    const result = await publishSnapshot(kv, mode, expectedSha);
    if (result.error === null) successes.push(result.key);
    else failures.push({ key: result.key, error: result.error });
  }
  return { successes, failures };
}
const wantsEnglishSnapshot = (lang?: string): boolean => !lang || lang === 'en';
