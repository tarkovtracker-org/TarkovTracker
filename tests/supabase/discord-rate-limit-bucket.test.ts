import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  enforceUserMutationRateLimit,
  type MutationRateLimitAction,
} from '../../supabase/functions/_shared/rate-limit.ts';
beforeAll(() => {
  vi.stubGlobal('Deno', { env: { get: () => undefined } });
});
type ConsumeArgs = { p_limit: number; p_scope: string; p_subject: string };
const createLimiter = () => {
  const counts = new Map<string, number>();
  const supabase = {
    rpc: async (_name: string, args: ConsumeArgs) => {
      const key = `${args.p_subject}:${args.p_scope}`;
      const count = counts.get(key) ?? 0;
      if (count >= args.p_limit) return { data: { allowed: false, reset_at: null }, error: null };
      counts.set(key, count + 1);
      return { data: { allowed: true, reset_at: null }, error: null };
    },
  };
  const consume = async (action: MutationRateLimitAction) => {
    const response = await enforceUserMutationRateLimit(
      new Request('https://edge.test', { method: 'POST' }),
      supabase as never,
      'user-1',
      action
    );
    return response?.status ?? 200;
  };
  return { consume };
};
describe('discord rate-limit bucket', () => {
  it('keeps a role-sync slot for restoring roles after an allowed unlink', async () => {
    const { consume } = createLimiter();
    for (let i = 0; i < 8; i += 1) expect(await consume('discord-role-sync')).toBe(200);
    expect(await consume('discord-unlink')).toBe(200);
    expect(await consume('discord-role-sync')).toBe(200);
  });
  it('refuses unlink once the restore slot would be consumed', async () => {
    const { consume } = createLimiter();
    for (let i = 0; i < 9; i += 1) expect(await consume('discord-role-sync')).toBe(200);
    expect(await consume('discord-unlink')).toBe(429);
    expect(await consume('discord-role-sync')).toBe(200);
  });
});
