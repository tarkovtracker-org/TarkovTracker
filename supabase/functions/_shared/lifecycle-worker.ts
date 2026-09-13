import { ProviderFailure } from './provider-http.ts';
export type LifecycleWork = {
  id: string;
  claim_token: string;
  kind: string;
  resource_id: string | null;
  user_id: string | null;
  action: string;
  attempts: number;
  first_failure_at: string | null;
};
export type WorkOutcome = { state: 'completed' | 'waiting'; retryAfterSeconds?: number };
export interface LifecycleStore {
  claim(kind: string, limit: number): Promise<LifecycleWork[]>;
  finish(work: LifecycleWork, state: string, code: string | null, delay: number): Promise<boolean>;
}
const retrySeconds = (attempt: number, guidance: number) =>
  Math.min(86400, Math.max(guidance, 30 * 2 ** Math.min(attempt, 10)));
const exhausted = (work: LifecycleWork, now: number) =>
  work.attempts >= 12 ||
  (work.first_failure_at !== null && now - Date.parse(work.first_failure_at) >= 86400000);
const failureState = (error: ProviderFailure, work: LifecycleWork, now: number) => {
  if (!error.retryable) return 'blocked';
  return exhausted(work, now) ? 'dead_letter' : 'retryable';
};
async function processWork(
  store: LifecycleStore,
  work: LifecycleWork,
  execute: (work: LifecycleWork) => Promise<WorkOutcome>
) {
  try {
    const outcome = await execute(work);
    return await store.finish(work, outcome.state, null, outcome.retryAfterSeconds ?? 60);
  } catch (error) {
    const failure =
      error instanceof ProviderFailure ? error : new ProviderFailure('worker_failure', true);
    return await store.finish(
      work,
      failureState(failure, work, Date.now()),
      failure.code,
      retrySeconds(work.attempts, failure.retryAfterSeconds)
    );
  }
}
/** Explicit invocation only. Importing this module never starts a runner or schedule. */
export async function runLifecycleBatch(
  store: LifecycleStore,
  kind: string,
  execute: (work: LifecycleWork) => Promise<WorkOutcome>,
  limit = 10
) {
  validateBatchLimit(limit);
  const work = await store.claim(kind, limit);
  const results: boolean[] = [];
  for (const item of work) results.push(await processWork(store, item, execute));
  return { claimed: work.length, advanced: results.filter(Boolean).length };
}
function validateBatchLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new Error('Invalid batch limit');
}
