# Package B candidate policy — staging only

User decisions recorded 2026-09-12. These decisions authorize candidate implementation and
isolated validation. They do not authorize production deployment, provider mutations, or schedules.
Packages A and C remain the baseline. All six historical deletion jobs remain HOLD.

## Account deletion and Stripe

The candidate requests cancellation at period end for an active or trialing subscription. A queued
request, a successful cancellation update, or `cancel_at_period_end=true` is not proof that the
subscription ended. The account remains usable while waiting for provider confirmation. There are
no automatic refunds, prorated credits, or customer-object deletions. Unpaid, past-due, disputed,
incomplete, inconsistent, and otherwise ambiguous cases require operator review. A customer with
no remaining subscription can proceed only after current provider state and outstanding initiation
obligations have been checked; an empty application linkage is not sufficient evidence.

Users may withdraw before irreversible preparation. Withdrawal stops the deletion request; it does
not automatically reverse Stripe's scheduled cancellation or restart billing. The UI must say this
explicitly. Withdrawal during an active provider claim waits for that claim to resolve. A new request
has a new generation; an old worker cannot silently restart a withdrawn request.

Requested/provider-wait states permit team membership and ownership. The short sealing transaction
marks the irreversible preparation boundary. Sealed/prepared/auth-authorized states prohibit new
membership, ownership, and provider linkage. Ownership preparation then follows existing transfer
and owner-only disband rules. It commits before the supported Auth deletion API call. Auth deletion
requires verified ownership preparation and completed provider prerequisites. Missing Auth is a
recoverable state, not evidence that the workflow completed.

## Discord

On authoritative identity unlink or account deletion, preserve the minimum Discord identity in
restricted durable application-owned work before the original linkage disappears. Remove only the
configured application-managed linked, supporter, and tier roles. Never remove arbitrary roles,
kick a member, or remove the member from the guild. No network request runs in a database trigger
or while a database transaction is open.

Confirmed absent role/member counts as completion. A generic 404 does not: Discord's explicit
unknown-member (`10007`) and unknown-role (`10011`) responses are distinguished from an unknown
guild, invalid credentials, missing permissions, or malformed responses. Transient failures retry;
missing historical identifiers remain operator-blocked. Multiple removal attempts are idempotent.

Deletion-specific Discord removal must not prematurely remove paid-period benefits while the
account waits for Stripe. It becomes eligible after the irreversible seal. Standalone unlink work
remains independent of deletion withdrawal. A re-link racing role removal requires current-state
reconciliation; this remains a deployment gate until validated.

## Staging operational defaults — deployment review required

- Retain minimal completed lifecycle/webhook evidence for 90 days, long enough to diagnose delayed
  delivery and complete an operator investigation without keeping raw provider payloads.
- Never age-purge unfinished, blocked, processing, waiting, retryable, or dead-letter work. Legacy
  Stripe receipt rows remain unknown historical; do not mass-complete or replay them.
- Transient failures use bounded backoff, provider Retry-After guidance, at most 12 attempts, and a
  24-hour automatic retry window, then operator review. Waiting for an agreed subscription end is
  not a transient failure and does not spend this error budget.
- No production schedule is enabled. Operator retry, alert ownership, reconciliation evidence,
  and retention execution require deployment review and a tested restricted operator path.

## References

[Stripe subscription cancellation](https://docs.stripe.com/billing/subscriptions/cancel),
[Stripe webhook delivery](https://docs.stripe.com/webhooks?lang=node),
[Discord remove member role](https://docs.discord.com/developers/resources/guild#remove-guild-member-role),
[Discord error codes](https://docs.discord.com/developers/topics/opcodes-and-status-codes).

This policy does not establish implementation readiness. See the validation packet for remaining
technical gaps, executed test evidence, and the deployment prohibition.

## Candidate implementation limits and operator responsibility

The provider runner is an explicit staging prototype, not an installed production worker. Its Stripe
adapter rejects live keys; Discord uses an injected transport. Financial validation reads invoices
and charges before subscription actions. Unpaid invoices, disputes, malformed responses, and histories
larger than the bounded inspection window require review; they do not authorize Auth deletion.
See [invoice listing](https://docs.stripe.com/api/invoices/list?api-version=2024-06-20) and
[charge listing](https://docs.stripe.com/api/charges/list).

Checkout initiation is reserved before the external request. Identical retries reuse the reservation
within 23 hours, inside Stripe's documented minimum idempotency retention. An unresolved different or
older request requires reconciliation. Automatic reconciliation preserves discovered customer and
subscription identifiers before closing the intent. Unavailable sessions are deferred individually;
ambiguous sessions reach operator review. A portal or unrecorded external response requires explicit
operator evidence; elapsed time alone is not proof that no external action occurred.

Operator resolution is service-only and additionally checks an application admin record. The caller
must derive the operator from validated authentication, record a restricted evidence reference, and
preserve discovered provider identifiers. No general client-facing operator endpoint or production
schedule is installed. Deployment review must name the responsible operator, alert destination,
manual-run authorization process, and monitoring owner.

After sealing, a Discord outage can leave the account restricted while Auth still exists. This is an
explicit irreversible preparation state. Resolve the provider failure and resume the fenced workflow;
do not remove membership/ownership guards to make the account appear healthy. Pre-seal requests
remain usable and withdrawable after in-flight provider claims settle. Withdrawal does not reverse
an already requested billing cancellation. Restart is explicit and never re-arms historical HOLD jobs.
