import { runProviderBatch } from './provider-runner.ts';
import { stripeTestTransport } from './provider-cleanup.ts';
type Rpc = Parameters<typeof runProviderBatch>[0];
type Config = Parameters<typeof runProviderBatch>[2] & { stripeTestKey: string };
/** Test-only compatibility adapter; production never imports this module. */
export function runStagingProviderBatch(
  rpc: Rpc,
  kind: 'stripe_cleanup' | 'discord_cleanup',
  config: Config,
  fetcher: typeof fetch,
  limit = 10
) {
  return runProviderBatch(
    rpc,
    kind,
    config,
    stripeTestTransport(config.stripeTestKey, fetcher),
    fetcher,
    limit
  );
}
