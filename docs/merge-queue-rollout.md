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
- Open: job-token (`GITHUB_TOKEN`) enqueue by Dependabot, Crowdin and release promotion is
  unproven. The next real bot-submitted entry proves whether `merge_group` CI starts; if it does
  not, the entry times out after 60 minutes and is removed, so the path fails closed. Hold that
  automation rather than adding a token or ruleset bypass. Queue preview retention
  (`PREVIEW_QUEUE_RETENTION_ENABLED`) is not enabled. Flaky smoke tests that remove otherwise
  healthy queue entries remain to be fixed.

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
   queue-aware in code, and queue submission does not dispatch main CI. Live proof of job-token
   enqueue and version promotion is pending (above).
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
withdrawals still reach revocation. Skipped source workflows do not allocate control-panel runners.
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
from an independent write collaborator, or a write collaborator's single-line command:

```text
/approve-sensitive <40-character-reviewed-PR-head-SHA>
```

Agents may record that command only after receiving the specific merge authority required by
`AGENTS.md`; admission never supplies authorization itself. Changed heads invalidate approval.
Queue admission re-proves the member PR, live queue ref, current-main parent and single-entry
squash `ALLGREEN` configuration. A squash queue commit has current main as its only parent and is
exactly one commit ahead of it; it does not contain the PR head as an ancestor, so GitHub's queue
entry (exact PR head and exact queue commit) is the PR binding. Configuration is re-proved from
the one repository-owned effective main queue rule through the public REST branch-rules endpoint;
this removes GraphQL queue configuration reads without broadening job/App permissions.
Missing, ambiguous, foreign or changed queue policy fails closed. Read-only signal workflows cannot publish approval. Consumers authenticate
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
provider-suite signals keep unique groups. Two coarse prefilters keep follow-on controllers off
the shared queues: Release Promotion Queue skips Review Admission runs whose display-only
`run-name` names an ordinary branch (`wip/release-*`, queue refs, `unscoped` and pre-locator
titles still wake it; provider-suite admissions stay `unscoped` because their signal runs on
`main`), and PR Controls skips CI runs that are not `pull_request`/`merge_group`
and Preview State runs that are not dispatches, which the target resolver maps to no PR anyway.
Neither title nor event is evidence; every retained run is authenticated as before.

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
60-minute response bound; integration is still full CI plus an anonymous deployed preview.

### Review and preview controls

`PR Controls` maintains one TarkovTracker comment per PR. The panel shows the full current
commit, CI/preview/admission results, a verified preview link when available, and its latest
request result. Its four checkboxes attest to review of that commit, revoke that attestation,
enable automatic PR previews, or stop them. The bot resets the checkbox and updates the same comment.
Presentation lives in `scripts/ci/pr-control-policy.mjs` so branding and copy can change without
adding action types. Passive refreshes write only when the displayed state changes.

Completed-workflow refreshes are coalesced **per PR before publication** on the first attempt of each
controls run by the caller job in
[`pr-controls.yml`](../.github/workflows/pr-controls.yml). GitHub's
[single-pending concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency)
keeps the active invocation and replaces older waiting refreshes with the newest one. The active
invocation includes time waiting for the shared publication lock and is never cancelled. Each PR
can therefore contribute one passive publisher to that queue and retain one pending refresh outside
it. Superseded waiting refreshes show as cancelled; they never start a publisher runner or use its
credentials. Target-selection jobs still run, and there is no additional preflight runner/API pass.

PR lifecycle events (including `synchronize`), checkbox edits, structured dispatches, and controls
reruns retain separate invocations. A rejected rerun must not displace a valid pending refresh.
A synchronize event can invalidate an attestation even after returning to a previous commit, so it
must not be coalesced with an ordinary refresh. Review Admission keeps its
existing queue. The reusable
[`publisher`](../.github/workflows/pr-controls-publish.yml) requires the original caller on `main`,
keeps the protected environment, and shares the same non-cancelling `queue: max` publication lock.
It rereads live head, role, journal and intent before publication. Caller run identity, receipt names,
App scope, and the dispatch interface remain unchanged.

The baseline and rollout measurements are tracked in [#1277](https://github.com/tarkovtracker-org/TarkovTracker/issues/1277).
The workflow-driven burst regression models 40 simultaneous refreshes for each of two PRs: four
publisher invocations survive instead of 80, while every explicit/lifecycle event survives. This is
a scheduling model, not a live latency measurement. Before closing the issue, collect a bounded live
burst after the merged workflow activates: compare selector/publisher counts, time waiting for the
publication lock, runner time and avoided publisher API work. Verify that an interleaved legitimate
operation and current-head/revocation checks still succeed; preserve the existing CI and deployed
preview gates. Candidate CI never receives the protected publisher credential.

An **admin review attestation** is an explicit alternative to completed provider/non-author human
review, including when the admin authored the PR. It applies to one exact commit and does not
assert that an independent reviewer completed a review. It never resolves findings, dismisses
changes requested, approves a sensitive change, or skips CI, preview, native queue integration,
or the App-pinned admission gate. Existing provider and non-author human reviews keep priority.
Sensitive changes still need their separate exact-head collaborator approval.

The action author is the authenticated **editor/event sender**, not the bot that owns the comment
and not `author_association`. Approval/revocation requires current repository `admin`; preview
and structured `recheck` require `maintain` or `admin`. The handler rechecks role and head after
receipt upload. Only one exact unchecked-to-checked transition is accepted; any other text edit,
copied comment ID, stale body/revision/head, old queued operation, or workflow rerun is rejected.
Bot edits do not trigger another operation. New commits and lost admin access invalidate the
attestation; a revoke clears it and fails PR/queue admission statuses synchronously. Missing or
expired newest state fails closed, without falling back to an older approval. When recovery
confirms receipt loss, the App fails native PR/queue admission before panel reads or artifact
preparation/upload, so a later storage or presentation failure cannot leave stale green admission.

Agents use structured dispatch and receipts, without reading or posting conversation commands:

```sh
gh workflow run pr-controls.yml --ref main \
  -f pull_request=1234 -f operation=approve-review -f expected_head=FULL_40_CHARACTER_HEAD_SHA
```

Operations are `recheck`, `approve-review`, `revoke-review`, `preview-enable`, and `preview-stop`. Fetch the dispatched
run's immutable `pr-controls-<PR>` artifact and read `state.json`: `operationResult.status` is
`accepted` or `rejected`. Accepted results bind the requested head, actor, and run; rejected results
record the observed current head, run, and rejection reason, without attesting to the submitted actor/head.
Acceptance records authorization and intent; successful execution still requires the control job
and the actual admission/preview receipts. A rejected operation fails the
run after retaining its receipt. Approval/revocation dispatches the existing admission workflow;
its successful exact-head receipt remains required before enqueue. Enable/Stop records persistent
PR preview intent and wakes the existing Preview State controller on `main`. That controller
selects successful current-head CI and the matching artifact before dispatching Preview. The
control does not bypass fork protections, artifact checks, or the final pre-upload revalidation.
There is no production deployment operation.

The controls job explicitly declares Actions write (dispatch existing workflows) and Pull requests
write (maintain its PR comment), with Contents, Checks, Issues, and Statuses read. The existing
admission job has Actions read and Issues read; the existing preview-request job has Actions
write, Pull requests write, and Issues read. The controls job receives these grants explicitly.
Preview Request and the Preview deployment job additionally need Statuses read to authenticate
the App-owned intent pointer; Preview State and Preview planning already have Statuses write.
The public App identity variables are passed to those readers; no App key reaches preview jobs.
The dedicated App retains statuses write and metadata read, the selected-repository installation,
no webhook, and the main-only `review-admission` environment. Its controls publisher may write
success only to its fixed journal context and failure only to `Review Admission`. It cannot
grant native admission. Workflow/permission/policy activation requires an explicitly approved merge.

Durable state uses an immutable Actions artifact plus an App-owned `TarkovTracker Controls #<PR>`
status pointer on fixed trusted commit `44d4462c3db34b60e7cca69450405c922af15f56`. That anchor is a
journal location, not a required check or current main. Keeping it fixed preserves revocation
ordering across head/main changes. Readers verify issuer, source workflow/main history, first
attempt, repository, PR, head, official comment ID, and the current admin role. The newest pointer
is authoritative; an unavailable artifact can recover only the official comment ID and an empty
grant. A fresh explicit attestation is then needed. Receipts retain for 90 days and ordinary
meaningful refreshes renew state; expiration never reactivates an older approval.

Roll out only after exact-head checks and independent review, with an explicitly approved merge.
Then exercise a docs-only canary: structured recheck, forged/copied panel rejection, real admin
checkbox approval, revoke, stale/rerun rejection, new-head invalidation, preview N/A, and a normal
preview requiring CI/artifact/fork trust. Exercise Enable across a new commit, Stop before
upload, stop/re-enable with the same panel ID, live role loss, and interleaved legacy commands. Record control and admission receipts, not only green
runs. To roll back, stop using attestations and revert this feature; provider/human review and
existing preview entry points remain available. Keep the current rulesets and retention settings
unchanged while commissioning this control surface.

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
5. Open. Exercise the bot-token enqueue path and version-promotion staging path; queue submission must
   produce merge-group CI without manual workflow approval, and release preparation must not tag.
   Keep any unproven automation gate held rather than adding token/ruleset bypasses.
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
required independent review. For queue-required main, it uses a trusted checkout of main and submits with:

```sh
node scripts/ci/enqueue-pr-cli.mjs tarkovtracker-org/TarkovTracker <PR> <reviewed-head>
```

The helper pins the native enqueue mutation to the reviewed head and validates the returned
entry. A queue entry proves submission; report a merge only after observing it. Do not update a
behind branch merely for freshness. If admission checks are still pending, leave a handoff
rather than looping on `gh pr checks --watch` or reviewing an unchanged diff again. Native enqueue
does not require the repository auto-merge setting.

The PR handoff records: reviewed head, findings/review state, validation evidence, queue entry
or blocking check, branch/worktree, and next command. Report **QUEUED**, not MERGED. End the agent
turn immediately; Actions owns CI, previews and the merge wait. Resume only for a failure that
needs a code decision, a new review finding, or an explicit follow-up request. On resumption read
the handoff and changed evidence, not the entire previous review. Provider cache retention and
billing are outside GitHub's control; no cache or token saving is guaranteed.

GitHub queue guidance: <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue>.

The journal reader selects one named GraphQL status context; it does not scan the shared anchor's
history. Each PR has a 900-write budget, below GitHub's 1,000-status SHA/context limit. The final
reserved revision clears any admin approval and fails native admission when invalidating that
attestation. It removes the action checkboxes
and disables further control writes for that PR. It also records a preview Stop. A typical
revision consumes a write only when an explicit request or the displayed head/gates/result changes;
unchanged passive refreshes do not consume capacity. The panel is advisory, so reaching this
capacity does not prevent provider/human review or normal queue operation. A fresh authorized
`/preview` posted after that Stop can resume previews, even after the terminal receipt expires.
The reader keeps the trusted pointer timestamp as a stop barrier and never resets the counter
or revives old grants. If the terminal comment update fails, passive refreshes may repair that
one comment without writing another journal status. Manual preview workflows also remain available. This explicit capacity
limit avoids a journal rollover system.
A controls-origin native revocation status binds the PR number and is also a durable barrier: even if the journal-pointer
write fails, later admission rechecks cannot revive a grant older than that revocation run.

Receipt helpers run in Ubuntu/WSL and require Node and `unzip`; workflow tests also use Python 3.
The bounded `unzip` reader was extracted from the existing admission binding without adding a
package installation to credential-bearing jobs. Controls jobs explicitly check the prerequisite.

Enable/Stop and the existing `/preview` and `/preview stop` commands share one ordered
authorization timeline. Server-created run/comment timestamps order the sources; control run
numbers or comment IDs order ties within a source, and a cross-source timestamp tie favors Stop.
Repeated Enable preserves the oldest uninterrupted grant. A deployment binds both the official
comment ID and that grant’s control run ID, so Stop/re-enable cannot resurrect an older queued
deployment even though the panel ID stays the same. Enables require live maintain/admin access;
an accepted Stop remains a revocation barrier after role loss. These controls affect PR previews;
required merge-group previews and explicitly authorized manual previews retain their own rules.
