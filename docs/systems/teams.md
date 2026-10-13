# Teams

Part of the [systems spec](./README.md): summary, flow, files, and invariants per system.

## Teams

Team membership is per game mode and shares the normalized progress storage described in
[progress storage](./progress-storage.md).

### Flow

Team identity comes from `team_memberships` for all modes. Team joins use a database transaction
that locks the team while checking capacity and persists membership, user-system state, and the
audit event together. `user_system` keeps legacy persistent PvP/PvE columns plus the active
Seasonal team column. The team-members endpoint reads the `team_member_mode_summary` view, which
derives display name, level, and completed-task count inside the database so teammate progress
blobs never cross the wire. Owners disband through the authenticated `team-disband` function,
which calls an atomic service-role-only RPC; regular `team-leave` remains the non-owner leave
path.

### Files

- `supabase/migrations/20260830120000_secure_team_realtime_channels.sql` — private team broadcast
  authorization and `user_system` Realtime publication
- `supabase/migrations/20260829120000_add_atomic_team_disband.sql` — owner-scoped atomic team
  disband RPC and grants
- `supabase/functions/team-disband/index.ts` — authenticated owner disband endpoint
- `supabase/migrations/20261002080000_durable_team_cooldowns.sql` — durable leave/kick cooldown
  state and the `leave_team`/`kick_team` RPCs that claim it
- `supabase/functions/team-create/index.ts`, `supabase/functions/_shared/team-create-error.ts` —
  authenticated team creation and database membership-conflict classification; new join codes
  must be 12–255 characters (the client generates 12-character alphanumeric codes)
- `app/stores/useSystemStore.ts`, `app/stores/useTeamStore.ts` — mode-specific teams and teammate
  hydration
- `app/features/team/TeamDangerZone.vue`, `app/features/team/useTeamInviteLink.ts` — resolved active
  team actions and mode-scoped invite links

### Invariants

- Teams expire after **168 continuous hours with exactly one membership belonging to the actual
  owner**, regardless of account activity. Joins clear the clock; last leave, kick or Auth
  account-deletion cascade starts a fresh clock. Membership role and mode must also agree with
  the team; empty or inconsistent teams are preserved for separate investigation.
- `teams.owner_only_since` and `owner_only_expires_at` are server-owned. The latter is the
  deadline shown in a persistent, non-dismissible alert on the current owner's team invite card.
  Creation shows the policy before its button. Clients never derive eligibility from the
  `TeamMembers.vue` display list, old `created_at`, account activity or a client clock.
  Membership events, reconnects and team snapshots use one authoritative membership/deadline
  refresh. Events during either read queue one fresh pair, and request, team, instance-lifetime
  and auth-session fences reject stale results. A new team's fetched snapshot can seed its
  deadline while the independent read is unavailable; snapshots never replace a successful
  same-team deadline or owner refresh, including cancellation. These fields stay together when
  a delayed snapshot predates an ownership transfer and the next read fails. A new team without
  a supplied deadline clears the previous team's warning, so a failed read never shows another
  team's date.
  A member-list failure still permits the independent authorized deadline read. This makes join
  cancellation and fresh solo warnings work when only memberships are in the Realtime publication.
  The same authorized row also supplies the current owner, so a transfer shows the warning to the
  new owner without a team snapshot. The deadline is formatted in the app's selected locale.
- Membership BEFORE triggers acquire the team row with `NOWAIT`, before pointer maintenance.
  Normal lifecycle RPCs already hold that lock. A contended raw Auth FK cascade aborts with
  `55P03` for whole-transaction retry instead of waiting while holding a membership row.
  Clock maintenance and pointers roll back with failed joins, leaves and kicks.
- `private.run_owner_only_team_cleanup` is operator-only, limits each transaction to at most
  100 team locks, skips locked teams, and rereads actual membership in a separate statement after
  the lock. It uses `disband_team`, preserving personal progress, all mode/Seasonal history,
  preferences, accounts and tokens. Team rows, memberships and team events expire together.
- Migrations schedule the hourly `owner-only-team-cleanup` job with warning and deletion gates
  off. After the warning UI and restricted observer pass acceptance, operators separately approve
  warning activation and, after 168 hours of verified warning availability, deletion activation.
  The runner gives existing solo teams a fresh seven days from their own initialization; no
  migration bulk rewrite or old-age inference is involved. Both the team deadline and global
  warning floor must pass. `deletion_enabled=false` or unscheduling the job pauses deletion. The
  [rollout runbook](../runbook.md#owner-only-team-expiry-rollout) owns monitoring and recovery.
- Committed active batches persist aggregate-only time/count/flag receipts. Receipt failures or
  disband failures roll back the entire batch; pg_cron records failure instead. The allowlisted
  observer command `owner-only-teams` reads only a private aggregate view with eligibility/grace/
  anomaly counts and the latest 20 receipts, never identities or progress. Neither the batch's 100-row cap nor the report's single output row bounds scan work.

- Legacy `user_system.team` / `team_id` values are used only when neither persistent mode-specific
  team ID exists. They must never make a PvP team appear as the active PvE team or vice versa.
- Team creation maps both the `team_memberships_user_mode_unique` SQLSTATE `23505` conflict and
  the exact SQLSTATE `P0001` message `You are already a member of a team for this game mode` from
  `create_team_with_owner` to the existing actionable HTTP 400 membership response. The initial
  membership check cannot prevent races; forward migrations changing that message or constraint
  name must update the classifier and its regression tests together. Other exceptions retain their
  existing HTTP 409/500 handling.
- Team actions and invite links are unavailable until the active team row has loaded and its ID
  matches the mode-specific system-store team ID; stale owner or join-code state is never combined
  with another team's ID.
- Teammate summaries come from `team_member_mode_summary` only. Missing normalized summaries do not
  trigger legacy progress reads. The team-members endpoint returns only derived display name, level,
  and completed-task count; progress blobs never reach the client in that payload.
- The team channel is private. Realtime authorizes a private join from `realtime.messages` RLS, and a
  read permission alone is enough to join, so the only policy is a read policy scoped to `team:<id>`
  for members of that team. No client write policy exists: the channel carries authoritative Postgres
  Changes, so `authenticated` must not be able to publish payloads to other members. Full enforcement
  also requires 'Allow public access' to be disabled in the project's Realtime settings — a dashboard
  setting no migration can apply.
- The team channel carries teammate mode-progress changes for all authorized rows; the client does
  not create one Postgres Changes channel per teammate.
- The team channel records itself as bound only after `SUBSCRIBED`, so a silently failed join is never
  mistaken for a live one. Membership events rebuild it only when the topic or teammate-progress
  filter changed, and any non-subscribed status drops the binding so the next event rebuilds.
- Subscribe callbacks log every status that is not `SUBSCRIBED` or `CLOSED`; an own-progress
  `CLOSED` before the first join still fails that join. Five consecutive failures
  tear the team channel down and schedule one rebuild a minute later, replacing Realtime's unbounded
  rejoin loop with a bounded retry cycle.
- Clients hydrate teammate progress only from materialized normalized rows in the authorized mode
  and active season. Missing or placeholder rows never invoke `get_teammate_legacy_progress` or
  overwrite hydrated progress. A failed reconnect read retains the previous snapshot. Account-wide
  metadata remains exposed through the authenticated team-members endpoint after membership validation.
- `public.team_events` is server-authored only. `anon` and `authenticated` hold no table or
  column-level `INSERT`, a restrictive policy denies client inserts even if a grant is later
  inherited, and only `service_role` may insert. A `BEFORE INSERT` trigger stamps `server_verified`
  and overwrites `created_at` with database time, so neither field is caller-supplied. Member reads
  are unchanged.
- Rows written before that containment are preserved for history and carry
  `server_verified = false` with a possibly caller-supplied `created_at`. **Every cooldown or
  rate-limit consumer of `team_events` must filter on `server_verified = true`, scope the query to
  events the caller initiated, and bound `created_at` at or below the current time.** Reading the
  preserved history without those filters lets a caller evade or extend a cooldown using a row
  forged before containment. The transitional legacy read in `private.claim_team_action_cooldown`
  and the deletion-preservation triggers are the current consumers; a new consumer inherits the
  same requirement, and deleting the untrusted rows is not a substitute because the filter is
  what makes the contract durable.
- `team-leave` calls the service-only `public.leave_team` RPC with the authenticated user ID,
  never an identity from the request body. Membership removal, conditional pointer maintenance,
  and trusted event insertion commit together. The handler performs no later table write, so a
  newer join cannot be overwritten by an old leave response.
- `team-kick` calls the service-only `public.kick_team` RPC the same way: ownership validation,
  the target membership check, the cooldown claim, membership deletion, and the trusted
  `member_kicked` event commit or roll back together. A missing target returns `not_member`
  before the cooldown is claimed. An event failure can no longer return success with a warning,
  which would have left a removed member without audit history and let the next kick pass the
  cooldown immediately. The handler keeps the legacy failure contract (`not_found`/`not_member`
  → 404, `not_owner` → 403, `self` → 400, `cooldown` → 429); the RPC collapses a non-owner
  initiator, including one with no membership, to `not_owner` so membership is never revealed.
  The retry policy is identical to leave: whole-transaction retries with 50/100 ms delays,
  only for confirmed `40P01`, `40001`, or `55P03` aborts, exhaustion returning `503` with
  `Retry-After: 1`.
- Leave takes a per-user advisory lock, then the team row and membership row; kick takes a
  per-initiator advisory lock, then the team row and the initiator's membership row. Ownership
  transfer locks the team before validating owner and successor membership, preventing promotion
  of a departed member. All three RPCs have a five-second lock timeout and service-only execution
  grants. The handler retries the whole leave transaction at most three times, with 50/100 ms
  delays, only for confirmed `40P01`, `40001`, or `55P03` aborts. Exhaustion returns `503` with
  `Retry-After: 1`; business results and ambiguous transport failures are not retried.
- Leave and kick cooldowns live in `private.team_action_cooldowns`, one row per user, mode and
  action (kick rows key the initiating owner). Disband cascades `team_events` but not this table,
  so disbanding and recreating a team cannot bypass either five-minute window. Each RPC claims the
  cooldown with one conditional upsert in its own transaction: a rejected, failed or rolled-back
  action never advances it, and a `last_at` in the future is treated as expired. Conflicting claims
  compare the upper timestamp bound with the live clock after any row-lock wait, so a concurrent
  claim is not mistaken for future history. The claim also refuses while a verified
  `member_left`/`member_kicked` event from the window exists. Before team or event deletion, triggers
  preserve that legacy-only evidence using the original event time, without extending the window
  or backfilling history during migration. This covers actions committed by the previous RPC bodies
  around deployment, including disband and kicked-target account cleanup; a later forward migration
  may remove the legacy handoff once old RPC calls and their windows have drained. Rows are removed
  only with the Auth user; the table has RLS enabled and no client grants. Deployment prerequisites,
  postchecks, and forward-migration recovery are in the
  [durable cooldown rollout runbook](../runbook.md#durable-leave-and-kick-cooldown-rollout-1031).
