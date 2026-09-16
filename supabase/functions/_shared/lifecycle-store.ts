import type { LifecycleStore, LifecycleWork } from './lifecycle-worker.ts';
type Rpc = (
  name: string,
  args: Record<string, unknown>
) => Promise<{ data: unknown; error: unknown }>;
const textField = (row: Record<string, unknown>, field: string): string => {
  const value = row[field];
  if (typeof value !== 'string') throw new Error('Invalid lifecycle claim');
  return value;
};
const optionalText = (row: Record<string, unknown>, field: string): string | null =>
  row[field] === null ? null : textField(row, field);
function decodeWork(value: unknown): LifecycleWork {
  if (!value || typeof value !== 'object') throw new Error('Invalid lifecycle claim');
  const row = value as Record<string, unknown>;
  const attempts = claimAttempts(row.attempts);
  return {
    id: textField(row, 'id'),
    claim_token: textField(row, 'claim_token'),
    kind: textField(row, 'kind'),
    action: textField(row, 'action'),
    user_id: optionalText(row, 'user_id'),
    resource_id: optionalText(row, 'resource_id'),
    first_failure_at: optionalText(row, 'first_failure_at'),
    attempts,
  };
}
/** Explicit service RPC adapter. Does not construct a provider or run a schedule. */
export function lifecycleStore(rpc: Rpc): LifecycleStore {
  return {
    async claim(kind, limit) {
      const result = await rpc('claim_lifecycle_work', { p_kind: kind, p_limit: limit });
      if (result.error || !Array.isArray(result.data))
        throw new Error('Lifecycle claim unavailable');
      return result.data.map(decodeWork);
    },
    async finish(work, state, code, delay) {
      const result = await rpc('finish_lifecycle_work', {
        p_id: work.id,
        p_token: work.claim_token,
        p_state: state,
        p_code: code,
        p_retry_seconds: delay,
      });
      if (result.error) throw new Error('Lifecycle completion unavailable');
      console.info(
        JSON.stringify({
          event: 'lifecycle_task_transition',
          task_id: work.id,
          kind: work.kind,
          attempt: work.attempts,
          state,
          accepted: result.data === true,
          error_code: code,
        })
      );
      return result.data === true;
    },
  };
}
export async function validateLifecycleClaim(rpc: Rpc, work: LifecycleWork): Promise<boolean> {
  const result = await rpc('lifecycle_work_status', { p_id: work.id, p_token: work.claim_token });
  if (result.error) throw new Error('Lifecycle lease verification unavailable');
  const data = result.data;
  if (!data || typeof data !== 'object') return false;
  return validClaimFlag(data);
}
function validClaimFlag(data: object): boolean {
  return 'valid_claim' in data && data.valid_claim === true;
}
function claimAttempts(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value))
    throw new Error('Invalid lifecycle attempts');
  return value;
}
