/**
 * CLI entry for the tasks-core precompute run.
 *
 * Invoked by .github/workflows/precompute-tarkov-data.yml on a 12h schedule
 * and via workflow_dispatch for targeted busts. Filters arrive as env vars
 * (PRECOMPUTE_LANG / PRECOMPUTE_GAME_MODE) so workflow_dispatch inputs never
 * pass through a shell, or as --lang / --game-mode flags for local runs.
 *
 * Required env:
 *   CLOUDFLARE_API_TOKEN        - scoped to Workers KV Storage: Edit
 *   CLOUDFLARE_ACCOUNT_ID       - account that owns the namespace
 *   TARKOV_DATA_KV_NAMESPACE_ID - id of the TARKOV_DATA namespace
 */
import { parseArgs } from 'node:util';
import { createKvRestWriter } from './kv';
import { runPrecompute, validatePrecomputeFilter } from './precompute';
function fail(message: string): never {
  console.error(`[precompute] ${message}`);
  process.exit(1);
}
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) fail(`Missing required environment variable ${name}`);
  return value;
}
const { values: flags } = parseArgs({
  options: {
    'game-mode': { type: 'string' },
    lang: { type: 'string' },
  },
});
const filter = {
  gameMode: flags['game-mode'] || process.env.PRECOMPUTE_GAME_MODE || undefined,
  lang: flags.lang || process.env.PRECOMPUTE_LANG || undefined,
};
const filterError = validatePrecomputeFilter(filter);
if (filterError) fail(filterError);
const kv = createKvRestWriter({
  accountId: requireEnv('CLOUDFLARE_ACCOUNT_ID'),
  apiToken: requireEnv('CLOUDFLARE_API_TOKEN'),
  namespaceId: requireEnv('TARKOV_DATA_KV_NAMESPACE_ID'),
});
try {
  const result = await runPrecompute(kv, filter);
  console.log(
    JSON.stringify(
      {
        durationMs: result.durationMs,
        failed: result.failures.length,
        failures: result.failures,
        succeeded: result.successes.length,
      },
      null,
      2
    )
  );
  // Non-zero exit surfaces partial failures in the Actions UI; existing KV
  // entries (7-day TTL) keep serving until the next successful run.
  if (result.failures.length > 0) process.exit(1);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
