import { assertEquals, assertMatch } from 'jsr:@std/assert@1.0.19';
import { describe, it } from 'jsr:@std/testing@1.0.19/bdd';
import {
  claimDeletionJob,
  computeBackoffMs,
  consumeDeletionAttempt,
  deleteUserWithRetry,
  getErrorMessage,
  isNotFoundError,
  type AccountDeletionClient,
} from './account-deletion-lifecycle.ts';
const asClient = (value: unknown) => value as AccountDeletionClient;
describe('account deletion lifecycle', () => {
  it('normalizes deletion errors and recognizes supported not-found shapes', () => {
    assertEquals(getErrorMessage(new Error('failure')), 'failure');
    assertEquals(isNotFoundError({ status: 404 }), true);
    assertEquals(isNotFoundError({ code: 'user_not_found' }), true);
    assertEquals(isNotFoundError({ message: 'User with id abc not found' }), true);
    assertEquals(isNotFoundError({ message: 'No user exists for this identifier' }), true);
    assertEquals(isNotFoundError({ message: 'permission denied' }), false);
  });
  it('computes bounded exponential backoff with injectable jitter', () => {
    assertEquals(
      computeBackoffMs(1, 300, 5000, () => 0),
      300
    );
    assertEquals(
      computeBackoffMs(3, 300, 5000, () => 0.5),
      1325
    );
    assertEquals(
      computeBackoffMs(8, 300, 5000, () => 0.99),
      5000
    );
  });
  it('retries auth deletion without sleeping after the final failure', async () => {
    let attempts = 0;
    const waits: number[] = [];
    const client = asClient({
      auth: {
        admin: {
          deleteUser: () => {
            attempts += 1;
            return Promise.resolve({ error: new Error(`failure ${attempts}`) });
          },
        },
      },
    });
    const result = await deleteUserWithRetry(client, 'user-id', (ms) => {
      waits.push(ms);
      return Promise.resolve();
    });
    assertEquals(result.ok, false);
    assertEquals(result.attempts, 4);
    assertEquals(attempts, 4);
    assertEquals(waits.length, 3);
    assertMatch(getErrorMessage(result.lastError), /failure 4/);
  });
  it('treats a missing auth user as a completed deletion', async () => {
    const client = asClient({
      auth: {
        admin: {
          deleteUser: () => Promise.resolve({ error: { code: 'user_not_found' } }),
        },
      },
    });
    assertEquals(await deleteUserWithRetry(client, 'user-id'), {
      ok: true,
      attempts: 1,
      lastError: null,
    });
  });
  it('maps atomic claim and rate-limit RPC results', async () => {
    const calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
    const client = asClient({
      rpc: (fn: string, args?: Record<string, unknown>) => {
        calls.push({ fn, args });
        if (fn === 'claim_account_deletion_job') {
          return Promise.resolve({
            data: [{ claimed: false, status: 'in_progress', claim_token: 'claim-token' }],
            error: null,
          });
        }
        return Promise.resolve({
          data: [{ allowed: false, retry_after_seconds: 42 }],
          error: null,
        });
      },
    });
    assertEquals(await claimDeletionJob(client, 'user-id', true), {
      claimed: false,
      status: 'in_progress',
      claimToken: 'claim-token',
      error: null,
    });
    assertEquals(await consumeDeletionAttempt(client, 'user-id', '127.0.0.1', 'agent'), {
      allowed: false,
      retryAfterSeconds: 42,
      error: null,
    });
    assertEquals(calls, [
      {
        fn: 'claim_account_deletion_job',
        args: { p_user_id: 'user-id', p_create_if_missing: true },
      },
      {
        fn: 'consume_account_deletion_attempt',
        args: {
          p_user_id: 'user-id',
          p_ip_address: '127.0.0.1',
          p_user_agent: 'agent',
        },
      },
    ]);
  });
});
