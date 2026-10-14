# Merge queue rollout

Owner: [CI and release](systems/ci-and-release.md). Preview security remains owned by
[previews](systems/previews.md).

## Candidate validation

CI handles `merge_group: checks_requested` with full validation, including all test shards,
Supabase, contracts, Fallow and security. The queue's temporary integration commit is built with
the anonymous preview profile. The trusted Preview State controller requests the existing
credential-isolated deploy/smoke pipeline after that exact CI attempt succeeds.

The preview status targets the queue commit, not any member PR head. Before planning, upload and
success publication, the controller verifies the same-repository `gh-readonly-queue/main/` ref,
its exact SHA, first-parent base equal to current main, tree, run and successful attempt-specific
CI Result. Missing/deleted refs, changed bases, altered artifacts and failed smoke tests cannot
publish success. No candidate deployment credentials or production bindings are added.

Initial queue configuration permits one build and one merge at a time. This bounds deployment
load and makes the first-parent/current-main proof explicit; increasing concurrency requires a
new proof for cumulative queue groups, not just changing the ruleset limit.

## Activation gate — not yet active

`.github/main-merge-queue-ruleset.json` is a **disabled** rollout template. The existing strict
`.github/main-ci-ruleset.json` remains authoritative. Do not disable strict freshness or enable
the queue until all of the following are established:

1. Merge queue-aware CI/controller code and independently review the credential boundary.
2. Validate a queue canary through full CI, deployed preview and smoke checks. Confirm the live
   queue commit parent/ref/run API shapes against the proof above, including a removed entry.
3. Migrate release version promotion away from its direct `main` push. Required merge queues can
   reject that push; release publication/recovery currently depends on the exact promoted SHA.
   Preserve release provenance and recovery rather than adding a bypass actor.
4. Adapt Crowdin's strict-policy validator and immediate-merge/main-CI assumptions. Queue
   submission is not a completed merge; do not dispatch main CI for a still-queued candidate.
   Adapt Dependabot's merge-state handling as needed and verify job-token queue events trigger CI.
5. Define and validate Pages retention/cleanup for ephemeral queue preview branches before
   activation. Each re-formed queue group has its own branch; GitHub ref deletion does not
   remove its Pages deployment.
6. Establish required review admission. Existing bot comments are not GitHub approval rules;
   enqueue only after reviews are complete and findings resolved, including independent review
   for the risk classes in `AGENTS.md`. Never use `--admin`.
7. With explicit rollout authorization, activate the queue template and remove strict freshness
   only once equivalent queue integration checks are enforced. Keep both required contexts,
   GitHub Actions provider pins, `ALLGREEN`, no bypass actors, and deletion/non-fast-forward rules.

The experimental disabled queue ruleset in GitHub is not production authorization. No live
ruleset is changed by committing this template. Rollback before activation is simply leaving
strict freshness active; after activation, restore strict freshness before disabling the queue.

## Agent lifecycle after activation

An agent reviews the immutable PR head, resolves findings, records validation and obtains any
required independent review. It then submits with:

```sh
gh pr merge <PR> --repo tarkovtracker-org/TarkovTracker --match-head-commit <reviewed-head>
```

For a queue-required branch this submits the PR to GitHub's queue; it does not bypass checks or
prove a merge completed. Do not update a behind branch merely for freshness. If admission checks
are still pending, leave a handoff rather than looping on `gh pr checks --watch` or reviewing an
unchanged diff again. Auto-merge for pending admission requires separately enabled repository
support; currently it is disabled.

The PR handoff records: reviewed head, findings/review state, validation evidence, queue entry
or blocking check, branch/worktree, and next command. Report **QUEUED**, not MERGED. End the agent
turn immediately; Actions owns CI, previews and the merge wait. Resume only for a failure that
needs a code decision, a new review finding, or an explicit follow-up request. On resumption read
the handoff and changed evidence, not the entire previous review. Provider cache retention and
billing are outside GitHub's control; no cache or token saving is guaranteed.

GitHub queue guidance: <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue>.
