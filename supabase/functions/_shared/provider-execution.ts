import {
  deliveryAbortSignal,
  isSignal,
  requestAbortSignal,
  validateDeliveryAuthority,
} from './lifecycle-delivery-context.ts';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ProviderFailure } from './provider-http.ts';
const execution = new AsyncLocalStorage<typeof fetch>();
/** Per-async-invocation isolation: never changes global fetch or another request's budget. */
export function withProviderBudget<T>(
  operation: () => Promise<T>,
  fetcher: typeof fetch = fetch
): Promise<T> {
  if (execution.getStore()) return operation();
  return execution.run(boundedTransport(fetcher), operation);
}
export function providerExecutionFetch(): typeof fetch {
  return execution.getStore() ?? fetch;
}
function boundedTransport(fetcher: typeof fetch): typeof fetch {
  const deadline = Date.now() + 50000;
  let remaining = 12;
  return async (input, init) => {
    await validateDeliveryAuthority();
    const milliseconds = deadline - Date.now();
    if (--remaining < 0 || milliseconds <= 0) {
      throw new ProviderFailure('invocation_budget', true);
    }
    return fetcher(input, {
      ...init,
      signal: requestSignal(milliseconds, input, init),
    });
  };
}
function requestSignal(
  milliseconds: number,
  input: Parameters<typeof fetch>[0],
  init?: RequestInit
): AbortSignal {
  return AbortSignal.any(
    [
      AbortSignal.timeout(milliseconds),
      requestAbortSignal(input, init),
      deliveryAbortSignal(),
    ].filter(isSignal)
  );
}
