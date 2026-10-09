import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  actions: [] as string[],
  tableCalls: [] as string[],
  discordCalls: [] as string[],
  handlers: [] as Array<(req: Request) => Promise<Response>>,
}));
vi.mock('../../supabase/functions/_shared/auth.ts', () => ({
  createErrorResponse: (error: string, status: number) => Response.json({ error }, { status }),
  createSuccessResponse: (value: unknown, status: number) => Response.json(value, { status }),
}));
vi.mock('../../supabase/functions/_shared/authenticated-mutation.ts', () => ({
  authenticateMutation: async (_req: Request, action: string) => {
    fixture.actions.push(action);
    return {
      response: Response.json({ error: 'Too many requests' }, { status: 429 }),
      supabase: null,
      user: null,
    };
  },
}));
vi.mock('../../supabase/functions/_shared/discord.ts', () => {
  const record =
    (name: string) =>
    async (..._args: unknown[]) => {
      fixture.discordCalls.push(name);
    };
  return {
    isDiscordNotInGuildError: () => false,
    removeAllTierRoles: record('removeAllTierRoles'),
    removeLinkedAccountRole: record('removeLinkedAccountRole'),
    removeSupporterRole: record('removeSupporterRole'),
    syncLinkedAccountRole: record('syncLinkedAccountRole'),
    syncRolesForSupporter: record('syncRolesForSupporter'),
  };
});
beforeAll(async () => {
  vi.stubGlobal('Deno', {
    serve: (handler: (req: Request) => Promise<Response>) => {
      fixture.handlers.push(handler);
    },
  });
  await import('../../supabase/functions/discord-role-sync/index.ts');
  await import('../../supabase/functions/discord-unlink/index.ts');
});
beforeEach(() => {
  fixture.actions = [];
  fixture.discordCalls = [];
});
const request = () =>
  new Request('https://example.test', {
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
    body: '{}',
  });
describe('Discord Edge Function rate limits', () => {
  it.each([
    [0, 'discord-role-sync'],
    [1, 'discord-unlink'],
  ])('handler %i rejects a rate-limited %s call before touching Discord', async (index, action) => {
    const response = await fixture.handlers[index]!(request());
    expect(response.status).toBe(429);
    expect(fixture.actions).toEqual([action]);
    expect(fixture.discordCalls).toEqual([]);
  });
});
