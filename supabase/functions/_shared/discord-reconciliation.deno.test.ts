import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  desiredDiscordRoles,
  reconcileDiscordLifecycle,
  type DiscordEntitlement,
} from './discord-reconciliation.ts';
import type { LifecycleWork } from './lifecycle-worker.ts';
import { ProviderFailure } from './provider-http.ts';
const roles = { linked: 'linked', supporter: 'supporter', tiers: { scav: 'scav', chad: 'chad' } };
const config = {
  guildId: 'synthetic-guild',
  token: 'synthetic-token',
  managedRoleIds: ['linked', 'supporter', 'scav', 'chad'],
};
const active: DiscordEntitlement = {
  revision: 'one',
  linked: true,
  deleting: false,
  has_ever_supported: true,
  status: 'active',
  tier: 'scav',
  expires_at: null,
};
const work: LifecycleWork = {
  id: 'synthetic',
  claim_token: 'claim',
  kind: 'discord_cleanup',
  resource_id: 'synthetic-discord',
  user_id: 'synthetic-user',
  action: 'reconcile_current_supporter',
  attempts: 1,
  first_failure_at: null,
};
Deno.test(
  'Discord current entitlement preserves product tier/ever-supported rules and removes all managed roles after unlink/seal',
  () => {
    assertEquals(desiredDiscordRoles(active, roles), ['linked', 'supporter', 'scav']);
    assertEquals(desiredDiscordRoles({ ...active, status: 'expired' }, roles), [
      'linked',
      'supporter',
    ]);
    assertEquals(desiredDiscordRoles({ ...active, linked: false }, roles), []);
    assertEquals(desiredDiscordRoles({ ...active, deleting: true }, roles), []);
  }
);
Deno.test(
  'Re-link during old unlink cleanup restores the newly desired roles before completion',
  async () => {
    let reads = 0;
    const calls: string[] = [];
    await reconcileDiscordLifecycle(
      work,
      () => Promise.resolve(++reads === 1 ? { ...active, linked: false, revision: 'old' } : active),
      config,
      roles,
      (url, init) => {
        calls.push(init?.method + ' ' + String(url).split('/').at(-1));
        return Promise.resolve(new Response(null, { status: 204 }));
      }
    );
    assertEquals(reads, 4);
    assertEquals(calls.slice(-3), ['PUT linked', 'PUT supporter', 'PUT scav']);
  }
);
Deno.test(
  'Continuously changing desired state remains retryable rather than falsely completed',
  async () => {
    let revision = 0;
    const error = await assertRejects(
      () =>
        reconcileDiscordLifecycle(
          work,
          () => Promise.resolve({ ...active, revision: String(++revision) }),
          config,
          roles,
          () => Promise.resolve(new Response(null, { status: 204 }))
        ),
      ProviderFailure
    );
    assertEquals(error.retryable, true);
    assertEquals(revision, 6);
  }
);
