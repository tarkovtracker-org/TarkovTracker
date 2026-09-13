import { assertEquals } from 'jsr:@std/assert@1';
import { reconcileCheckoutInitiations } from './checkout-reconciliation.ts';
Deno.test(
  'Unavailable checkout is deferred without starving the next completed session',
  async () => {
    const deferred: unknown[] = [];
    const result = await reconcileCheckoutInitiations(
      (name, args) => {
        if (name === 'provider_initiation_candidates')
          return Promise.resolve({
            data: ['bad', 'good'].map((id) => ({ id, user_id: 'user', resource_id: id })),
            error: null,
          });
        if (name === 'defer_provider_initiation') deferred.push(args);
        return Promise.resolve({ data: true, error: null });
      },
      (path) =>
        path.endsWith('bad')
          ? Promise.reject(new Error('synthetic network failure'))
          : Promise.resolve({
              id: 'good',
              client_reference_id: 'user',
              status: 'complete',
              payment_status: 'paid',
              customer: 'cus_fake',
              subscription: null,
            })
    );
    assertEquals(result, { examined: 2, completed: 1 });
    assertEquals(deferred.length, 1);
  }
);
