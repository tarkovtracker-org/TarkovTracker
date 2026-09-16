import { runProviderBatch } from './provider-runner.ts';
import { providerJson } from './provider-http.ts';
import { providerExecutionFetch } from './provider-execution.ts';
import { reconcileCheckoutInitiations } from './checkout-reconciliation.ts';
type Rpc = Parameters<typeof runProviderBatch>[0];
function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
function stripeTransport(fetcher: typeof fetch) {
  return (path: string, method = 'GET', body?: string, idempotencyKey?: string) =>
    providerJson(
      `https://api.stripe.com/v1${path}`,
      {
        method,
        body,
        headers: {
          Authorization: `Bearer ${required('STRIPE_SECRET_KEY')}`,
          'Stripe-Version': '2024-06-20',
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
      },
      fetcher
    );
}
function discordConfiguration() {
  return {
    discordToken: required('DISCORD_BOT_TOKEN'),
    guildId: required('DISCORD_GUILD_ID'),
    roles: {
      linked: required('DISCORD_LINKED_ROLE_ID'),
      supporter: required('DISCORD_SUPPORTER_ROLE_ID'),
      tiers: {
        scav: required('DISCORD_SCAV_ROLE_ID'),
        timmy: required('DISCORD_TIMMY_ROLE_ID'),
        chad: required('DISCORD_CHAD_ROLE_ID'),
      },
    },
  };
}
export function runProductionProviderBatch(rpc: Rpc, kind: 'stripe_cleanup' | 'discord_cleanup') {
  const fetcher = providerExecutionFetch();
  return runProviderBatch(
    rpc,
    kind,
    kind === 'discord_cleanup'
      ? discordConfiguration()
      : { discordToken: '', guildId: '', roles: { linked: '', supporter: '', tiers: {} } },
    stripeTransport(fetcher),
    fetcher,
    1
  );
}
export function runProductionCheckoutBatch(rpc: Rpc) {
  return reconcileCheckoutInitiations(rpc, stripeTransport(providerExecutionFetch()), 1);
}
