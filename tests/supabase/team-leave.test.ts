import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  result: 'left',
  errors: [] as string[],
  pointer: 'old-team' as string | null,
  tableCalls: [] as string[],
  calls: [] as unknown[],
  handler: null as null | ((req: Request) => Promise<Response>),
}));
vi.mock('../../supabase/functions/_shared/auth.ts', () => ({
  validateRequiredFields: () => null,
  validateUUIDs: () => null,
  createErrorResponse: (error: string, status: number) => Response.json({ error }, { status }),
  createSuccessResponse: (value: unknown, status: number) => Response.json(value, { status }),
}));
vi.mock('../../supabase/functions/_shared/authenticated-mutation.ts', () => ({
  authenticateMutation: () => ({
    response: null,
    user: { id: 'validated-user' },
    supabase: {
      rpc: async (name: string, args: unknown) => {
        fixture.calls.push([name, args]);
        const code = fixture.errors.shift();
        // Only a committed leave permits the simulated newer join before the RPC response.
        if (!code && fixture.result === 'left') fixture.pointer = 'new-team';
        return { data: code ? null : fixture.result, error: code ? { code } : null };
      },
      from: (table: string) => {
        fixture.tableCalls.push(table);
        if (table !== 'user_system') throw new Error('Unexpected nontransactional table access');
        return {
          // Model the old handler's late upsert instead of throwing before it can clear state.
          upsert: async (row: { pvp_team_id: string | null }) => {
            fixture.pointer = row.pvp_team_id;
            return { error: null };
          },
        };
      },
    },
  }),
}));
beforeAll(async () => {
  vi.stubGlobal('Deno', {
    serve: (handler: typeof fixture.handler) => {
      fixture.handler = handler;
    },
  });
  await import('../../supabase/functions/team-leave/index.ts');
});
beforeEach(() => {
  fixture.calls = [];
  fixture.tableCalls = [];
  fixture.pointer = 'old-team';
  fixture.result = 'left';
  fixture.errors = [];
});
const request = () =>
  new Request('http://localhost/team-leave', {
    method: 'POST',
    body: JSON.stringify({
      teamId: 'old-team',
      userId: 'victim',
      initiated_by: 'victim',
      target_user: 'victim',
      created_at: '2099-01-01',
    }),
  });
describe('atomic leave endpoint', () => {
  it('uses only validated identity and preserves an interleaved new join', async () => {
    expect((await fixture.handler!(request())).status).toBe(200);
    expect(fixture.calls).toEqual([
      ['leave_team', { p_team_id: 'old-team', p_user_id: 'validated-user' }],
    ]);
    expect(fixture.pointer).toBe('new-team');
    expect(fixture.tableCalls).toEqual([]);
  });
  for (const [result, status] of [
    ['cooldown', 429],
    ['owner', 400],
    ['not_member', 404],
    ['not_found', 404],
    ['unknown', 500],
  ] as const) {
    it(`maps ${result} without additional effects`, async () => {
      fixture.result = result;
      expect((await fixture.handler!(request())).status).toBe(status);
      expect(fixture.calls).toHaveLength(1);
    });
  }
});
describe('bounded transaction retries', () => {
  for (const code of ['40P01', '40001', '55P03']) {
    it(`retries the entire aborted RPC for ${code}`, async () => {
      fixture.errors = [code];
      expect((await fixture.handler!(request())).status).toBe(200);
      expect(fixture.calls).toHaveLength(2);
      expect(fixture.calls[0]).toEqual(fixture.calls[1]);
    });
    it(`bounds ${code} retries and returns retryable failure`, async () => {
      fixture.errors = [code, code, code];
      const response = await fixture.handler!(request());
      expect(response.status).toBe(503);
      expect(response.headers.get('Retry-After')).toBe('1');
      expect(fixture.calls).toHaveLength(3);
    });
  }
  for (const code of ['PGRST000', '57014', 'P0001']) {
    it(`does not replay ambiguous or non-retryable ${code}`, async () => {
      fixture.errors = [code];
      expect((await fixture.handler!(request())).status).toBe(500);
      expect(fixture.calls).toHaveLength(1);
    });
  }
});
