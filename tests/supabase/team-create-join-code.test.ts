import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  rpcCalls: [] as unknown[],
  handler: null as null | ((req: Request) => Promise<Response>),
}));
vi.mock('../../supabase/functions/_shared/auth.ts', () => ({
  validateRequiredFields: () => null,
  createErrorResponse: (error: string, status: number) => Response.json({ error }, { status }),
  createSuccessResponse: (value: unknown, status: number) => Response.json(value, { status }),
}));
vi.mock('../../supabase/functions/_shared/team-membership.ts', () => ({
  rejectExistingTeamMembership: async () => null,
}));
vi.mock('../../supabase/functions/_shared/authenticated-mutation.ts', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../supabase/functions/_shared/authenticated-mutation.ts')
    >();
  return {
    ...actual,
    authenticateMutation: () => ({
      response: null,
      user: { id: 'owner-user' },
      supabase: {
        rpc: async (name: string, args: unknown) => {
          fixture.rpcCalls.push([name, args]);
          const { p_join_code } = args as { p_join_code: string };
          return {
            data: { id: 'team-1', join_code: p_join_code, owner_id: 'owner-user' },
            error: null,
          };
        },
      },
    }),
  };
});
beforeAll(async () => {
  vi.stubGlobal('Deno', {
    serve: (handler: typeof fixture.handler) => {
      fixture.handler = handler;
    },
  });
  await import('../../supabase/functions/team-create/index.ts');
});
beforeEach(() => {
  fixture.rpcCalls = [];
});
const create = (joinCode: string) =>
  fixture.handler!(
    new Request('https://edge.test/team-create', {
      method: 'POST',
      body: JSON.stringify({ name: 'Team', join_code: joinCode }),
    })
  );
describe('team-create join code length', () => {
  it('rejects codes shorter than 12 characters before creating the team', async () => {
    const response = await create('a'.repeat(11));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Join code must be at least 12 characters',
    });
    expect(fixture.rpcCalls).toEqual([]);
  });
  it('accepts a 12 character code', async () => {
    const joinCode = 'a'.repeat(12);
    const response = await create(joinCode);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      team: { id: 'team-1', joinCode },
    });
    expect(fixture.rpcCalls).toHaveLength(1);
  });
});
