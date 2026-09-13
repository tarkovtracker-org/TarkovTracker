import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import { chargeCustomer, paymentCanActivate } from './stripe-provider-shapes.ts';
import { ProviderFailure } from './provider-http.ts';
Deno.test(
  'Valid absent charge customer is distinct from malformed or mismatched provider response',
  () => {
    assertEquals(chargeCustomer({ id: 'ch_synthetic', customer: null }, 'ch_synthetic'), null);
    assertEquals(
      chargeCustomer({ id: 'ch_synthetic', customer: 'cus_synthetic' }, 'ch_synthetic'),
      'cus_synthetic'
    );
    for (const value of [
      { id: 'ch_synthetic', customer: 123 },
      { id: 'ch_synthetic' },
      { id: 'ch_other', customer: null },
    ]) {
      const error = assertThrows(() => chargeCustomer(value, 'ch_synthetic'), ProviderFailure);
      assertEquals(error.retryable, true);
    }
  }
);
Deno.test('Current refunded or disputed charge cannot reactivate a late one-time checkout', () => {
  assertEquals(paymentCanActivate({ disputed: true, amount_refunded: 0 }), false);
  assertEquals(paymentCanActivate({ disputed: false, amount_refunded: 100 }), false);
  assertEquals(paymentCanActivate({ disputed: false, amount_refunded: 0 }), true);
  assertThrows(() => paymentCanActivate({ disputed: false }), ProviderFailure);
});
