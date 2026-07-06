/**
 * Precompute pipeline for heavy TarkovTracker API payloads.
 *
 * Runs the exact same fetch -> adapt -> overlay pipeline the Nitro request
 * handlers use (imported from app/server/utils, not duplicated) and writes the
 * final payload to the TARKOV_DATA KV namespace. Request handlers then serve
 * the precomputed blob instead of running the multi-MB transform inside a
 * request invocation, which is what exceeded the per-invocation resource
 * ceiling (Cloudflare Error 1102) on cold, low-traffic colos.
 *
 * Executed from GitHub Actions (.github/workflows/precompute-tarkov-data.yml)
 * because the Workers Free tier's 10ms CPU budget cannot fit even a single
 * lang x gameMode transform, let alone the full 32-combination run.
 */
import { applyOverlay } from '@/server/utils/overlay';
import {
  buildPrecomputedEnvelope,
  buildTasksCorePrecomputedKey,
} from '@/server/utils/precomputedTarkov';
import { VALID_GAME_MODES } from '@/server/utils/tarkov-cache-config';
import { createTarkovJsonTasksCoreFetcher } from '@/server/utils/tarkov-json';
import { API_SUPPORTED_LANGUAGES } from '@/utils/constants';
import type { ValidGameMode } from '@/server/utils/tarkov-cache-config';
// KV entries outlive several missed scheduled runs so a precompute outage
// degrades to slightly stale data instead of dropping colos back onto the
// fatal cold-miss path. The schedule refreshes every 12h (matching
// CACHE_TTL_DEFAULT).
export const PRECOMPUTED_TTL_SECONDS = 7 * 24 * 60 * 60;
export type KvWriter = {
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
};
export type PrecomputeFilter = {
  gameMode?: string;
  lang?: string;
};
export type PrecomputeResult = {
  durationMs: number;
  failures: { error: string; key: string }[];
  successes: string[];
};
/**
 * Returns an error message when a filter value matches no supported
 * combination, so the runner can reject it with a non-zero exit instead of
 * silently completing a no-op run. Returns null when the filter is valid.
 */
export function validatePrecomputeFilter(filter: PrecomputeFilter): string | null {
  if (
    filter.lang !== undefined &&
    !(API_SUPPORTED_LANGUAGES as readonly string[]).includes(filter.lang)
  ) {
    return `Unsupported lang "${filter.lang}". Supported: ${API_SUPPORTED_LANGUAGES.join(', ')}`;
  }
  if (
    filter.gameMode !== undefined &&
    !(VALID_GAME_MODES as readonly string[]).includes(filter.gameMode)
  ) {
    return `Unsupported gameMode "${filter.gameMode}". Supported: ${VALID_GAME_MODES.join(', ')}`;
  }
  return null;
}
export async function runPrecompute(
  kv: KvWriter,
  filter: PrecomputeFilter = {}
): Promise<PrecomputeResult> {
  const startedAt = Date.now();
  const langs = API_SUPPORTED_LANGUAGES.filter((lang) => !filter.lang || lang === filter.lang);
  const gameModes = VALID_GAME_MODES.filter(
    (gameMode) => !filter.gameMode || gameMode === filter.gameMode
  );
  const successes: string[] = [];
  const failures: { error: string; key: string }[] = [];
  // Sequential on purpose: each combination materializes several multi-MB JSON
  // documents, and sequential runs keep memory flat and upstream load polite.
  // A failed combination is recorded and skipped so one bad upstream response
  // cannot abort the whole run; the next scheduled run retries it while the
  // previous KV entry keeps serving.
  for (const lang of langs) {
    for (const gameMode of gameModes) {
      const key = buildTasksCorePrecomputedKey(lang, gameMode);
      try {
        const payload = await precomputeTasksCore(lang, gameMode);
        await kv.put(key, JSON.stringify(buildPrecomputedEnvelope(payload)), {
          expirationTtl: PRECOMPUTED_TTL_SECONDS,
        });
        successes.push(key);
      } catch (error) {
        failures.push({
          error: error instanceof Error ? error.message : String(error),
          key,
        });
      }
    }
  }
  return {
    durationMs: Date.now() - startedAt,
    failures,
    successes,
  };
}
async function precomputeTasksCore(lang: string, gameMode: ValidGameMode): Promise<unknown> {
  const baseFetcher = createTarkovJsonTasksCoreFetcher({ gameMode, lang });
  const payload = await applyOverlay(await baseFetcher(), { gameMode });
  assertLooksLikeTasksCore(payload);
  return payload;
}
// A KV entry is served globally by every colo until the next successful run,
// so a structurally empty payload (upstream regression that still parses)
// must fail the combination instead of poisoning the precomputed store. The
// previous KV entry keeps serving while the failure is retried on the next
// scheduled run.
function assertLooksLikeTasksCore(payload: unknown): void {
  const data = (payload as { data?: { tasks?: unknown } } | null | undefined)?.data;
  const tasks = data?.tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('Sanity check failed: payload has no tasks; refusing to write to KV');
  }
}
