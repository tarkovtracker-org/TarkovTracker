import { assertEquals } from 'jsr:@std/assert@1';
import { runAccountDeletion } from './account-deletion-workflow.ts';
import type { AccountDeletionClient } from './account-deletion-lifecycle.ts';
import { withProviderBudget } from './provider-execution.ts';
Deno.test(
  'prepared retry makes progress with two terminal subscriptions within shared budget',
  async () => {
    const previous = Deno.env.get('STRIPE_SECRET_KEY');
    Deno.env.set('STRIPE_SECRET_KEY', 'sk_test_synthetic_no_network');
    let prepared = false;
    let clear = false;
    let authCalls = 0;
    let proofs = 0;
    let requests = 0;
    const subscriptions = ['sub_one', 'sub_two'].map((id) => ({
      id,
      customer: 'cus_synthetic',
      status: 'canceled',
      metadata: { user_id: 'synthetic' },
    }));
    const transport: typeof fetch = (input) => {
      requests++;
      const path = new URL(String(input)).pathname;
      const subscription = subscriptions.find((s) => path === '/v1/subscriptions/' + s.id);
      return Promise.resolve(
        Response.json(
          subscription ?? {
            data: path === '/v1/subscriptions' ? subscriptions : [],
            has_more: false,
          }
        )
      );
    };
    const client = {
      rpc: (name: string, args: Record<string, unknown>) => {
        let data: unknown;
        switch (name) {
          case 'account_deletion_resume_stage':
            data = prepared ? 'auth_delete' : 'prepare';
            break;
          case 'begin_final_billing_verification':
            clear = false;
            data = {
              status: 'checking',
              token: String(++proofs),
              resources: ['cus_synthetic', 'sub_one', 'sub_two'],
              discover_legacy: true,
            };
            break;
          case 'preserve_final_billing_resource':
            data = true;
            break;
          case 'finish_final_billing_verification':
            clear = args.p_outcome === 'clear';
            data = clear;
            break;
          case 'seal_account_lifecycle':
            assertEquals(clear, true);
            data = 'ready';
            break;
          case 'prepare_account_deletion':
            prepared = true;
            data = 'ready';
            break;
          case 'authorize_account_auth_delete':
            assertEquals(clear, true);
            clear = false;
            data = true;
            break;
          case 'park_account_lifecycle':
            data = true;
            break;
          case 'finish_account_deletion':
            data = 'completed';
            break;
          default:
            throw new Error('Unexpected RPC ' + name);
        }
        return Promise.resolve({ data, error: null });
      },
      auth: {
        admin: {
          deleteUser: () => {
            authCalls++;
            return Promise.resolve({ error: null });
          },
        },
      },
    } as unknown as AccountDeletionClient;
    try {
      const first = await withProviderBudget(
        () => runAccountDeletion(client, 'synthetic', 'claim'),
        transport
      );
      assertEquals(first.status, 'provider_wait');
      assertEquals(prepared, true);
      assertEquals(authCalls, 0);
      assertEquals(requests, 12);
      requests = 0;
      const second = await withProviderBudget(
        () => runAccountDeletion(client, 'synthetic', 'claim'),
        transport
      );
      assertEquals(second.status, 'completed');
      assertEquals(requests, 7);
      assertEquals(proofs, 3);
      assertEquals(authCalls, 1);
    } finally {
      if (previous === undefined) Deno.env.delete('STRIPE_SECRET_KEY');
      else Deno.env.set('STRIPE_SECRET_KEY', previous);
    }
  }
);
Deno.test('each transient Auth retry obtains and consumes a new Stripe proof', async () => {
  const previous = Deno.env.get('STRIPE_SECRET_KEY');
  Deno.env.set('STRIPE_SECRET_KEY', 'sk_test_synthetic_no_network');
  let proofs = 0;
  let consumed = 0;
  let authCalls = 0;
  let requests = 0;
  const client = {
    rpc: (name: string) => {
      let data: unknown = true;
      if (name === 'account_deletion_resume_stage') data = 'auth_delete';
      if (name === 'begin_final_billing_verification') {
        data = {
          status: 'checking',
          token: String(++proofs),
          resources: ['cus_synthetic'],
          discover_legacy: false,
        };
      }
      if (name === 'authorize_account_auth_delete') consumed++;
      if (name === 'finish_account_deletion') data = 'completed';
      return Promise.resolve({ data, error: null });
    },
    auth: {
      admin: {
        deleteUser: () => {
          assertEquals(proofs, ++authCalls);
          assertEquals(consumed, authCalls);
          return Promise.resolve({ error: authCalls < 4 ? { status: 503 } : null });
        },
      },
    },
  } as unknown as AccountDeletionClient;
  try {
    const result = await withProviderBudget(
      () => runAccountDeletion(client, 'synthetic', 'claim', () => Promise.resolve()),
      () => {
        requests++;
        return Promise.resolve(Response.json({ data: [], has_more: false }));
      }
    );
    assertEquals(result.status, 'completed');
    assertEquals(proofs, 4);
    assertEquals(requests, 12);
    assertEquals(authCalls, 4);
  } finally {
    if (previous === undefined) Deno.env.delete('STRIPE_SECRET_KEY');
    else Deno.env.set('STRIPE_SECRET_KEY', previous);
  }
});
for (const currentClaim of [true, false]) {
  Deno.test(
    `denied Auth authorization parks provider work only for current claim: ${currentClaim}`,
    async () => {
      const previous = Deno.env.get('STRIPE_SECRET_KEY');
      Deno.env.set('STRIPE_SECRET_KEY', 'sk_test_synthetic_no_network');
      let authCalls = 0;
      let parked = 0;
      const client = {
        rpc: (name: string, args: Record<string, unknown>) => {
          let data: unknown = true;
          if (name === 'account_deletion_resume_stage') data = 'auth_delete';
          if (name === 'begin_final_billing_verification') {
            data = {
              status: 'checking',
              token: 'fresh',
              resources: ['cus_synthetic'],
              discover_legacy: false,
            };
          }
          if (name === 'authorize_account_auth_delete') data = false;
          if (name === 'park_account_lifecycle') {
            assertEquals(args.p_reason, 'provider_pending');
            parked++;
            data = currentClaim;
          }
          return Promise.resolve({ data, error: null });
        },
        auth: {
          admin: {
            deleteUser: () => {
              authCalls++;
              throw new Error('Auth must remain blocked');
            },
          },
        },
      } as unknown as AccountDeletionClient;
      try {
        const result = await withProviderBudget(
          () => runAccountDeletion(client, 'synthetic', 'claim'),
          () => Promise.resolve(Response.json({ data: [], has_more: false }))
        );
        assertEquals(result.status, currentClaim ? 'provider_pending' : 'lease_lost');
        assertEquals(authCalls, 0);
        assertEquals(parked, 1);
      } finally {
        if (previous === undefined) Deno.env.delete('STRIPE_SECRET_KEY');
        else Deno.env.set('STRIPE_SECRET_KEY', previous);
      }
    }
  );
}
