import { lifecycleDatabaseFetch } from '../_shared/lifecycle-delivery-context.ts';
import { withProviderBudget } from '../_shared/provider-execution.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { lifecycleWorkerHandler } from '../_shared/lifecycle-worker-http.ts';
import { withLifecycleDelivery } from '../_shared/lifecycle-delivery.ts';
import {
  runProductionProviderBatch,
  runProductionCheckoutBatch,
} from '../_shared/production-provider-runner.ts';
const handler = lifecycleWorkerHandler(Deno.env.get('LIFECYCLE_WORKER_SECRET'), (kind) => {
  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: lifecycleDatabaseFetch },
    }
  );
  const rpc = async (name: string, args: Record<string, unknown>) => await client.rpc(name, args);
  return withLifecycleDelivery(rpc, 'provider_processing', () =>
    withProviderBudget(async () => {
      if (kind === 'checkout_reconciliation') return runProductionCheckoutBatch(rpc);
      if (kind === 'stripe_event') {
        const { recoverStripeEvents } = await import('../stripe-webhook/index.ts');
        return recoverStripeEvents(1);
      }
      return runProductionProviderBatch(rpc, kind);
    })
  );
});
if (import.meta.main) Deno.serve(handler);
export { handler };
