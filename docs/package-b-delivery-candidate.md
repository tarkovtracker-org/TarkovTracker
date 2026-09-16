# Package B delivery contract

Package B is not deployed. The release manifest and operator bundle identify the frozen revision,
migration hashes, evidence, and catalog hashes. All earlier freeze/preflight bundles are obsolete.
Packages A and C remain protected. J1–J6 remain HOLD and ineligible; no historical cleanup is included.

## B0 bridge and schema ordering

`scripts/lifecycle/build-bootstrap.py` builds fixed maintenance entrypoints for `account-delete`,
`account-delete-reconcile`, and `stripe-webhook` against A+C. Deletion entrypoints return 503 without
creating, claiming, or processing work. The webhook verifies the original body/signature and returns
503 without receipt or provider effects, leaving Stripe responsible for redelivery. Install and verify
these bridges before changing the lifecycle schema; they contain no operational toggle or DB client.

The operator-assisted migration order is:

1. `20260914092616_lifecycle_unlink_bootstrap.sql` in the isolated B0 artifact.
2. `20260912190000_billing_initiation_bootstrap.sql` before reservation-aware application routes.
3. `20260912201429_provider_lifecycle_foundation.sql`.
4. `20260914074055_lifecycle_delivery_controls.sql`.
5. `20260914074830_lifecycle_delivery_eligibility.sql`.
6. `20260914092617_lifecycle_bootstrap_handoff.sql`.
7. `20260915032640_lifecycle_delivery_leases.sql`.
8. `20260915032641_lifecycle_canonical_capture.sql`.
9. `20260916025544_final_billing_truth.sql`.

The later phase needs reviewed `--include-all` behavior because foundation's timestamp precedes B0.
Exact artifact inventories and dry runs are mandatory. Never repair migration history to force order.
All nine migrations have bounded lock-failure, rollback, unchanged failed-version history, and retry
rehearsals. No migration invokes providers, performs historical cleanup, or schedules the worker.

B0 captures removed Discord identity evidence under an identity-write lock, without an Auth foreign
key. It cannot retroactively protect an unlink committed before that barrier. Handoff transfers
captured evidence durably; transfer never means provider completion. Controls cannot reopen while
bootstrap evidence remains untransferred. Canonical capture eliminates last-writer ordering drift.

Fresh replay, exact deployed A+C upgrade, and B0-first failure/retry converge across 737 catalog objects:
`9ed1f2edc256bf446372007860b92c95ec58958d28f2a8c2243fd27495b1c441`.
The snapshot includes function definitions/ACLs, columns, constraints, RLS/ACLs, policies, and triggers,
including the application-owned Auth identity trigger. It also includes all 72 public/private indexes
and their validity/readiness state. Protected A/C artifacts remain unchanged.

## Legacy drain and application cutover

Operator evidence must establish that legacy code receives no new requests. The offline
`verify-cutover-evidence.py` binds evidence to the approved revision and bridge hashes. Its 400-second
hosted execution horizon begins at the latest confirmed legacy routing cutoff, not deployment start.
The runtime limit and routing cutoff require hosted operator evidence. The local rehearsal does not
prove hosted retirement or termination of a dispatched external request.

Database, terminal external outcomes, unlink capture, and exclusive-window observations must follow
that horizon and be at most five minutes old. Every dispatched Auth, PostgREST, and Discord mutation
needs correlated terminal evidence. An unaccounted request blocks cutover even with no visible DB
transaction. Zero new invocation rows is insufficient. Never clear a production row merely for age.

The Edge horizon does not establish application session safety. Both Checkout and Portal must use
reservations before Stripe creation, all old application issuance must stop, and accepted outcomes
must be accounted for. Only the operator can record the authoritative application cutover timestamp.
It is DB time, cannot be backdated through the RPC, and reconfirmation restarts the 24-hour legacy
session horizon. Missing evidence or incomplete horizon blocks irreversible deletion.

Unresolved Portal authority is not cleared using Checkout expiration. Unknown outcomes retain their
reservation and require reconciliation/operator evidence. The offline pre-schema validator never
authorizes deletion reopening. Partial application and Edge deployment must remain fail closed.

## Fresh provider authority and recovery

A completed task, receipt, supporter row, expired reservation, or elapsed horizon cannot independently
authorize Auth deletion. Before sealing and every Auth attempt, read current Stripe subscription and
financial state outside a DB transaction. A fresh nonce binds deletion generation, current job claim,
and billing generation. Checking lasts at most 60 seconds; CLEAR lasts at most 30 seconds and is
consumed by authorization. Relevant reservation, provider, linkage, or work changes invalidate it.

Active/trialing subscriptions, scheduled cancellation while still active, ambiguous or unavailable
Stripe state, unsettled financial state, unresolved reservations, and required provider tasks block
Auth deletion. Failed verification never reuses earlier CLEAR. Discovery uses bounded ordinary lists,
not eventually consistent Search, and preserves attributed actionable resources as durable work.

Prepared retries skip only already captured preparation through a claim-checked RPC. They still obtain
fresh Stripe truth and authorization. This permits progress across invocations when two verification
passes would exceed one shared provider budget. Denied authorization parks a current claim as
`provider_pending`; a stale claim cannot overwrite its replacement. Revoked old-generation deletion
tasks remain preserved and unclaimable, without preventing current-generation reconciliation.

The approved policy remains cancellation at period end. Waiting is usable and withdrawable before
sealing; withdrawal does not undo a cancellation already requested. No automatic refund, credit, or
Stripe customer deletion is part of this workflow. Auth deletion uses the supported Supabase API.

## Invocation, worker, and historical boundaries

Admission/disable serialize on each control row. Closed prevents new admission; drained additionally
requires zero valid invocation leases. In-progress deletion claims are reported separately. An
expired invocation remains evidence but cannot block admission indefinitely or authorize later writes.

Invocation leases use DB time: 30 seconds, renewed every 5 seconds, with an immutable 60-second cap.
Provider execution shares a 50-second/12-call budget with a 10-second per-request limit. Task leases
remain 120 seconds. Invocation and task fencing apply at entry and commit. Heartbeat failure aborts
local transport but cannot undo an external effect already accepted by the provider.

The worker requires its dedicated `LIFECYCLE_WORKER_SECRET`; browser/admin JWTs and a service-role
fallback are rejected. It accepts one fixed kind, no body or caller-selected IDs, and processes one
item per single-flight invocation. Receipt and advanced counts never imply provider completion.

Eligibility starts empty. Existing deletion jobs cannot gain eligibility through deployment, age,
request insertion, or worker invocation. J1–J6 stay HOLD. Health surfaces expose aggregate state and
lease/retry timing without provider identifiers. The inherited deletion-attempt retention cron is not
a worker schedule. No Package B migration, import, CI task, or webhook enables worker scheduling.

## Production boundary

Local regression evidence is recorded separately from hosted operator evidence. The final evidence
register distinguishes newly executed, unchanged reused, and skipped tests. Old opt-in integration
fixtures are not relabeled as passes when current runtime suites provide their replacement coverage.

Production operator preflight and an explicit Phase B deployment decision remain required. Scheduling
stays OFF. Any later activation needs a separately reviewed trusted runner, concurrency-one schedule,
secret delivery, named operators, alert destination, and verified alert delivery. Partial failure keeps
bridges or final paused runtime in place; do not restore legacy deletion/receipt behavior.
