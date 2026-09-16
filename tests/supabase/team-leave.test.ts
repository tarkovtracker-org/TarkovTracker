import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  result: 'left',
  errors: [] as string[],
  pointer: 'old-team',
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
        // A newer join happens after the database leave transaction and before its response.
        fixture.pointer = 'new-team';
        const code = fixture.errors.shift();
        return { data: code ? null : fixture.result, error: code ? { code } : null };
      },
      from: () => {
        throw new Error('Unexpected nontransactional write after leave');
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
