# Package B operational contract — disabled, deployment review required

This is the proposed operating contract, not evidence of installed automation or alert delivery.
The approved Stripe/Discord policy is unchanged. All historical deletion jobs remain HOLD.

## Delivery and authentication

The candidate exposes `supabase/functions/lifecycle-worker/index.ts`, authenticated only by the
server-side `LIFECYCLE_WORKER_SECRET`. Browser credentials, user/admin JWTs and the service-role key
are not worker invocation authority. The production provider adapter is separate from
`runStagingProviderBatch`, which retains its test-mode and injected-Discord boundaries. Neither
adapter is deployed by this document. Historical jobs remain structurally ineligible.

Delivery is one item per invocation, with one active provider-processing invocation across providers.
Database-clock invocation leases last 30 seconds, renew every 5 seconds, and have a 60-second cap.
Provider calls share a 50-second/12-call budget. Task leases remain 120 seconds; account-job claims
retain their separate 15-minute bound. Claim and invocation fences reject expired writes and commits.
No database transaction spans provider HTTP. An abandoned invocation recovers through expiry.

`account-delete-reconcile` uses the same admission and fencing controls for Auth workflow recovery;
it does not authorize historical replay. Operator retry additionally requires a recorded application
admin and restricted evidence reference. No generic client endpoint exposes that authority.

Scheduling remains disabled by default. Any later scheduling proposal needs an explicit operator
decision, throughput evidence, delivery identity, monitoring ownership and verified secret bindings.
The frozen operator bundle, when generated, is the source of truth for the exact candidate revision
and staged preflight. No schedule is created by this document or by applying Package B migrations.

Provider retries use max(provider Retry-After, bounded exponential backoff), capped at 24 hours.
At 12 attempts or 24 hours since first error, work becomes dead-letter/operator review. A scheduled
subscription-end wait is not an error and does not spend this error budget. Permanent/missing-ID
ambiguity is blocked. Account-job retries retain their separate existing five-attempt bounded
backoff, not an undocumented provider-budget substitution. Operator retry requires correcting the
cause, current-state evidence, and `retry_lifecycle_work` audit entry; unknown legacy receipts and
review-only obligations cannot be retried by that generic path. Never reset work via raw UPDATE.

## Structured telemetry contract

The candidate emits bounded worker completion/failure and per-task transition records. Database
health/status RPCs expose aggregate control, lease, work and historical-eligibility state. Local tests
establish these surfaces; they do not establish a production log export or external alert destination.

Never log claim tokens, credentials, raw provider payloads, email, Discord identity, Stripe customer
or subscription IDs, or arbitrary request bodies. Restricted operator evidence may correlate provider
events when required. Expired ownership must never be reported as successful completion.

## Checks, alerts, and owner actions

Run `package-b-monitoring.sql` through the approved read-only observer once the candidate schema
exists. Queries intentionally return aggregated operational state without provider identifiers.
Suggested initial thresholds below are operational proposals for deployment review, not enabled
alerts or new retention rules.

| Check                           | Proposed threshold                            | Responsible role / action                                                                                |
| ------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Due work age / webhook backlog  | oldest due >5 minutes, two checks             | on-call: check runner health and rate limits; inspect selected tasks                                     |
| Expired processing leases       | any >3 minutes past lease                     | on-call: confirm worker ended; allow normal fenced recovery                                              |
| Blocked/dead-letter work        | any new row                                   | lifecycle operator: inspect current provider truth and evidence; no blanket replay                       |
| Retryable work                  | error window approaching 24h or attempts >=10 | on-call: investigate credentials/provider outage, escalate before budget expires                         |
| Provider API failures           | >=5 errors and >20% of last 15m calls         | on-call: inspect provider status, pause new invocations if necessary via approved procedure              |
| Invocation failures             | two consecutive invocations                   | platform operator: inspect runtime/configuration; preserve leases and evidence                           |
| Expected runner heartbeat       | absent >3 minutes, only when enabled          | platform operator: verify configured schedule and delivery identity                                      |
| Deletion waiting for Stripe end | daily count/review, no generic age alarm      | lifecycle operator: compare selected requests with confirmed subscription end; never force Auth deletion |
| Sealed request blocked          | any new condition                             | lifecycle operator: resolve durable provider obligation; do not remove guards                            |

There is **no configured external alert destination, named on-call rotation, heartbeat emitter, or
production job host in this candidate**. Minimum operator action: select the existing job host and
alert destination, designate platform/on-call/lifecycle operators, and authorize integration work.
No service credential is needed merely to review aggregate observer results. The SQL alone cannot
measure HTTP failure ratios or missing invocation heartbeats; those require the telemetry adapter
and external scheduler's delivery metrics. Do not claim alert delivery until an isolated test alert
and missing-heartbeat test are observed by the designated operator.

## Disabled-state proof and rollout

The forward migration contains no `cron.schedule`, network invocation, or worker startup. Worker
modules export functions without calling them at import. Test calls live only in opt-in test files.
No CI invocation or default schedule targets these runners. Edge deployment starts request listeners,
not a provider backlog drain; webhook requests remain independently signature-verified ingress.
The staging runner cannot use live Stripe credentials. Production enablement is a separate approval
AFTER schema/runtime/source verification and the technical/provider gates pass.

Rehearse quiescence of legacy deletion/reconciliation, unlink, checkout/portal and webhook handlers
before migration. Paused webhook ingress must fail retryably, not acknowledge unrecorded work.
Then use only the exact migration inventory and ordering in the newly frozen operator bundle,
verify definitions/ACLs/A+C invariants, and deploy only its pinned artifacts in the rehearsed order.
Deletion admission also requires both reservation-aware application routes, an authoritative
24-hour cutover horizon, resolved initiation authority and fresh Stripe truth at every Auth attempt. Keep schedules disabled and
all six historical jobs HOLD. No exact deployment command is approved before a frozen artifact and
read-only production preflight exist. Recovery preserves durable obligations, fencing, and A/C;
never restore receipt-as-completed processing or remove sealed-user guards.
