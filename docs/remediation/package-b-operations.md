# Package B operational contract — disabled, deployment review required

This is the proposed operating contract, not evidence of installed automation or alert delivery.
The approved Stripe/Discord policy is unchanged. All historical deletion jobs remain HOLD.

## Delivery and authentication

The current executable provider runner is `runStagingProviderBatch` in
`supabase/functions/_shared/staging-provider-runner.ts`. It rejects live Stripe keys, requires
explicit injected Discord transport, and is not an HTTP endpoint. Do not remove this test-mode
boundary to launch production. `runLifecycleBatch` and `recoverStripeEvents` are explicit library
entrypoints. Existing `account-delete-reconcile` handles the Auth workflow with its service-only
boundary; it is not authorization to drain historical jobs.

Proposed production delivery is an operator-controlled, one-shot server job, with a separate
process per provider. It will construct the service database client and restricted provider clients
from the deployment secret store and call the existing bounded library entrypoints. No browser
credential, user JWT, or caller-selected user identity may authorize this job. Manual operator
identity must come from authenticated organizational access; `retry_lifecycle_work` additionally
requires the recorded application admin and restricted evidence reference. Ordinary clients cannot
invoke it. The production adapter, hosting identity, secret binding, and invocation integration are
**not installed or verified**. They remain an explicit release dependency, not a hidden default.

Initial concurrency ceiling: one process per provider, two total; within each process sequential
execution, batch size one. Database maximum is 25; do not use it initially because claims are leased
at batch start and later sequential items can expire before processing. Provider task leases are two
minutes. Account jobs use their existing 15-minute claim. Every external operation validates its
claim and every completion is fenced. Do not renew or bypass a lost claim. No database transaction
spans HTTP. A crashed process leaves recoverable expired work rather than completing it.

After separately approved enablement, proposed invocation is once per minute, bounded to one item
per invocation initially. Before enablement, measure throughput and agree backlog capacity. No
schedule is created by this document. Expected heartbeat alerts remain disabled until scheduling is
explicitly enabled and verified.

Provider retries use max(provider Retry-After, bounded exponential backoff), capped at 24 hours.
At 12 attempts or 24 hours since first error, work becomes dead-letter/operator review. A scheduled
subscription-end wait is not an error and does not spend this error budget. Permanent/missing-ID
ambiguity is blocked. Account-job retries retain their separate existing five-attempt bounded
backoff, not an undocumented provider-budget substitution. Operator retry requires correcting the
cause, current-state evidence, and `retry_lifecycle_work` audit entry; unknown legacy receipts and
review-only obligations cannot be retried by that generic path. Never reset work via raw UPDATE.

## Structured telemetry contract

Each production invocation must emit start/end and per-item outcome records containing:
`invocation_id`, opaque `task_id`, `provider`, `stage`, `attempt`, `lease_valid`,
`retry_class`, `elapsed_ms`, `status`, and bounded `error_class` (SQLSTATE when applicable).
Record provider event IDs only in restricted operator logs when needed; use task IDs in general
metrics. Never log claim tokens, credentials, raw provider payloads, email, Discord identity,
Stripe customer/subscription IDs, or arbitrary exception/request bodies. A lost lease emits
`lease_lost`, never success. Current library aggregate counts are not proof that this telemetry
pipeline exists. The one-shot delivery adapter must implement and test these records before release.

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
Then apply the single frozen migration, verify definitions/ACLs/A+C invariants, deploy only frozen B
artifacts, verify sources, and resume ingress in the rehearsed order. Keep schedules disabled and
all six historical jobs HOLD. No exact deployment command is approved before a frozen artifact and
read-only production preflight exist. Recovery preserves durable obligations, fencing, and A/C;
never restore receipt-as-completed processing or remove sealed-user guards.
