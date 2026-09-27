import { assert, assertEquals } from 'jsr:@std/assert';
import type { Database } from './database.types.ts';
import {
  invokeKickTeam,
  isRetryableKickError,
} from './kick-team-rpc.ts';
type KickArgs = Database['public']['Functions']['kick_team']['Args'];
// These assignments are compile-time assertions against the actual generated schema.
const kick: Database['public']['Functions']['kick_team'] = {
  Args: { p_team_id: 'team', p_initiator_id: 'owner', p_member_id: 'member' },
  Returns: 'kicked',
};
const makeClient = (
  results: Array<{ data: unknown; error: unknown }>
) => {
  let call = 0;
  return {
    rpc: (_fn: string, _args: KickArgs) => {
      const result = results[Math.min(call, results.length - 1)];
      call += 1;
      return Promise.resolve(result);
    },
  } as unknown as Parameters<typeof invokeKickTeam>[0];
};
Deno.test('kick RPC belongs to the public schema with string results', () => {
  assertEquals(kick.Returns, 'kicked');
});
Deno.test('only confirmed aborts are retryable kick errors', () => {
  assert(isRetryableKickError('40P01'));
  assert(isRetryableKickError('40001'));
  assert(isRetryableKickError('55P03'));
  assertEquals(isRetryableKickError('42501'), false);
  assertEquals(isRetryableKickError('P0001'), false);
  assertEquals(isRetryableKickError(''), false);
});
Deno.test('kick RPC retries the whole transaction on confirmed aborts', async () => {
  const client = makeClient([
    { data: null, error: { code: '40P01' } },
    { data: 'kicked', error: null },
  ]);
  const { data, error } = await invokeKickTeam(client, {
    p_team_id: '00000000-0000-0000-0000-000000000001',
    p_initiator_id: '00000000-0000-0000-0000-000000000002',
    p_member_id: '00000000-0000-0000-0000-000000000003',
  });
  assertEquals(data, 'kicked');
  assertEquals(error, null);
});
Deno.test('kick RPC exhausts retries and returns the last confirmed abort', async () => {
  let calls = 0;
  const client = {
    rpc: () => {
      calls += 1;
      return Promise.resolve({ data: null, error: { code: '40001' } });
    },
  } as unknown as Parameters<typeof invokeKickTeam>[0];
  const result = await invokeKickTeam(client, {
    p_team_id: '00000000-0000-0000-0000-000000000001',
    p_initiator_id: '00000000-0000-0000-0000-000000000002',
    p_member_id: '00000000-0000-0000-0000-000000000003',
  });
  // Three attempts total, then the failure is returned for the handler to map to 503.
  assertEquals(calls, 3);
  assertEquals(result.data, null);
  assertEquals(result.error?.code, '40001');
});
Deno.test('ambiguous transport failures are never retried', async () => {
  let calls = 0;
  const client = {
    rpc: () => {
      calls += 1;
      return Promise.resolve({ data: null, error: { code: 'P0001' } });
    },
  } as unknown as Parameters<typeof invokeKickTeam>[0];
  const result = await invokeKickTeam(client, {
    p_team_id: '00000000-0000-0000-0000-000000000001',
    p_initiator_id: '00000000-0000-0000-0000-000000000002',
    p_member_id: '00000000-0000-0000-0000-000000000003',
  });
  assertEquals(calls, 1);
  assertEquals(result.error?.code, 'P0001');
});
