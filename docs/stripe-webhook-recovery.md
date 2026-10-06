# Stripe webhook recovery

The webhook records receipt separately from processing completion. A failed claim deletion used
to leave a receipt that every retry acknowledged as completed. Receipts now move through
`processing`, `retryable`, `completed`, or `terminal`. Receipts created by the previous handler
remain `legacy_unknown`; they carry no evidence that processing completed.

## Effects and transaction boundaries

The handler performs Stripe GET requests, supporter reads and seven supporter write paths:
Discord identity backfill, checkout upsert, subscription reconciliation upsert, subscription
expiration, async-payment failure expiration, refund/chargeback revocation, and the supporter
updates inside the chargeback RPC. The two chargeback attribution RPCs also upsert durable
`private.supporter_chargebacks` records. No Stripe payment mutation occurs here.

Each Supabase request is a separate transaction. A request-scoped Supabase client carries
`x-stripe-event-id` and `x-stripe-claim-token` headers through every handler database call,
including the nested security-definer chargeback functions. Statement triggers validate the
token and take a receipt row lock before supporter or chargeback row writes. The chargeback RPC
also validates at entry, before taking its customer advisory lock. The lock remains held through
the complete database transaction, including existing retention/denial triggers.

A claim replacement cannot commit while an earlier fenced write holds the receipt lock. A write
that acquired its lock before lease expiry may commit after expiry, but before replacement; an
old holder starting another write after expiry or replacement is rejected. Completion also
requires the current unexpired token. There is no claim deletion on failure. A five-minute lease
provides recovery after a process crash or a failed outcome update, on the next Stripe delivery.
There is no independent background retry worker; alert on unresolved receipts before Stripe's
automatic retry window ends.

Both headers absent means an existing non-webhook billing writer retains its current behavior.
One header absent, an unknown event, an expired token, or a mismatched token fails closed. This
is a fencing protocol for the webhook, not new authorization for billing tools. Browser roles
still have no billing write or claim/completion RPC privileges; supplying headers grants none.
The handler refuses to access its billing client outside the request context. Keeping the scoped
client is required when adding future webhook write paths.

Retries may repeat committed effects after partial progress or lost completion. Writes assign
state or upsert unique chargeback references; they do not increment payment counters or create
new charges. Existing supporter optimistic comparisons, durable chargeback denial and live
Stripe resource lookups remain responsible for current-state reconciliation. Event ID fencing
does not serialize different Stripe event IDs or establish Stripe event ordering. Separate
events describing the same resource can still overlap; do not infer exactly-once fulfillment.

Discord is outside the database transaction. Grants already re-read current supporter denial
before applying roles. Ordinary role failures are best effort; chargeback denial removal failures
remain retryable. Role PUT/DELETE calls can repeat after recovery. An already-in-flight older
Discord request can arrive after a newer one and cause role drift; set-operation idempotence does
not prevent this ordering race. Use existing admin role reconciliation after a billing incident.
This change does not promise transactional or exactly-once Discord delivery.

## Delivery responses

- `completed` and `terminal`: duplicate 200, without dispatch.
- Current `processing`: 503; receipt existence is not success.
- Expired `processing` or `retryable`: replace token and process again.
- Transient processing failure: record `retryable`, return 500.
- Permanent malformed/business input: record `terminal`, then acknowledge 200 for ops review.
- Failed outcome persistence: return 500; recovery is available when the lease expires.
- `legacy_unknown` or conflicting event type: 503, with an operator disposition required.

Unhandled event types still complete without billing effects. Raw request text is verified before
parsing or claiming. The existing secret and API version contract are unchanged.

## Rollout and recovery

1. Obtain the specific production migration and handler deployment approval. Review the added
   `claim_stripe_event(text,text)` and `finish_stripe_event(text,uuid,text)` RPCs: security invoker,
   empty search path, execution only for `service_role`. Private security-definer fencing helpers
   have no direct execution grants. Existing table and chargeback RPC grants remain unchanged.
2. Replay and test in an isolated database, then verify the target identity, migration history,
   function definitions, trigger coverage and grants using the database migration runbook.
3. Merge the migration and handler together through the approved `main` change. Repository Actions
   only validate the local database; the external Supabase GitHub integration deploys production.
   Its [deployment workflow](https://supabase.com/docs/guides/deployment/branching) applies migrations
   at step 5 before deploying changed Edge Functions at step 7; dependent steps skip on failure.
   Verify the actual integration result and deployed migration/function definitions. Do not run
   out-of-band `db push` from an unmerged branch. The previous handler can still insert receipts
   during the deployment interval, but they become unknown; reconcile those deliveries. Deploying
   the new handler first fails closed because the new RPCs are absent. Per-PR Supabase previews are
   disabled in this repository; a skipped preview check does not verify a database deployment.
4. Test signed requests in an approved isolated Stripe/Supabase environment. Local mocked-service
   checks are not authenticated Stripe or production acceptance. Observe `in_progress`, unknown
   receipts, processing errors and lease recovery after rollout.
5. The existing cleanup job now deletes only completed/terminal receipts older than 30 days from
   completion, using a partial completion-time index for resolved receipts. Unresolved receipts remain available for investigation. Alert and disposition them;
   growth is an operational signal, not permission to replay them automatically.

For each unknown historical receipt, obtain its Stripe event and delivery evidence and inspect
current supporter/chargeback state. Record the event ID, evidence, reviewer and disposition in the
incident record. With explicit event-specific production write/replay approval, an operator can
mark proven completed work `completed` with a completion time, mark intentionally rejected work
`terminal`, or change proven incomplete work to `retryable` and arrange one approved signed
redelivery. Compare state before and after and reconcile Discord. Never mark all old receipts
completed, replay all historical events, or delete receipts to recover. A receipt alone cannot
prove either fulfillment or payment loss.

For a newly failed event, inspect current Stripe state and partial database effects first. Stripe
redelivery reuses the event ID; a failed outcome update recovers after expiry. Once automatic
retries expire, arrange an individually approved redelivery/reconciliation. Do not mint credentials
or replay production payments as a test.

Retain the schema and receipts on rollback. Restoring the old handler restores its unsafe
receipt-as-completion semantics, so prefer pausing delivery while fixing the handler and then
performing approved redelivery. Do not drop the durable state or undo the retention change as
routine rollback.

A queue/outbox would allow acknowledgement after durable enqueue and independent processing,
but needs another consumer, retry policy and external reconciliation protocol. It still cannot
make an in-flight Discord call transactional. The current change keeps Stripe redelivery as the
retry driver and adds the database fence necessary for safe lease replacement.
