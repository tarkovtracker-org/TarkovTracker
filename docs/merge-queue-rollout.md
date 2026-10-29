# Merge queue rollout

Owner: [CI and release](systems/ci-and-release.md). Preview security remains owned by
[previews](systems/previews.md).

## Candidate validation

CI handles `merge_group: checks_requested` using the exact event base and checked-out integration
head. The new docs-only queue reduction reuses the existing path classifier. A complete
single-parent delta containing only inert documentation keeps formatting, systems drift and
security required, while skipping app build and tests. Agent policy files, GitHub configuration, mixed changes and uncertain evidence stay full.
Deployment necessity is independent of full CI selection. Admission tooling, tests and the
Crowdin locale-sync workflow can keep every queue CI/security job while skipping deployment;
PR #1316's seven-file inventory is a regression fixture. The trusted Preview State controller
independently classifies the complete exact integration comparison using the same central rules,
then publishes `Preview Result: success` as not applicable without expecting a build artifact.
Build/dependency inputs, application/assets/locales, `scripts/preview/**`, setup scripts and shared
actions still require previews. Workflow files other than Crowdin's locale sync also retain
previews, including unknown/new workflows; there is no blanket workflow exemption. A mix
containing any deployable path, unknown paths, malformed/capped comparisons and explicit full
runs cannot establish a preview exemption. All-inert mixes can still skip deployment. Stale revisions and changed CI attempts cannot publish success. Deployable integrations
retain the anonymous credential-isolated preview deployment/smoke pipeline after their exact CI
attempt succeeds. Live queue N/A validation remains a rollout item after authorized merge.

The preview status targets the queue commit, not any member PR head. Before planning, upload and
success publication, the controller verifies the same-repository `gh-readonly-queue/main/` ref,
its exact SHA, first-parent base equal to current main, tree, run and successful attempt-specific
CI Result. Missing/deleted refs, changed bases, altered artifacts and failed smoke tests cannot
publish success. No candidate deployment credentials or production bindings are added.

Initial queue configuration permits one build and one merge at a time. This bounds deployment
load and makes the first-parent/current-main proof explicit; increasing concurrency requires a
new proof for cumulative queue groups, not just changing the ruleset limit.

## Provisioning checkpoint

The organization-owned Review Admission App (`5328610`) has only commit-status write and
metadata read access, installed on TarkovTracker alone. Its signing key is isolated in the
`review-admission` environment, whose branch policy allows only `main`.

[Run 38687620665](https://github.com/tarkovtracker-org/TarkovTracker/actions/runs/38687620665)
proved a non-main workflow was denied before credential provisioning.
[Run 38726052506](https://github.com/tarkovtracker-org/TarkovTracker/actions/runs/38726052506)
produced the authenticated exact-head receipt used before the guarded merge of
[#1237](https://github.com/tarkovtracker-org/TarkovTracker/pull/1237).
These provisioning receipts complement the group-specific integration and removal/reformation
proofs required below; they do not establish native queue behavior.

## Current state

Main is queue-only as of 2026-10-16:

- Ruleset `Main merge queue (staged)` (ID `25157234`) has been active since 2026-10-15 ~13:12 UTC.
  It requires `CI Result` and `Preview Result` from GitHub Actions (integration `15368`) and
  `Review Admission` from the Review Admission App (`5328610`), without strict freshness. Its squash
  `ALLGREEN` queue builds and merges one entry at a time (minimum group size 1) with a 60-minute
  check response timeout. A `pull_request` rule requires review-thread resolution with zero
  approvals. There are no bypass actors.
- `Main CI freshness` (ID `23539975`) was disabled on 2026-10-16 at 04:34 UTC, so
  `main_policy_mode` in `scripts/ci/github-ci-gate.sh` reports `queue`. Ruleset `Main`
  (`11256377`) keeps deletion and non-fast-forward protection.
- Proven live: #1240, #1236, #1246, #1247, #1250, #1253, #1254, #1255 and #1256 merged through the
  native queue with `CI Result`, `Preview Result` and App-issued `Review Admission` on the queue
  commit. #1243 exercised removal and re-formation. #1254 was enqueued while #1255 was building;
  after #1255 merged, #1254 was behind main, built on the new main and merged without a branch
  update.
- Done: job-token (`GITHUB_TOKEN`) enqueue starts no `merge_group` CI. Dependabot (#1349) and
  Crowdin (#1314) entries sat at `AWAITING_CHECKS` until a maintainer re-enqueued them.
  Automation is wired to submit through the Queue Submitter App
  ([provisioning](#queue-submitter-provisioning)) and fails closed without it; no ruleset bypass
  was added. Open: the first App-submitted automation entry must show `merge_group` CI starting.
  Queue preview retention (`PREVIEW_QUEUE_RETENTION_ENABLED`) is not enabled. Flaky smoke tests
  that remove otherwise healthy queue entries remain to be fixed.

[`main-merge-queue-ruleset.json`](../.github/main-merge-queue-ruleset.json) remains the reviewed,
disabled queue template; [`render-merge-queue-ruleset.mjs`](../scripts/ci/render-merge-queue-ruleset.mjs)
owns rendering it ([provisioning](#admission-publisher-provisioning)).
[`main-ci-ruleset.json`](../.github/main-ci-ruleset.json) remains the `Main CI freshness` rollback
template. Committing either file changes no live ruleset.

**Rollback:** re-enable strict freshness before touching the queue ruleset or retention switch:

```sh
gh api -X PUT repos/tarkovtracker-org/TarkovTracker/rulesets/23539975 -f enforcement=active
```

The policy mode then returns to `strict-queue`. Never leave main without equivalent required checks.

## Activation gates (history)

These gates preceded activation; the live state above records their outcome. Gates 5 and 6
correspond to [activation procedure](#activation-procedure-history) steps 5 and 6.

1. Done: queue-aware CI/controller code merged with independent review of the credential boundary.
2. Done: queue canaries passed full CI, deployed preview and smoke checks, including a removed entry.
3. Done: release no longer pushes to `main`. `scripts/release/release-commit.sh` pushes only
   `wip/release-*` staging refs, the promotion controller enqueues the reviewed version PR, and
   finalization creates tags through the API after the actual merge.
4. Done: required review admission is App-pinned. Bot comments are not GitHub approval rules;
   enqueue only after reviews are complete and findings resolved. Never use `--admin`.
5. Open: Crowdin's policy validator, Dependabot merge-state handling and release promotion are
   queue-aware in code, and queue submission does not dispatch main CI. They submit through the
   Queue Submitter App; live proof of App submission and version promotion is pending (above).
6. Open: queue-preview Pages retention runs dry-run only. Each re-formed queue group has its own
   branch, and GitHub ref deletion does not remove its Pages deployment.
7. Done: with explicit maintainer authorization, the queue was activated and strict freshness was
   disabled while gates 5 and 6 remained open, because both fail closed. The three issuer-pinned
   contexts, `ALLGREEN`, no bypass actors, and `Main` were kept.

## Integrated automation and review admission

The staged integration implements the compatibility gates; it does not activate live rulesets.
`Review Admission` is a third required context pinned to a dedicated GitHub App. Its trusted-main
controller verifies a completed exact-head CodeRabbit/Cubic review or an independent collaborator
approval, complete review-thread evidence, and no outstanding changes requested. A bot comment or
green provider check without completed review evidence is insufficient.
CodeRabbit completion may also come from its GitHub-authenticated bot issue comment: one clean
recent-review section, minimal-risk section, and a unique `reviewed` coverage marker whose source
and covered commits both equal the current head. The observed marker schema is checked strictly;
quoted/fenced, stale, malformed, duplicate, incomplete, or conflicting evidence does not qualify.
The REST comment list only locates candidates. One GraphQL `IssueComment` response supplies the
body, author, editor, and edit time together; missing provenance or a last edit by anyone other
than CodeRabbit rejects the evidence. Never-edited comments require explicit null edit metadata.
Comment identity uses GraphQL `fullDatabaseId`, matched as a decimal string against a positive safe
REST integer; the receipt preserves that REST number without a lossy numeric conversion.
Line endings are normalized; positive counts (including leading zeros) and contradictory
merge-risk statements anywhere in the full body reject admission.
Receipts identify this evidence as `kind: issue-comment`; the id is the issue-comment id. Provider
check failures, current review findings, unresolved threads, and sensitive-change approval still
apply. No new token permissions are needed. Creation, edits, and deletion of these authenticated
provider comment sections recheck admission,
including edits that withdraw the previous completion body. Other ordinary comments remain
filtered before serialization. The existing admission-only dispatch can also recheck evidence.
Cubic completion requires one marked summary with a clean overall result, including its
`No issues found` wording; quoted clean text and conflicting issue counts do not grant admission.

Native resolved-thread enforcement remains required alongside Review Admission. The queue ruleset
uses a `pull_request` rule with `required_review_thread_resolution: true` and zero required human
approvals, so a newly reopened thread blocks the server-side merge even when no workflow event
was emitted. Low-risk bot admission does not create a human approving review.

The controller serializes relevant events at job scope, after its event filter. Ordinary issue
comments do not consume publication slots. Approval creation, edits and deletion remain relevant,
including withdrawal of a command with leading whitespace.

An intake condition also skips ordinary comments before allocating the read-only filter runner.
It is a coarse selector, never approval evidence: trusted main still verifies retained events.
Both current and previous comment bodies are checked so approval edits/deletions and provider
withdrawals still reach revocation.
Release-promotion serialization is limited to successful same-repository source runs; the serialized
job still authenticates receipts and skips runs without an eligible release PR. These no-op runs can
delay promotions, but their separate lock cannot block admission publication. GitHub may still display
skipped workflow records; these records perform no validation or publication work.
Post-merge main CI remains required by release provenance checks even when queue CI used the same
commit; it must not be removed without updating and validating those consumers.

The `Review Admission` commit status is the gate. An expected policy hold (draft or closed PR,
missing exact-head review, unresolved findings or changes requested, missing sensitive approval) publishes
`failure` on the PR head and any live queue commit, then ends the controller run green with a
notice, so a denial does not create a failed run for every review event. Integrity, identity,
publisher and API errors still fail the run. A hold found after a receipt output was recorded also
fails the run, so no receipt can be uploaded or published. Consumers still require a `success`
status, a successful run and an approving receipt.

Ordinary changes, translations and verified safe dependency/version metadata changes may
enter after bot review. Ordinary paths include `app/{components,pages,features,layouts,assets}/`,
docs, root Markdown, locales and supported test paths. Sensitive paths always take precedence,
including `AGENTS.md`, `CLAUDE.md`, `SECURITY.md` and `code_review.md` policy controls.
Docs, root Markdown and locales skip patch-pattern scanning; other ordinary files must avoid
credential, session, storage and network patterns in the complete diff hunk, including unchanged
context. Fetch references, typed wrappers and absolute URLs remain sensitive. Generic helpers under
`app/{composables,utils,types,stores}/` remain unclassified unless they match a supported test path:
their diff alone cannot establish whether sensitive capabilities are imported or passed in elsewhere.
The size limit is 500 changed lines outside docs, root Markdown, locales, `__tests__/` directories
and supported test files. Sensitive and unclassified changes require an exact-head approving review
from an independent write collaborator, or a write collaborator's single-line command (it approves
the sensitive change only; it replaces the review requirement only when posted by a current admin):

```text
/approve <40-character-reviewed-PR-head-SHA>
```

(`/approve-sensitive <head>` is the older, equivalent spelling; see
[approval commands](#approval-commands).) Agents may record that command only after receiving the specific merge authority required by
`AGENTS.md`; admission never supplies authorization itself. Changed heads invalidate approval.
Queue admission re-proves the member PR, live queue ref, current-main parent and single-entry
squash `ALLGREEN` configuration. A squash queue commit has current main as its only parent and is
exactly one commit ahead of it; it does not contain the PR head as an ancestor, so GitHub's queue
entry (exact PR head and exact queue commit) is the PR binding. Configuration is re-proved from
the one repository-owned effective main queue rule through the public REST branch-rules endpoint;
this removes GraphQL queue configuration reads without broadening job/App permissions.
Missing, ambiguous, foreign or changed queue policy fails closed. With one build slot, a later
entry stays `QUEUED` with no integration commit or `gh-readonly-queue/` ref; admission then
evaluates only the PR head, and the group's own `merge_group` signal re-runs it once built. Any
other entry without a provable integration commit still fails closed. Read-only signal workflows cannot publish approval. Consumers authenticate
the controller run, attempt, trusted policy source and uploaded `review-admission-<SHA>` receipt.

Review and review-comment wakeups resolve the service-owned PR link from the authenticated
signal attempt, then reread its current head and queue. A provider-suite signal supplies only a
bounded locator: the controller fetches the known completed provider suite from this repository
and resolves exactly one PR before evaluating live evidence. Provider suites on
`gh-readonly-queue/` commits are not review evidence and do not run the signal job, because that
group's own `merge_group` signal drives queue admission. If one still reaches the controller, an
authenticated provider suite on a canonical main queue ref with no linked PR records a notice and
changes no status. Missing or ambiguous mappings hold
admission; an explicit trusted-main dispatch can recover once review evidence is complete. The
controller never assumes a signal SHA equals the live PR head. Prove provider wakeup delivery
and ordering in the live canary; [GitHub restricts check-suite event delivery](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#check_suite).

Review and review-comment signals are debounced per PR: each waits 45 seconds inside a per-PR
`cancel-in-progress` group, so a review and its inline comments wake the serialized controller
once. Cancelled signals are already ignored by the controller's success-only intake, and the
surviving signal still rereads live evidence, so no review state is lost. Queue and
provider-suite signals keep unique groups. A coarse prefilter keeps follow-on controllers off
the shared queue: Release Promotion Queue skips Review Admission runs whose display-only
`run-name` names an ordinary branch (`wip/release-*`, queue refs, `unscoped` and pre-locator
titles still wake it; provider-suite admissions stay `unscoped` because their signal runs on
`main`). The title is not evidence; every retained run is authenticated as before.

Crowdin validates its immutable translation diff without updating a behind branch when queue
policy is active, as it is now. In `strict-queue` mode (strict freshness and the queue both
active, as during rollout or after rollback), validation remains strict while admission and
pending queue reporting still work. Crowdin and
Dependabot explicitly request authenticated admission and submit a
head-pinned native enqueue through `enqueuePullRequest` with `expectedHeadOid` in the mutation input. This does not depend
on the repository auto-merge setting. They report queued entries without dispatching main CI early; direct
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
60-minute response bound. Only proven inert docs integrations and narrowly verified lockfile-only Prettier refreshes use the reduced validation and
not-applicable preview described above; other integrations keep full CI and a deployed preview.

### Approval commands

Approvals are plain PR comments, read by Review Admission from trusted main
([`review-admission-attestation.mjs`](../scripts/ci/review-admission-attestation.mjs)). Each is a
single line naming the exact 40-character head:

```text
/approve <40-character-reviewed-PR-head-SHA>
```

- From a current repository **admin**, in an unedited comment, it is the exact-head **review attestation**: the explicit
  alternative to a completed provider or non-author human review, including when the admin
  authored the PR. It also counts as the sensitive-change approval.
- From any other write collaborator, it is only the sensitive-change approval; the review
  requirement still needs a provider or non-author review.
- `/approve-sensitive <head>` is accepted as the older spelling of the same command.

An attestation never resolves findings, dismisses changes requested, or skips CI, preview,
native queue integration or the App-pinned admission gate. A new head needs a new comment.
Editing or deleting the comment withdraws it: comment edits and deletions wake admission, which
rereads live comments, and receipt consumers (release promotion, Crowdin, Dependabot) recheck the
attesting comment, its unchanged body and the author's current admin role before trusting a
receipt. When a bot PR has green CI/preview but admission reports
`Completed exact-head independent review is required.`, ask a non-author write collaborator for an
approving review or post the admin command after reviewing the head. Skipped, rate-limited, and
"no reviewable files" provider results do not count as completed review.

Generated release version PRs (`wip/release-*`, authored by GitHub Actions, changing only the
manifest version and `CHANGELOG.md`, verified by
[`review-admission-release.mjs`](../scripts/ci/review-admission-release.mjs)) are admitted as
`release-policy` / `review-exempt`: no review provider covers them, so requiring one stalled every
release. Threads, changes requested, CI, preview and queue proof still apply, and release
promotion still authenticates its source run receipt.

PR previews are requested with `/preview` and stopped with `/preview stop`
([previews](systems/previews.md)). The former PR Controls panel and its checkbox, journal and
structured-dispatch operations were removed; existing `TarkovTracker Controls #<PR>` statuses on
the old anchor commit are inert history.

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
- Bot identity is read through the workflow's existing authenticated metadata client, avoiding
  the anonymous API quota. The [publisher implementation](../scripts/ci/review-admission-issuer.mjs)
  owns request deadlines and diagnostic filtering. Inspect the reported rate-limit reset or
  `retry-after` time before retrying a denied run.
- With no App variables, strict-mode head receipts retain their legacy Actions issuer.
  Queue-group admission is denied. Partial configuration or a missing configured key fails
  closed; there is no fallback from a configured App to Actions.

## Queue submitter provisioning

GitHub starts no workflows for events caused by the job token (`GITHUB_TOKEN`). A queue entry
that Crowdin Sync, Dependabot Auto Merge or Release Promotion Queue submits with the job token
therefore never receives `merge_group` CI and times out after 60 minutes (observed on #1349 and
#1314, 2026-10-29). Those workflows submit through a second, isolated App instead, so the
entry behaves like a maintainer-submitted one. The App only submits entries: GitHub's required
checks, Review Admission and the queue ruleset still decide what merges. The registration
manifest is [`.github/queue-submitter-app-manifest.json`](../.github/queue-submitter-app-manifest.json):

- Register an organization-owned App with repository **Contents: write** and **Pull requests:
  write** (implicit **Metadata: read**), webhooks disabled, and install it on this repository
  alone. Keep it separate from the statuses-only Review Admission App, so the identity that
  admits a head cannot also submit it.
- Store `QUEUE_SUBMITTER_PRIVATE_KEY` only in the `merge-queue` environment, whose custom branch
  policy allows only `main`. Set the public repository variable `QUEUE_SUBMITTER_APP_ID`.
- [`queue-submitter.mjs`](../scripts/ci/queue-submitter.mjs) verifies the App's selected
  installation for this repository and mints a selected-repository token restricted to this
  repository and those two permissions. [`enqueue-pr-cli.mjs`](../scripts/ci/enqueue-pr-cli.mjs)
  uses it for the guarded PR check, queue-entry query and enqueue mutation, and only the
  submitting step receives the key.
- The submitting steps set `QUEUE_SUBMITTER_REQUIRED=true`: without the App variable and key they
  fail before submitting instead of using the job token. Without that flag (local maintainer
  runs) the helper keeps the inherited `gh` credential. Partial configuration always fails
  closed.

The committed queue template uses admission App ID `0` as an unprovisioned sentinel and stays
**disabled**. Render a disabled, App-pinned candidate only after provisioning:

```sh
node scripts/ci/render-merge-queue-ruleset.mjs <verified-App-ID>
```

The renderer rejects GitHub Actions ID `15368`, zero, bypass actors and active templates.
App/key/environment provisioning is a separate approved credential/access change; committing
these files does not create an App, install it, set a variable, or store a credential.

## Activation procedure (history)

Steps 1-4 and 7 are complete; steps 5 and 6 remain open. Evidence is in [Current state](#current-state).
Activation gates 5 and 6 above track the same open steps.

1. Done. Merge the reviewed integration changes and verify their exact main CI/deployment. Run the
   `Preview Retention` workflow on main with `apply=false`; retain its authenticated dry-run report.
   Check live API pagination, protected production/latest IDs and unknown-record retention.
2. Done. Obtain explicit authorization for App/environment credential provisioning and the live
   queue/retention rollout. Complete the publisher provisioning above. Keep the existing `Main`
   deletion/non-fast-forward rules. Do not add bypass actors or use an admin merge.
3. Done 2026-10-15 (ruleset `25157234`). Activate the reviewed, rendered App-pinned queue template for main while leaving `Main CI freshness` active. Use one
   current, reviewed low-risk canary PR. Record the real merge-group ref/SHA/parents, source PR
   head, GraphQL entry and job-token event delivery. Confirm the queue commit has one parent and
   that the building entry reports `position` 1; admission denies any other shape. Prove all full CI jobs, admission, deployed
   preview, smoke tests and authoritative result succeed on the queue SHA. Confirm a generic
   Actions-issued admission status cannot satisfy the App-pinned gate.
4. Done (#1243). Enqueue and remove a second isolated canary before completion. Prove its deleted/re-formed ref
   cannot publish success or delete a deployment needed by pending jobs. Close its unmerged PR
   and remove only owned canary branches afterward.
5. Open. Job-token enqueue was disproven (it starts no `merge_group` CI); automation submits
   through the [Queue Submitter App](#queue-submitter-provisioning) instead of a ruleset bypass.
   Still pending: live proof that an App-submitted automation entry starts `merge_group` CI, and
   that the version-promotion staging path does not tag.
6. Open. Enable the separately approved `PREVIEW_QUEUE_RETENTION_ENABLED=true` variable in the protected
   `preview` environment only after dry-run/lifecycle proofs. Cleanup remains limited to proven,
   obsolete queue previews at least 48 hours old; production, normal PR previews and unknown
   historical deployments are excluded.
7. Done 2026-10-16 04:34 UTC: `Main CI freshness` was disabled with explicit maintainer
   authorization after steps 1-4 passed. Steps 5 and 6 were not prerequisites: they remained open
   because both fail closed (a bot entry that starts no CI times out and is removed, and retention
   stays dry-run). The active queue kept its three required contexts with their separate issuer
   pins and single-entry `ALLGREEN` policy. A behind reviewed PR (#1254) merged through the queue
   without a branch update. Live ruleset IDs and evidence are in [Current state](#current-state).

Rollback is described under [Current state](#current-state).

## Agent lifecycle after activation

An agent reviews the immutable PR head, resolves findings, records validation and obtains any
required independent review. It does not need to wait for CI, previews or review admission
before handing off. When the `AGENTS.md` merge class allows merging, it enables head-pinned
auto-merge right after pushing the reviewed head; high-risk PRs stop at **READY** instead:

```sh
gh pr merge <PR> --auto --match-head-commit <reviewed-head>
```

GitHub adds the PR to the native queue once `CI Result`, `Preview Result` and `Review Admission`
pass on the PR head and every review thread is resolved; if they already pass, it queues the PR
at once. The queue then requires the same three contexts again on its own integration commit
before merging. The queue's squash method applies, so no merge-method flag is needed, and
auto-merge never bypasses a required context. A later push needs its own exact-head review
admission before the queue accepts it, and a push from an account without write access disables
auto-merge. When no provider review covers the head, a current repository admin with the required
merge authority posts `/approve <40-character reviewed head SHA>` alone in a comment
([approval commands](#approval-commands)); that also approves a sensitive change. A non-admin
write collaborator's `/approve` approves only the sensitive change. An agent posts the command only
after its own review of that exact head.

Automation and agents whose admission is already green can still submit directly from a trusted
checkout of main; this native enqueue does not depend on the auto-merge setting:

```sh
node scripts/ci/enqueue-pr-cli.mjs tarkovtracker-org/TarkovTracker <PR> <reviewed-head>
```

The helper pins the native enqueue mutation to the reviewed head and validates the returned
entry. An auto-merge request or queue entry proves submission; report a merge only after
observing it. Do not update a behind branch merely for freshness, and do not loop on
`gh pr checks --watch` or review an unchanged diff again.

The PR handoff records: reviewed head, findings/review state, validation evidence, auto-merge or
queue entry (or the blocking check), branch/worktree, and next command. Report **QUEUED** when
GitHub queued it, **AUTO-MERGE ON** while it waits for checks, never MERGED. End the agent turn immediately; Actions owns CI, previews and the merge
wait. Resume only for a failure that needs a code decision, a new review finding, or an explicit
follow-up request. On resumption read the handoff and changed evidence, not the entire previous
review. Provider cache retention and billing are outside GitHub's control; no cache or token
saving is guaranteed.

### Reusing identical PR validation in the queue

A queue entry usually integrates the same tree its PR already tested: PR CI checks out GitHub's
test merge, and when main has not moved since, the squash queue commit has an identical Git tree.
The queue then reuses that work instead of repeating it
([`scripts/preview/queue-reuse.mjs`](../scripts/preview/queue-reuse.mjs)). Reuse requires all of:

- the live queue ref and its single parent (current main) as for any queue candidate;
- an open, same-repository, non-release member PR named by the canonical queue branch;
- that PR head's newest `Preview Result` is a success from the trusted `preview.yml` run on
  main, with a successful `Publish preview result` job and retained `preview-deployment-<head>`
  evidence whose verified `treeSha` equals the queue tree;
- the evidence's source CI run is the latest attempt of this repository's `pull_request` CI for
  that head, and every full-validation job in it succeeded.

Main's code decides: the CI `Validation plan` job checks out the default branch into
`.trusted-main` for this lookup, and the preview controller repeats it before publishing. A reused
entry runs only the always-selected jobs (`Lint & Format`, `Systems drift check`, `Security`) and
publishes `Preview Result` on the queue commit pointing at the PR's preview run, with no new
deployment. Any missing, mismatched or unreadable evidence validates the entry in full. Release
version PRs are excluded because finalization needs a queue preview deployment on the merged SHA.
Previews deployed before deployment evidence recorded `treeSha` are not reusable.

GitHub queue guidance: <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue>.

Receipt helpers run in Ubuntu/WSL and require Node and `unzip`; workflow tests also use Python 3.

### Crowdin translation admission

In `queue`/`strict-queue` mode, verified Crowdin translation PRs are exempt from requesting
independent review through Review Admission. This admission exemption
requires the numeric repository identity and same-repository `locales` -> `main` branch, the actual
GitHub Actions bot ID/type/login, a complete unique PR changed-file inventory restricted to supported non-English locales, and an immutable
GitHub compare plus non-truncated tree proving regular JSON blobs. Renames, deletions, executable
modes, English source, nested paths, mixed changes and incomplete inventories fail back to normal
review. The policy additionally requires a head-owned validation receipt uploaded by this
repository's main-owned Crowdin Sync workflow after format, i18n and systems checks. The publisher
authenticates the service-owned artifact/run/path/event/repository, exact run attempt and source on
trusted main history; titles, labels and author display names cannot grant the exemption. A live
sync may supply its already-uploaded validation receipt before its final merge step finishes.

The admission receipt records `crowdin-policy` / `review-exempt`, rather than claiming that a
review occurred. Open review threads, changes requested and authenticated substantive provider
findings remain blockers. CI, syntax/placeholders/key checks, preview, sensitive-change policy,
current-head fences and native queue integration are unchanged. Other candidates retain the
existing provider, independent collaborator review or valid exact-head admin-attestation routes.
Unchanged locales need not appear in the changed-file inventory. A changed head needs a new trusted Crowdin validation receipt; historical PRs are not grandfathered.
There are no provider requests or billing/configuration changes.

Crowdin Sync retains its existing main-only schedule/manual orchestration and token permissions.
After uploading validation provenance, its existing merge step dispatches candidate CI and preview,
in `queue`/`strict-queue` mode requests one protected Review Admission publication, authenticates
that accepted dispatch and its exact-head receipt, then performs normal guarded native enqueue.
Legacy `strict` mode is unchanged: its merge step uses the broader flat non-English JSON scope, does not
wait for Review Admission, and retains guarded `gh pr merge --match-head-commit` plus post-merge main-CI
dispatch. It does not enforce or attest the new queue-admission exemption described above; it must
not be used as its commissioning path. Unsupported locales in queue modes retain normal review. The admission helper allows at most 120 pending polls with five-second sleeps,
plus each poll's existing API deadlines; it fails closed on terminal errors. This is a retry-count
bound rather than an exact ten-minute wall-clock deadline. CI and preview keep their existing
limits. No additional privileged trigger, promotion workflow or scanner exception is needed.

If findings, changed revisions or infrastructure failures hold a sync after its bounded wait,
resolve the cause and rerun Crowdin Sync on main, or let its existing schedule try again. This does
not promise an immediate enqueue when a finding is resolved after the job has ended. A rerun may
download fresh translations, so fix material locale wording in Crowdin upstream as well. To roll
back the review exemption, remove the narrow `crowdinExemption` admission route; ordinary review
requirements resume without changing queue rules, publisher permissions or credentials.
