import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { lifecycleStore, validateLifecycleClaim } from './lifecycle-store.ts';
import { runLifecycleBatch, type LifecycleWork } from './lifecycle-worker.ts';
const work: LifecycleWork = {
  id: 'synthetic-task',
  claim_token: 'synthetic-claim',
  kind: 'discord_cleanup',
  resource_id: 'synthetic-discord',
  user_id: 'synthetic-user',
  action: 'remove_managed_roles',
  attempts: 1,
  first_failure_at: null,
};
Deno.test(
  'Explicit worker adapter preserves fencing across claim, provider validation, and completion',
  async () => {
    const calls: string[] = [];
    const rpc = (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      if (name === 'claim_lifecycle_work') return Promise.resolve({ data: [work], error: null });
      assertEquals(args.p_id, work.id);
      assertEquals(args.p_token, work.claim_token);
      return Promise.resolve({
        data: name === 'lifecycle_work_status' ? { valid_claim: true } : true,
        error: null,
      });
    };
    const result = await runLifecycleBatch(lifecycleStore(rpc), 'discord_cleanup', async (task) => {
      assertEquals(await validateLifecycleClaim(rpc, task), true);
      return { state: 'completed' };
    });
    assertEquals(result, { claimed: 1, advanced: 1 });
    assertEquals(calls, ['claim_lifecycle_work', 'lifecycle_work_status', 'finish_lifecycle_work']);
  }
);
Deno.test('Malformed claim and unavailable claim RPC never invoke provider work', async () => {
  for (const response of [
    { data: [{ id: 'bad' }], error: null },
    { data: null, error: 'unavailable' },
  ]) {
    let effects = 0;
    await assertRejects(() =>
      runLifecycleBatch(
        lifecycleStore(() => Promise.resolve(response)),
        'discord_cleanup',
        () => {
          effects++;
          return Promise.resolve({ state: 'completed' });
        }
      )
    );
    assertEquals(effects, 0);
  }
});
