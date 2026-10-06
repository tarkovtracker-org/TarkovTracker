import { assertEquals, assert } from 'jsr:@std/assert@1.0.19';
import { stub } from 'jsr:@std/testing@1.0.19/mock';
type Receipt = { state: string; token: string; expires: number };
const receipts = new Map<string, Receipt>();
let upstreamAttempts = 0;
let failUpstream = false;
let failOutcome = false;
let failAttribution = false;
let supporterWrites = 0;
const denials = new Map<string, string>();
let writeHeaders: Headers | undefined;
let handler: (req: Request) => Promise<Response>;
const secret = 'whsec_isolated_test';
const userId = '00000000-0000-0000-0000-000000000702';
const supporter = {
  user_id: userId,
  stripe_subscription_id: 'sub_test',
  status: 'active',
  updated_at: '2026-01-01T00:00:00Z',
  discord_user_id: null,
  stripe_customer_id: 'cus_test',
  type: 'subscription',
  tier: 'scav',
  has_ever_supported: true,
  retention_history_verified: true,
};
let row: Record<string, unknown> = { ...supporter };
function stripeResponse(url: URL): Response {
  upstreamAttempts++;
  if (failUpstream) return reply({ error: 'isolated Stripe outage' }, 503);
  if (url.pathname.startsWith('/v1/charges/')) {
    if (failAttribution) return reply({ error: 'isolated attribution outage' }, 503);
    return reply({ customer: 'cus_test', metadata: { user_id: userId } });
  }
  return reply({ id: 'sub_test', status: 'canceled', ended_at: 1_700_000_000 });
}
async function supporterResponse(request: Request, url: URL): Promise<Response> {
  const matches = [...url.searchParams]
    .filter(([, value]) => value.startsWith('eq.'))
    .every(([column, value]) => String(row[column]) === value.slice(3));
  if (request.method === 'GET') return reply(matches ? { ...row } : null);
  writeHeaders = request.headers;
  if (!matches) return reply([]);
  row = { ...row, ...(await request.json()), updated_at: `revision_${++supporterWrites}` };
  return reply([{ ...row }]);
}
async function disqualifyResponse(request: Request): Promise<Response> {
  const params = await request.json();
  if (!denials.has(params.p_customer_id)) denials.set(params.p_customer_id, '2026-01-01T00:00:00Z');
  row = {
    ...row,
    supporter_disqualified_at: denials.get(params.p_customer_id),
    status: 'cancelled',
    has_ever_supported: false,
  };
  writeHeaders = request.headers;
  return new Response(null, { status: 204 });
}
function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function claim(params: Record<string, string>): Response {
  const receipt = receipts.get(params.p_event_id);
  if (receipt && ['completed', 'terminal', 'legacy_unknown'].includes(receipt.state)) {
    return reply({ outcome: receipt.state });
  }
  if (receipt?.state === 'processing' && receipt.expires > Date.now()) {
    return reply({ outcome: 'in_progress' });
  }
  const token = crypto.randomUUID();
  receipts.set(params.p_event_id, { state: 'processing', token, expires: Date.now() + 300_000 });
  return reply({ outcome: 'claimed', token });
}
function finish(params: Record<string, string>): Response {
  if (failOutcome) return reply({ message: 'isolated database outage' }, 503);
  const receipt = receipts.get(params.p_event_id);
  if (!receipt || receipt.token !== params.p_claim_token || receipt.expires <= Date.now()) {
    return reply(false);
  }
  receipt.state = params.p_outcome;
  return reply(true);
}
async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.hostname === 'api.stripe.com') return stripeResponse(url);
  assertEquals(url.hostname, 'supabase.invalid');
  if (url.pathname.endsWith('/claim_stripe_event')) return claim(await request.json());
  if (url.pathname.endsWith('/finish_stripe_event')) return finish(await request.json());
  if (url.pathname.endsWith('/supporters')) return supporterResponse(request, url);
  if (url.pathname.endsWith('/disqualify_supporter_customer')) return disqualifyResponse(request);
  if (url.pathname.endsWith('/discord_account_links')) return reply(null);
  if (url.pathname.includes('/auth/v1/')) return reply({ user: { identities: [] } });
  throw new Error(`Unexpected isolated request: ${request.method} ${url.pathname}`);
}
async function signedRequest(
  id: string,
  type = 'customer.subscription.deleted',
  object: unknown = { id: 'sub_test' }
): Promise<Request> {
  const body = JSON.stringify({ id, type, data: { object } });
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`)
  );
  const signature = [...new Uint8Array(mac)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return new Request('https://webhook.invalid', {
    method: 'POST',
    body,
    headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
  });
}
Deno.test(
  'signed webhook entrypoint records completion and recovers failed outcomes',
  async (test) => {
    const env = stub(Deno.env, 'get', (name) => {
      if (name === 'STRIPE_WEBHOOK_SECRET') return secret;
      if (name === 'SUPABASE_URL') return 'https://supabase.invalid';
      if (name.startsWith('STRIPE_PRICE_')) return `price_${name}`;
      if (name === 'SUPABASE_SERVICE_ROLE_KEY' || name === 'STRIPE_SECRET_KEY')
        return 'isolated_test_key';
      return undefined;
    });
    const serve = stub(Deno, 'serve', ((callback: typeof handler) => {
      handler = callback;
      return {};
    }) as typeof Deno.serve);
    const fetchStub = stub(globalThis, 'fetch', fakeFetch);
    try {
      // Execute the actual Deno.serve registration and raw-body signature path.
      await import('../stripe-webhook/index.ts');
      await test.step('transient upstream failure then successful retry, then completed duplicate', async () => {
        failUpstream = true;
        assertEquals((await handler(await signedRequest('evt_retry'))).status, 500);
        assertEquals(receipts.get('evt_retry')?.state, 'retryable');
        failUpstream = false;
        assertEquals((await handler(await signedRequest('evt_retry'))).status, 200);
        assertEquals(receipts.get('evt_retry')?.state, 'completed');
        assertEquals(upstreamAttempts, 2);
        assertEquals(writeHeaders?.get('x-stripe-event-id'), 'evt_retry');
        assertEquals(writeHeaders?.get('x-stripe-claim-token'), receipts.get('evt_retry')?.token);
        assertEquals((await handler(await signedRequest('evt_retry'))).status, 200);
        assertEquals(upstreamAttempts, 2);
      });
      await test.step('failed failure persistence stays retryable after expiry', async () => {
        row = { ...supporter };
        failUpstream = true;
        failOutcome = true;
        assertEquals((await handler(await signedRequest('evt_outage'))).status, 500);
        const receipt = receipts.get('evt_outage')!;
        assertEquals(receipt.state, 'processing');
        assertEquals((await handler(await signedRequest('evt_outage'))).status, 503);
        const previousToken = receipt.token;
        receipt.expires = 0;
        failUpstream = false;
        failOutcome = false;
        assertEquals((await handler(await signedRequest('evt_outage'))).status, 200);
        assert(receipts.get('evt_outage')?.token !== previousToken);
      });
      await test.step('successful partial effects with lost completion can recover', async () => {
        row = { ...supporter };
        const before = supporterWrites;
        failOutcome = true;
        assertEquals((await handler(await signedRequest('evt_partial'))).status, 500);
        assertEquals(row.stripe_subscription_id, null);
        assertEquals(row.status, 'expired');
        assertEquals(supporterWrites, before + 1);
        receipts.get('evt_partial')!.expires = 0;
        failOutcome = false;
        assertEquals((await handler(await signedRequest('evt_partial'))).status, 200);
        assertEquals(receipts.get('evt_partial')?.state, 'completed');
        assertEquals(supporterWrites, before + 1);
      });
      await test.step('chargeback partial denial survives attribution failure and retry', async () => {
        row = { ...supporter };
        failAttribution = true;
        const dispute = { customer: 'cus_test', charge: 'ch_test' };
        assertEquals(
          (await handler(await signedRequest('evt_dispute', 'charge.dispute.created', dispute)))
            .status,
          500
        );
        assertEquals(denials.size, 1);
        const denialDate = row.supporter_disqualified_at;
        assertEquals(row.has_ever_supported, false);
        failAttribution = false;
        assertEquals(
          (await handler(await signedRequest('evt_dispute', 'charge.dispute.created', dispute)))
            .status,
          200
        );
        assertEquals(receipts.get('evt_dispute')?.state, 'completed');
        assertEquals(denials.size, 1);
        assertEquals(row.supporter_disqualified_at, denialDate);
        assertEquals(row.has_ever_supported, false);
        assertEquals(writeHeaders?.get('x-stripe-event-id'), 'evt_dispute');
      });
      await test.step('unknown historical receipt is not acknowledged or replayed', async () => {
        receipts.set('evt_legacy', { state: 'legacy_unknown', token: '', expires: 0 });
        const before = upstreamAttempts;
        assertEquals((await handler(await signedRequest('evt_legacy'))).status, 503);
        assertEquals(upstreamAttempts, before);
      });
      await test.step('permanent error is acknowledged only after terminal persistence', async () => {
        failOutcome = true;
        assertEquals(
          (
            await handler(
              await signedRequest('evt_permanent', 'checkout.session.completed', {
                mode: 'invalid',
              })
            )
          ).status,
          500
        );
        receipts.get('evt_permanent')!.expires = 0;
        failOutcome = false;
        assertEquals(
          (
            await handler(
              await signedRequest('evt_permanent', 'checkout.session.completed', {
                mode: 'invalid',
              })
            )
          ).status,
          200
        );
        assertEquals(receipts.get('evt_permanent')?.state, 'terminal');
      });
      await test.step('mutated body fails signature verification without a receipt', async () => {
        const request = await signedRequest('evt_invalid');
        const altered = new Request(request.url, {
          method: 'POST',
          headers: request.headers,
          body: `${await request.text()} `,
        });
        assertEquals((await handler(altered)).status, 401);
        assertEquals(receipts.has('evt_invalid'), false);
      });
    } finally {
      fetchStub.restore();
      serve.restore();
      env.restore();
    }
  }
);
