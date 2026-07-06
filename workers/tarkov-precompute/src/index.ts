/**
 * tarkov-precompute Worker entry point.
 *
 * Two triggers:
 * - Cron (every 12h): refreshes every lang x gameMode tasks-core payload in KV.
 * - POST /run: on-demand refresh (optionally filtered by ?lang= and
 *   ?gameMode=), guarded by the PRECOMPUTE_TRIGGER_TOKEN secret. Used to bust
 *   precomputed data after upstream/overlay corrections without waiting for
 *   the next cron run.
 */
import { runPrecompute, validatePrecomputeFilter } from './precompute';
import type { KvWriter, PrecomputeResult } from './precompute';

export interface Env {
  TARKOV_DATA: KvWriter;
  // Secret (set via `wrangler secret put PRECOMPUTE_TRIGGER_TOKEN`), never in
  // the repo. When unset the on-demand endpoint is disabled.
  PRECOMPUTE_TRIGGER_TOKEN?: string;
}

function summarize(result: PrecomputeResult): string {
  return JSON.stringify({
    durationMs: result.durationMs,
    failed: result.failures.length,
    failures: result.failures,
    succeeded: result.successes.length,
  });
}

function isAuthorized(request: Request, env: Env): boolean {
  const token = env.PRECOMPUTE_TRIGGER_TOKEN;
  if (typeof token !== 'string' || token.length === 0) return false;
  const header = request.headers.get('authorization') ?? '';
  // Auth scheme names are case-insensitive (RFC 7235 s2.1); the token itself
  // is compared exactly.
  const separatorIndex = header.indexOf(' ');
  if (separatorIndex === -1) return false;
  const scheme = header.slice(0, separatorIndex);
  const credentials = header.slice(separatorIndex + 1);
  return scheme.toLowerCase() === 'bearer' && credentials === token;
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const result = await runPrecompute(env.TARKOV_DATA);
    if (result.failures.length > 0) {
      console.error(`[tarkov-precompute] completed with failures: ${summarize(result)}`);
      return;
    }
    console.log(`[tarkov-precompute] completed: ${summarize(result)}`);
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/run') {
      return new Response('Not found', { status: 404 });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    if (!isAuthorized(request, env)) {
      return new Response('Unauthorized', { status: 401 });
    }
    const filter = {
      gameMode: url.searchParams.get('gameMode') ?? undefined,
      lang: url.searchParams.get('lang') ?? undefined,
    };
    // Reject unknown filter values instead of silently running zero
    // combinations and reporting success.
    const filterError = validatePrecomputeFilter(filter);
    if (filterError) {
      return new Response(JSON.stringify({ error: filterError }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      });
    }
    const result = await runPrecompute(env.TARKOV_DATA, filter);
    return new Response(summarize(result), {
      headers: { 'Content-Type': 'application/json' },
      status: result.failures.length > 0 ? 207 : 200,
    });
  },
};
