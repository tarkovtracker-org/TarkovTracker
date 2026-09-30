# Account retention

## Status and public policy

The public retention policy defines eligibility for routine inactivity cleanup. Automatic cleanup
and a dedicated account activity timestamp are **not implemented**. This documentation change does
not enable deletion, deploy database changes, or authorize a production deletion batch.

The English source for the public rules is `page.account_retention` in
[`app/locales/en.json`](../app/locales/en.json), rendered consistently by
[`AccountRetentionPolicy.vue`](../app/components/AccountRetentionPolicy.vue) in the Terms of Service,
Privacy Policy, and supporter page. The supporter page displays the disclosure before payment
options. Retention protection concerns intentional inactivity cleanup while the service operates;
it is not a guarantee of storage, data recovery, or continued service. Statutory rights remain
unaffected. Have qualified counsel review the wording for applicable jurisdictions before publication.

## Activity tracking design

Add a server-controlled `last_active_at` account timestamp. Use database time and monotonic updates;
clients must never choose the timestamp or the target account. Record authenticated site use and
successful authenticated API use, including requests that do not change progress. Public profile
views, failed authentication, rejected requests, billing webhooks, and maintenance must not renew
account activity.

- Extend [`account/activity.post.ts`](../app/server/api/account/activity.post.ts) to record activity
  independently of IP auditing. It must work even when IP hashing is unavailable.
- Call it at authenticated app startup and when the app returns to the foreground; throttle
  heartbeat writes to at most once per account per day. Do not keep a hidden tab active with a timer.
- Record successful authenticated API reads and writes in the gateway. Ensure unchanged writes
  count as use without changing the progress freshness clock.
- Advance account activity when user-driven progress, preferences, or archive mutations persist.
  Keep maintenance and compatibility backfills from manufacturing user activity.
- Preserve the distinction between account activity and mode progress freshness. The existing
  [`progress_updated_at` trigger](../supabase/migrations/20260906234500_track_mode_progress_freshness.sql)
  already records progress changes and intentionally leaves identical progress unchanged.

Existing accounts need not wait a new retention period if reliable historical evidence establishes
inactivity. Assess the latest available account creation, sign-in, authenticated app activity,
session activity, user-data mutation, and successful API-use timestamps. Treat creation as the
baseline for unused accounts. Administrative rewrites may conservatively postpone cleanup; they
must not be mistaken for evidence that a user changed data. Missing, conflicting, or incomplete
evidence requires review rather than an assumption of inactivity. Persist a durable activity clock
before source telemetry ages out: API usage currently has a
[`180-day retention job`](../supabase/migrations/20260807130000_add_usage_and_rate_limit_retention.sql).

## Support eligibility and subscription end

Resolve support from trusted server records, not client flags or editable user metadata. Preserve
ever-supported history independently of current billing status. Protect uncertain support history
until reconciled; a missing or false flag alone does not establish that a user never contributed.
Contributions must be attributable to the account to receive account-specific protection.

Match the documented active-subscription rule to server billing state, including any granted
past-due grace period. A canceled renewal remains protected until paid access ends. Record the
actual end of subscription access as a durable timestamp; `supporters.updated_at` is not a billing
period-end timestamp and `expires_at` must be verified against webhook behavior before reuse.

For former subscribers, compute eligibility from the later of last activity and the most recent
end of subscription access, then apply the public one-year period. For one-time contributors, use
the public inactivity period measured from the later of last activity and the recorded contribution
date. A new contribution or renewed subscription cancels pending cleanup. Use calendar intervals
for months and years, not fixed day counts.

## Cleanup implementation and rollout

1. Implement a read-only candidate report first. Show counts by retention category, evidence gaps,
   dependent data, and estimated removable payload size. Keep user identifiers out of public reports.
2. Review candidate evidence and support history before scheduling deletion. Introduce a notice
   and recovery window for existing accounts; do not promise delivery that cannot be verified.
3. Queue inactivity candidates separately from user-requested deletions. A retention candidate must
   remain cancelable when activity or support resumes.
4. Recheck activity, support, subscription access end, and the cutoff immediately before destructive
   work. Serialize activity and billing changes with the transition to deletion so a returning user
   or renewal cannot race a stale candidate snapshot. Fail closed on lookup errors or uncertainty.
5. Reuse the claim, retry, and fencing model in the
   [account-deletion lifecycle](../supabase/functions/_shared/account-deletion-lifecycle.ts), but do
   not run the current reconciler on inactivity candidates without the new eligibility guards.
6. Delete Auth identity and account-owned progress, retained seasons, archives, preferences, tokens,
   links, and dependent records. Audit actual foreign-key cascades, storage objects, and team
   ownership first; do not delete other members' data through an unreviewed team-owner cascade.
7. Distinguish account removal from necessary legal, payment, security, and limited backup records
   described in the Privacy Policy. Reconcile partial failures with bounded batches and audit logs.
8. Test cutoff boundaries, unknown history, active and canceled subscriptions, grace expiry,
   activity/renewal races, dependent cleanup, and retry behavior. Obtain independent review before
   enabling the workflow and explicit operator approval for deployment and a concrete deletion batch.

Removing accounts does not retire the older progress layout. `user_progress` still carries account
metadata and PvP/PvE compatibility copies; see the
[game-mode storage system](./systems.md#7-game-mode-and-seasonal-progress-storage). Removing those
copies requires a separate compatibility and backfill project.
