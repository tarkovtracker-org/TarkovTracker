import { AsyncLocalStorage } from 'node:async_hooks';
export type DeliveryRpc = (
  name: string,
  args: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: unknown }>;
type Context = { invocation: string; rpc: DeliveryRpc; abort: AbortController };
const delivery = new AsyncLocalStorage<Context>();
export function runDeliveryContext<T>(context: Context, operation: () => Promise<T>) {
  return delivery.run(context, operation);
}
/** Database time is authoritative. Local cancellation only shortens an invocation. */
export async function validateDeliveryAuthority(): Promise<void> {
  const context = delivery.getStore();
  if (!context) return;
  if (context.abort.signal.aborted) throw new Error('Lifecycle invocation unavailable');
  const result = await boundedDeliveryRpc(context.rpc, 'lifecycle_delivery_valid', {
    p_invocation: context.invocation,
  });
  if (!validResponse(result)) {
    context.abort.abort();
    throw new Error('Lifecycle invocation expired');
  }
}
/** Applied only to lifecycle clients; A/C clients and authentication are unchanged. */
export const lifecycleDatabaseFetch: typeof fetch = async (input, init) => {
  const context = delivery.getStore();
  if (!context)
    return fetch(input, {
      ...init,
      signal: deliverySignal(input, init, AbortSignal.timeout(5000), 5000),
    });
  const url = input instanceof Request ? input.url : String(input);
  if (!url.includes('/rest/v1/')) await validateDeliveryAuthority();
  const headers = requestHeaders(input, init);
  headers.set('x-lifecycle-delivery', context.invocation);
  return fetch(input, {
    ...init,
    headers,
    signal: deliverySignal(input, init, context.abort.signal, 5000),
  });
};
function deliverySignal(
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
  signal: AbortSignal,
  milliseconds: number
): AbortSignal {
  return AbortSignal.any(
    [signal, AbortSignal.timeout(milliseconds), requestAbortSignal(input, init)].filter(isSignal)
  );
}
function requestHeaders(input: Parameters<typeof fetch>[0], init?: RequestInit): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return headers;
}
/** Bounds caller waiting even when the original authentication client has no fetch timeout.
 * A late renewal is still constrained by the database's immutable invocation deadline.
 */
export async function boundedDeliveryRpc(
  rpc: DeliveryRpc,
  name: string,
  args: Record<string, unknown>
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Lifecycle control request timed out')), 5000);
  });
  try {
    return await Promise.race([Promise.resolve(rpc(name, args)), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
export function deliveryAbortSignal(): AbortSignal | undefined {
  return delivery.getStore()?.abort.signal;
}
function validResponse(result: { data: unknown; error: unknown }): boolean {
  return !result.error && result.data === true;
}
export function requestAbortSignal(input: Parameters<typeof fetch>[0], init?: RequestInit) {
  return init?.signal ?? (input instanceof Request ? input.signal : undefined);
}
export function isSignal(signal: AbortSignal | null | undefined): signal is AbortSignal {
  return signal != null;
}
