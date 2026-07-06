/**
 * Precompute pipeline for heavy TarkovTracker API payloads.
 *
 * Runs the exact same fetch -> adapt -> overlay pipeline the Nitro request
 * handlers use (imported from app/server/utils, not duplicated) and writes the
 * final payload to the TARKOV_DATA KV namespace. Request handlers then serve
 * the precomputed blob instead of running the multi-MB transform inside a
 * request invocation, which is what exceeded the per-invocation resource
 * ceiling (Cloudflare Error 1102) on cold, low-traffic colos.
 */
import { applyOverlay } from '../../../app/server/utils/overlay';
import {
  buildPrecomputedEnvelope,
  buildTasksCorePrecomputedKey,
} from '../../../app/server/utils/precomputedTarkov';
import { VALID_GAME_MODES } from '../../../app/server/utils/tarkov-cache-config';
import { createTarkovJsonTasksCoreFetcher } from '../../../app/server/utils/tarkov-json';
import { API_SUPPORTED_LANGUAGES } from '../../../app/utils/constants';
import type { ValidGameMode } from '../../../app/server/utils/tarkov-cache-config';

// KV entries outlive several missed cron runs so a precompute outage degrades
// to slightly stale data instead of dropping colos back onto the fatal
// cold-miss path. The cron refreshes every 12h (matching CACHE_TTL_DEFAULT).
const PRECOMPUTED_TTL_SECONDS = 7 * 24 * 60 * 60;

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
  // documents. Running them in parallel would recreate the memory pressure
  // this Worker exists to remove. A failed combination is recorded and skipped
  // so one bad upstream response cannot abort the whole run; the next cron
  // run retries it while the previous KV entry keeps serving.
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
  return await applyOverlay(await baseFetcher(), { gameMode });
}
