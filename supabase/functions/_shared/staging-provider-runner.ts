import { lifecycleStore, validateLifecycleClaim } from './lifecycle-store.ts';
import { runLifecycleBatch, type LifecycleWork } from './lifecycle-worker.ts';
import { executeProviderCleanup, stripeTestTransport } from './provider-cleanup.ts';
import { discordRoleCleanup } from './discord-lifecycle.ts';
import { reconcileDiscordLifecycle, type DiscordEntitlement } from './discord-reconciliation.ts';
import { verifyStripeFinancialState } from './stripe-financial-review.ts';
import { ProviderFailure } from './provider-http.ts';
type Rpc = Parameters<typeof lifecycleStore>[0];
type Config = {
  stripeTestKey: string;
  discordToken: string;
  guildId: string;
  roles: { linked: string; supporter: string; tiers: Record<string, string> };
};
function decodeContext(value: unknown): DiscordEntitlement {
  const row = contextRecord(value);
  if (!['revision', 'status', 'tier'].every((key) => typeof row[key] === 'string'))
    throw new ProviderFailure('discord_context_invalid', true);
  if (!['linked', 'deleting', 'has_ever_supported'].every((key) => typeof row[key] === 'boolean'))
    throw new ProviderFailure('discord_context_invalid', true);
  validateExpiry(row.expires_at);
  return row as DiscordEntitlement;
}
async function context(rpc: Rpc, work: LifecycleWork) {
  const result = await rpc('discord_lifecycle_context', {
    p_id: work.id,
    p_token: work.claim_token,
  });
  if (result.error) throw new ProviderFailure('discord_context_unavailable', true);
  return decodeContext(result.data);
}
/** Explicit prototype invocation; test-mode Stripe only, injected Discord transport, no scheduler. */
export function runStagingProviderBatch(
  rpc: Rpc,
  kind: 'stripe_cleanup' | 'discord_cleanup',
  config: Config,
  fetcher: typeof fetch,
  limit = 10
) {
  const discord = {
    guildId: config.guildId,
    token: config.discordToken,
    managedRoleIds: [
      config.roles.linked,
      config.roles.supporter,
      ...Object.values(config.roles.tiers),
    ],
  };
  const stripe = stripeTestTransport(config.stripeTestKey, fetcher);
  const providers = {
    stripe,
    verifyFinancialState: (resource: string) => verifyStripeFinancialState(resource, stripe),
    removeDiscordRoles: discordRoleCleanup(discord, fetcher),
    reconcileDiscord: (work: LifecycleWork) =>
      reconcileDiscordLifecycle(work, (task) => context(rpc, task), discord, config.roles, fetcher),
    validate: (work: LifecycleWork) => validateLifecycleClaim(rpc, work),
  };
  return runLifecycleBatch(
    lifecycleStore(rpc),
    kind,
    (work) => executeProviderCleanup(work, providers),
    limit
  );
}
function contextRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object')
    throw new ProviderFailure('discord_context_unavailable', true);
  return value as Record<string, unknown>;
}
function validateExpiry(value: unknown) {
  if (value !== null && typeof value !== 'string')
    throw new ProviderFailure('discord_context_invalid', true);
}
