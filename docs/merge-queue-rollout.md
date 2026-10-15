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
   only once equivalent queue integration checks are enforced. Keep the two Actions-pinned CI/preview
   contexts and the App-pinned admission context, `ALLGREEN`, no bypass actors, and
   deletion/non-fast-forward rules.

## Integrated automation and review admission

The staged integration implements the compatibility gates; it does not activate live rulesets.
`Review Admission` is a third required context pinned to a dedicated GitHub App. Its trusted-main
controller verifies a completed exact-head CodeRabbit/Cubic review or an independent collaborator
approval, complete review-thread evidence, and no outstanding changes requested. A bot comment or
green provider check without completed review evidence is insufficient.
Cubic completion requires one marked summary with a clean overall result, including its
`No issues found` wording; quoted clean text and conflicting issue counts do not grant admission.

Native resolved-thread enforcement remains required alongside Review Admission. The queue ruleset
uses a `pull_request` rule with `required_review_thread_resolution: true` and zero required human
approvals, so a newly reopened thread blocks the server-side merge even when no workflow event
was emitted. Low-risk bot admission does not create a human approving review.

The controller serializes relevant events at job scope, after its event filter. Ordinary issue
comments do not consume publication slots. Approval creation, edits and deletion remain relevant,
including withdrawal of a command with leading whitespace. The filter admits a command event only
when its author has live write permission; others' commands never count, so they cannot queue a
recheck or flip a queued status to pending. `author_association` is not used, because it does not
reliably reflect write access. A failed permission lookup still rechecks.

Small ordinary changes, translations and verified safe dependency/version metadata changes may
enter after bot review. Sensitive and unclassified changes require an exact-head approving review
from an independent write collaborator, or a write collaborator's single-line command:

```text
/approve-sensitive <40-character-reviewed-PR-head-SHA>
```

Agents may record that command only after receiving the specific merge authority required by
`AGENTS.md`; admission never supplies authorization itself. Changed heads invalidate approval.
Queue admission re-proves the member PR, live queue ref, current-main parent and single-entry
squash `ALLGREEN` configuration. A squash queue commit has current main as its only parent and is
exactly one commit ahead of it; it does not contain the PR head as an ancestor, so GitHub's queue
entry (exact PR head and exact queue commit) is the PR binding. Read-only signal workflows cannot publish approval. Consumers authenticate
the controller run, attempt, trusted policy source and uploaded `review-admission-<SHA>` receipt.

Review and review-comment wakeups resolve the service-owned PR link from the authenticated
signal attempt, then reread its current head and queue. A provider-suite signal supplies only a
bounded locator: the controller fetches the known completed provider suite from this repository
and resolves exactly one PR before evaluating live evidence. Missing or ambiguous mappings hold
admission; an explicit trusted-main dispatch can recover once review evidence is complete. The
controller never assumes a signal SHA equals the live PR head. Prove provider wakeup delivery
and ordering in the live canary; [GitHub restricts check-suite event delivery](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#check_suite).

Crowdin validates its immutable translation diff without updating a behind branch when queue
policy is active. While strict freshness and the verified queue coexist during rollout, their
validation remains strict but admission and pending queue reporting already work. Crowdin and
Dependabot explicitly request authenticated admission and submit a
head-pinned normal merge. They report queued entries without dispatching main CI early; direct
job-token merges dispatch main CI only after the PR is actually merged. Existing dependency,
translation, fork and credential controls remain enforced.

Release preparation creates a reviewed version-assets PR and finishes without tagging or pushing
main. The promotion controller submits the admitted immutable PR; later finalization publishes
only the actual merged SHA after verifying source-run receipt, generated assets, source parent,
review admission and CI/preview. Interleaved main changes fail closed. An authenticated unchanged,
unqueued, unmerged version PR may be regenerated by a normal Release run; an already merged stale
snapshot requires reviewed recovery before fresh preparation. Commands and recovery guarantees
are owned by
[release automation](../scripts/release/README.md).

Queue-only Pages retention is dry-run by default. Its independent activation switch and protected
deployment lifecycle are described in [previews](systems/previews.md#queue-preview-retention).
Native queue previews serialize with retention using `queue: max`. Ordinary and fork previews
keep their own per-CI-run lock, so fork approval waits do not block the shared queue lifecycle.
The dispatch profile is verified before approval and upload. The queue remains one build/merge at a time, with a
60-minute response bound; integration is still full CI plus an anonymous deployed preview.

## Admission publisher provisioning

Dependabot waits for CI, security and preview gates before explicitly refreshing its exact-head
admission. In queue mode, older admission controller checks and a failure or pending status
cannot prevent that refresh. The authenticated receipt must succeed before mergeability is checked; other
failed checks/statuses still block. A policy-mode change during validation requires a retry.

An obsolete merge-group signal is rejected before publishing to the current PR or replacement
group. Current review/approval revocations still invalidate both live statuses, and queue
discovery failures remain fail-closed.

As of 2026-10-14, the organization uses GitHub Free; organization ruleset workflow enforcement is
unavailable. Generic GitHub Actions identity cannot secure native queue admission: a candidate
workflow can request status-write permission and publish the same context. Receipt validation
protects automation consumers but is not evaluated by GitHub's native merge gate.

Queue activation therefore requires an isolated GitHub App. The reviewable registration
manifest is [`.github/review-admission-app-manifest.json`](../.github/review-admission-app-manifest.json):

- Register an organization-owned App with repository **Commit statuses: write** and implicit
  **Metadata: read** only, webhooks disabled, and install it on this repository alone.
- Create/protect the `review-admission` environment with a custom branch policy allowing only
  the exact `main` branch. Verify a non-main workflow is denied before adding its private key.
- Store `REVIEW_ADMISSION_PRIVATE_KEY` only in that environment. Set the public repository
  variables `REVIEW_ADMISSION_APP_ID`, `REVIEW_ADMISSION_BOT_ID`, and
  `REVIEW_ADMISSION_INSTALLATION_ID` from the verified App/installation identity.
- The trusted publisher validates the App, bot, selected installation and repository before
  minting a short-lived statuses-only token. Candidate jobs never receive that key/token;
  CI, release and queue consumers receive only the public IDs.
- With no App variables, strict-mode head receipts retain their legacy Actions issuer.
  Queue-group admission is denied. Partial configuration or a missing configured key fails
  closed; there is no fallback from a configured App to Actions.

The committed queue template uses admission App ID `0` as an unprovisioned sentinel and stays
**disabled**. Render a disabled, App-pinned candidate only after provisioning:

```sh
node scripts/ci/render-merge-queue-ruleset.mjs <verified-App-ID>
```

The renderer rejects GitHub Actions ID `15368`, zero, bypass actors and active templates.
App/key/environment provisioning is a separate approved credential/access change; committing
these files does not create an App, install it, set a variable, or store a credential.

## Activation procedure

1. Merge the reviewed integration changes and verify their exact main CI/deployment. Run the
   `Preview Retention` workflow on main with `apply=false`; retain its authenticated dry-run report.
   Check live API pagination, protected production/latest IDs and unknown-record retention.
2. Obtain explicit authorization for App/environment credential provisioning and the live
   queue/retention rollout. Complete the publisher provisioning above. Keep the existing `Main`
   deletion/non-fast-forward rules. Do not add bypass actors or use an admin merge.
3. Activate the reviewed, rendered App-pinned queue template for main while leaving `Main CI freshness` active. Use one
   current, reviewed low-risk canary PR. Record the real merge-group ref/SHA/parents, source PR
   head, GraphQL entry and job-token event delivery. Confirm the queue commit has one parent and
   that the building entry reports `position` 1; admission denies any other shape. Prove all full CI jobs, admission, deployed
   preview, smoke tests and authoritative result succeed on the queue SHA. Confirm a generic
   Actions-issued admission status cannot satisfy the App-pinned gate.
4. Enqueue and remove a second isolated canary before completion. Prove its deleted/re-formed ref
   cannot publish success or delete a deployment needed by pending jobs. Close its unmerged PR
   and remove only owned canary branches afterward.
5. Exercise the bot-token enqueue path and version-promotion staging path; queue submission must
   produce merge-group CI without manual workflow approval, and release preparation must not tag.
   Keep any unproven automation gate held rather than adding token/ruleset bypasses.
6. Enable the separately approved `PREVIEW_QUEUE_RETENTION_ENABLED=true` variable in the protected
   `preview` environment only after dry-run/lifecycle proofs. Cleanup remains limited to proven,
   obsolete queue previews at least 48 hours old; production, normal PR previews and unknown
   historical deployments are excluded.
7. Only after every canary and compatibility gate passes, disable `Main CI freshness`; keep the
   active queue's three required contexts with their separate issuer pins and single-entry `ALLGREEN` policy.
   Verify a behind reviewed PR can enqueue unchanged. Record the live ruleset IDs and evidence
   on the rollout PR/issue. Until this step, repeated freshness work remains expected.

Rollback restores strict freshness first, then disables the queue and retention activation
switch. Never leave main without equivalent required checks during either transition.

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
