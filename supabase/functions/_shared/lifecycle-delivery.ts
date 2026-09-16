import { boundedDeliveryRpc, runDeliveryContext } from './lifecycle-delivery-context.ts';
import { startDeliveryHeartbeat } from './lifecycle-delivery-heartbeat.ts';
import { corsHeadersFor } from './cors.ts';
type Rpc = (
  name: string,
  args: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: unknown }>;
export type DeliveryComponent = 'deletion_intake' | 'deletion_reconcile' | 'provider_processing';
export class DeliveryUnavailable extends Error {
  constructor() {
    super('Lifecycle processing temporarily unavailable');
  }
}
/** Admission and disable serialize in PostgreSQL; no transaction spans the callback. */
export async function withLifecycleDelivery<T>(
  rpc: Rpc,
  component: DeliveryComponent,
  operation: (invocation: string) => Promise<T>
): Promise<T> {
  const invocation = await admit(rpc, component);
  const heartbeat = startDeliveryHeartbeat(rpc, invocation);
  try {
    return await runDeliveryContext({ invocation, rpc, abort: heartbeat.abort }, () =>
      operation(invocation)
    );
  } finally {
    await heartbeat.stop();
    await release(rpc, component, invocation);
  }
}
export function deliveryUnavailableResponse(req: Request): Response {
  return Response.json(
    { error: 'Temporarily unavailable', retryable: true },
    { status: 503, headers: { ...corsHeadersFor(req), 'Retry-After': '60' } }
  );
}
async function admit(rpc: Rpc, component: DeliveryComponent): Promise<string> {
  try {
    const result = await boundedDeliveryRpc(rpc, 'begin_lifecycle_delivery', {
      p_component: component,
    });
    if (result.error || typeof result.data !== 'string') throw new DeliveryUnavailable();
    return result.data;
  } catch {
    throw new DeliveryUnavailable();
  }
}
async function release(rpc: Rpc, component: DeliveryComponent, invocation: string): Promise<void> {
  try {
    const result = await boundedDeliveryRpc(rpc, 'finish_lifecycle_delivery', {
      p_invocation: invocation,
    });
    if (result.error || result.data !== true) throw new Error('release_failed');
  } catch {
    // Database expiry recovers admission even when termination prevents this best-effort release.
    console.error(JSON.stringify({ component, event: 'delivery_release_failed' }));
  }
}
