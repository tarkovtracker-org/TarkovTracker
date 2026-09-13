import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import { runStagingProviderBatch } from './staging-provider-runner.ts';
const config = {
  stripeTestKey: 'sk_test_synthetic',
  discordToken: 'synthetic',
  guildId: 'guild',
  roles: { linked: 'linked', supporter: 'supporter', tiers: { premium: 'premium' } },
};
Deno.test(
  'Explicit staging runner claims, removes managed Discord roles, and fences completion',
  async () => {
    const calls: string[] = [];
    const work = {
      id: 'work',
      user_id: 'user',
      kind: 'discord_cleanup',
      action: 'remove_managed_roles',
      resource_id: 'discord',
      claim_token: 'claim',
      attempts: 1,
      first_failure_at: null,
    };
    const result = await runStagingProviderBatch(
      (name, args) => {
        calls.push(name);
        if (name === 'claim_lifecycle_work') return Promise.resolve({ data: [work], error: null });
        if (name === 'lifecycle_work_status')
          return Promise.resolve({ data: { valid_claim: true }, error: null });
        if (name === 'discord_lifecycle_context')
          return Promise.resolve({
            data: {
              revision: 'same',
              linked: false,
              deleting: false,
              has_ever_supported: true,
              status: 'active',
              tier: 'premium',
              expires_at: null,
            },
            error: null,
          });
        assertEquals(args.p_state, 'completed');
        assertEquals(args.p_token, 'claim');
        return Promise.resolve({ data: true, error: null });
      },
      'discord_cleanup',
      config,
      (_url, init) => {
        assertEquals(init?.method, 'DELETE');
        calls.push('discord_delete');
        return Promise.resolve(new Response(null, { status: 204 }));
      }
    );
    assertEquals(result, { claimed: 1, advanced: 1 });
    assertEquals(calls.filter((name) => name === 'discord_delete').length, 3);
  }
);
Deno.test('Staging runner rejects live Stripe credentials before any invocation', () => {
  assertThrows(() =>
    runStagingProviderBatch(
      () => {
        throw new Error('must not call database');
      },
      'stripe_cleanup',
      { ...config, stripeTestKey: 'sk_live_synthetic' },
      fetch
    )
  );
});
