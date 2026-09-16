import { boundedDeliveryRpc, type DeliveryRpc } from './lifecycle-delivery-context.ts';
/** Renewal cannot revive an expired database lease and is capped by its original deadline. */
export function startDeliveryHeartbeat(rpc: DeliveryRpc, invocation: string) {
  const abort = new AbortController();
  let pending: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (!pending) {
      pending = renew(rpc, invocation, abort).finally(() => {
        pending = undefined;
      });
    }
  }, 5000);
  const deadline = setTimeout(() => abort.abort(), 60000);
  return {
    abort,
    async stop() {
      clearInterval(timer);
      clearTimeout(deadline);
      await pending;
    },
  };
}
async function renew(rpc: DeliveryRpc, invocation: string, abort: AbortController) {
  try {
    const result = await boundedDeliveryRpc(rpc, 'renew_lifecycle_delivery', {
      p_invocation: invocation,
    });
    if (result.error || result.data !== true) abort.abort();
  } catch {
    abort.abort();
  }
}
