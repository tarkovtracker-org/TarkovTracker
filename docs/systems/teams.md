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
  authenticated team creation and database membership-conflict classification
- `app/stores/useSystemStore.ts`, `app/stores/useTeamStore.ts` — mode-specific teams and teammate
  hydration
- `app/features/team/TeamDangerZone.vue`, `app/features/team/useTeamInviteLink.ts` — resolved active
  team actions and mode-scoped invite links

### Invariants

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
- Teammate summaries normally come from `team_member_mode_summary`. When a persistent normalized row
  is missing or its summary has no level, `app/server/api/team/members.ts` loads that member's legacy
  progress server-side and returns only the derived display name, level, and completed-task count;
  progress blobs never reach the client in the team-members payload. That fallback is best-effort — a
  failed or timed-out legacy read is logged and the endpoint still returns the members it resolved.
  It requires the service-role key: `user_progress` is owner-only, so a caller-JWT read returns at
  most the caller's own row and never a teammate's. The route logs and skips the fallback when the key
  is absent instead of issuing a request that cannot return teammate rows.
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
- New clients read teammate progress from mode rows. When a persistent normalized row is missing or
  carries no `level`, `useTeamStore` calls `get_teammate_legacy_progress` for only the teammate's
  authorized mode column; the raw `user_progress` teammate policy is not used. Account-wide metadata
  for new clients is exposed through the authenticated team-members endpoint after explicit
  membership validation.
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
  forged before containment. The transitional legacy read in `private.claim_team_action_cooldown` is the current consumer; a new consumer
  inherits the same requirement, and deleting the untrusted rows is not a substitute because the
  filter is what makes the contract durable.
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
  action never advances it, and a `last_at` in the future is treated as expired. The claim also
  refuses while a verified `member_left`/`member_kicked` event from the window exists, so actions
  committed by the previous RPC bodies around deployment still count; a later forward migration
  may drop that read. Rows are removed
  only with the Auth user; the table has RLS enabled and no client grants.
