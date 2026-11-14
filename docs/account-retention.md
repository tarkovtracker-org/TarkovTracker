# Account retention

## Public policy and billing eligibility

The English policy source is `page.account_retention` in
[`app/locales/en.json`](../app/locales/en.json), rendered by
[`AccountRetentionPolicy.vue`](../app/components/AccountRetentionPolicy.vue) in the Terms and
Privacy Policy. The [supporter page](../app/pages/supporter.vue) presents brief benefit and policy
summaries with links to the full Terms and Privacy Policy. These protections concern intentional
inactivity cleanup while the service operates, with the public qualifications for service closure,
data loss, and non-excludable rights. Have qualified counsel review the wording before publication.

Qualifying contributions exclude fully refunded payments. A refund preserves eligibility from
other valid contributions. Any chargeback revokes all supporter benefits and retention history,
including earlier contributions. The durable disqualification prevents delayed billing events
or remaining historical payments from reinstating benefits. It does not itself delete an account.

Trusted billing evidence lives in `supporters`; see the
[Stripe webhook](../supabase/functions/stripe-webhook/index.ts) and
[retention helpers](../supabase/functions/_shared/stripeRetention.ts). Dates alone do not grant
benefits. Benefit grants verify the specific current checkout or invoice payment. Historical
support eligibility is tracked separately. Unknown legacy support history is protected from
automated deletion until verified.
Cancelled renewals retain protection until paid access ends; past-due grace is bounded and cannot
restart on every webhook. Former subscribers use the later of activity and access end, including
the latest expired grace period when an earlier subscription end is already recorded. Calendar
intervals, rather than fixed day counts, determine eligibility.

## Activity and cleanup implementation

The [retention migration](../supabase/migrations/20260930003202_automate_inactive_account_cleanup.sql)
owns the server activity clock, eligibility calculation, transactional cleanup, and weekly schedule.
The [activity endpoint](../app/server/api/account/activity.post.ts) records authenticated use even
when IP hashing is unavailable. [App initialization](../app/composables/useAppInitialization.ts)
records startup and foreground use, with a per-account daily throttle and no hidden-tab timer.
Clients cannot supply the timestamp or target account.

Database triggers record sign-ins, saved progress, preferences, archives, and existing authenticated
API accounting. API quota-admitted requests count conservatively even if a later handler rejects
input; throttled-only requests do not. Billing changes cancel pending cleanup without manufacturing
account activity. Public profile views do not renew the viewed account. Account activity remains
separate from mode progress freshness, which intentionally ignores unchanged progress.

Eligibility uses the newest trustworthy creation, sign-in, session, durable activity, and existing
account-data/API timestamps. A separate daily snapshot preserves historical activity before
short-lived telemetry is pruned; snapshots never manufacture a new activity date. Administrative rewrites may conservatively postpone cleanup. No
historical rows are rewritten by the migration. A missing supporter verification marker is an
uncertainty hold, not a new benefit or proof of never supporting.

Each weekly bounded batch first marks eligible accounts pending. Deletion requires at least 30 days
pending plus a fresh eligibility check under the account lock. Waiting accounts leave batch
capacity available for other eligible accounts. Activity or billing changes cancel
pending status. This rollout recovery window is additional to the public eligibility period; an
email notification system is not implemented. Failed accounts roll back independently and yield
priority to other candidates on subsequent runs.

Deletion reuses the existing claim/fencing audit, transfers populated owned teams to a remaining
member, and removes Auth identity and dependent account data transactionally. Existing deletion
jobs remain with their original workflow. Accounts owning Storage objects or buckets are held:
Storage bytes require API deletion and must not be orphaned by deleting SQL metadata. Payment,
security, deletion-audit, and limited backup records may have separate lawful retention requirements.
Auth deletion does not immediately invalidate an already issued JWT; account foreign keys prevent
recreation of account-owned data.

## Requested account deletion with billing

User-requested deletion requires an explicit `delete_account` action and an OAuth sign-in within
five minutes. Refreshing an old session does not satisfy this check: the Edge Function uses the
verified OAuth authentication-method timestamp, and the service-only claim RPC checks the matching
live Auth session and freshness again after lock waits. The accepted deletion job is the durable,
idempotent intent; trusted retry/retention workers keep their existing claim path. Signing in again
returns to Settings and never automatically deletes an account. Provider SSO can complete without
password re-entry; this is recent OAuth sign-in, not MFA.

The expected JWT issuer defaults to `SUPABASE_URL/auth/v1`. Local/self-hosted Edge runtimes that
use an internal gateway URL must set the nonsecret `SUPABASE_AUTH_ISSUER` to their configured
public Auth issuer (for example `http://127.0.0.1:54321/auth/v1`, matching `auth.jwt_issuer`).
Do not derive this setting from request headers or client input.

Before claiming a deletion job or transferring teams, the Edge Function verifies every retained
subscription and every page of the linked customer's subscription history through Stripe. Only
permanently ended `canceled` or `incomplete_expired` subscriptions can proceed. Scheduling
cancellation at period end, expired benefits, past-due payments and disqualification do not
authorize deletion. Lookup errors fail closed. Active subscribers keep their account and paid
time; they can select **Manage subscription** on the Supporter page and return after it ends.

An Auth `BEFORE DELETE` trigger protects every caller, including SQL retry and inactive cleanup,
while a customer or subscription identity remains. A service-only ledger retains replaced
subscriptions across customers and entitlement revocation. Signed subscription events record
identity even when they cannot replace the current entitlement. A service-only RPC compares and
clears the complete verified identity under the current unexpired deletion claim before team
cleanup. Changed identities and replaced leases fail closed; failed clearance records a fenced
job failure so an explicit request can retry without waiting out a live claim.

Claims and billing activation serialize on the Auth row. Existing supporter-row updates can
already hold their row before reaching that lock, so PostgreSQL may abort a contending transaction
with retryable `40P01`. Webhook failures remain retryable; Auth deletion retries and records failure
when exhausted. The failed transaction cannot delete the account or discard its billing identity.
The concurrency check exercises this outcome as well as both claim/activation orderings.

Deploy the schema before the updated Edge Functions. Previously issued Checkout sessions can
finish after Auth deletion; webhooks cancel those subscriptions only after Auth confirms absence.
Auth/Stripe outages retry without assuming absence, and FK races are rechecked. Normal account
deletion never cancels an active subscription. Customer verification follows all pages and rejects
a non-advancing cursor; incomplete or failed verification preserves the account.

The ledger captures identities from deployment onward. Previously discarded references on a
different Stripe customer require separate historical reconciliation before claiming those old
orphaned subscriptions are repaired. The current customer is checked even if its local subscription
reference was already cleared. The schema performs no production data backfill.

## Rollout and operations

Release and verify this change through the [deployment runbook](./runbook.md#deployment).
Confirm the retention migration and changed billing webhook deployed successfully after merge.
Checkout fails closed until its new eligibility RPC is available, so monitor the independent backend
and frontend rollouts. Applying the migration installs the weekly schedule; the initial pending
window prevents immediate deletion of historical accounts. Confirm deployed billing history and
candidate evidence before that window ends. Legacy uncertain payment histories need authoritative Stripe
reconciliation; do not convert unknown history to false in bulk.

Use `private.account_retention_deadline(uuid)` for restricted candidate assessment and
`private.account_retention` for pending/error inspection. They are inaccessible to ordinary clients.
Monitor the Cron job and the account-deletion audit after each run. To pause, disable the named
`inactive-account-cleanup` Cron job; preserve pending evidence and audit rows. Resume only after
investigating unexpected eligibility, failures, or missing support evidence. Production writes,
deployment, and deletion require explicit operator approval.

Removing inactive accounts does not retire the older `user_progress` layout. It still carries
metadata and PvP/PvE compatibility copies; see the
[game-mode storage system](./systems/progress-storage.md#game-mode-and-seasonal-progress-storage).
