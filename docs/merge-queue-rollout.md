# Merge queue operations

## Current state

Main requires the native squash queue. The active ruleset `25157234` requires `CI Result` and
`Preview Result` from GitHub Actions (`15368`), plus `Review Admission` from its dedicated App
(`5328610`). It uses `ALLGREEN`, one entry at a time, a 60-minute response timeout, resolved
review threads and no bypass actors. Main ruleset `11256377` still protects deletion and
non-fast-forwards. Strict freshness ruleset `23539975` is disabled, so the policy is `queue`.

The [disabled queue template](../.github/main-merge-queue-ruleset.json) and
[strict freshness template](../.github/main-ci-ruleset.json) are references. Committing them
does not update GitHub. [Preview retention](systems/previews.md#queue-preview-retention) has its
own dry-run and activation controls.

### Rollback

With explicit authorization, restore strict freshness before changing the queue or retention.
Read back the live rulesets and verify `strict-queue` before proceeding. Keep equivalent required
checks active at every step.

```sh
gh api -X PUT repos/tarkovtracker-org/TarkovTracker/rulesets/23539975 -f enforcement=active
```

## Review Admission

Trusted main verifies the current PR head and its native queue integration separately. Completed
exact-head CodeRabbit/Cubic evidence, an independent collaborator review, or a valid admin
attestation can admit an ordinary PR. Sensitive changes also need exact-head approval.
Unresolved findings or threads, changes requested, drafts and closed PRs hold admission.
A green provider check alone is insufficient. Scope and provider provenance are enforced in
[`review-admission-policy.mjs`](../scripts/ci/review-admission-policy.mjs).

A policy hold publishes failure on the head and live queue commit while the controller run can
succeed. Integrity, identity and API failures fail the run. Consumers require the successful
App-pinned status, trusted source run and authenticated receipt. Approval edits or deletions
and relevant provider changes re-evaluate live evidence. Obsolete signals cannot authorize a
replacement head or queue entry. [CI and release](systems/ci-and-release.md) owns release promotion
and CI provenance.

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

## Admission publisher provisioning

Generic GitHub Actions identity cannot secure native queue admission: a candidate
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

The scoped App submits native queue entries because the job token cannot start merge-group CI. The registration
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

## Agent lifecycle after activation

Follow [AGENTS.md](../AGENTS.md) for merge authority and review. For an authorized merge, submit
the reviewed SHA using head-pinned auto-merge. For a head with green admission, trusted main can
submit directly through the enqueue helper.

```sh
gh pr merge <PR> --auto --match-head-commit <reviewed-head>
node scripts/ci/enqueue-pr-cli.mjs tarkovtracker-org/TarkovTracker <PR> <reviewed-head>
```

GitHub queues the head after required contexts and threads pass, then checks the queue commit
before squash merge. Keep a behind branch unchanged unless there is a separate reason to update
it. A changed head requires fresh admission. Report the reviewed SHA, findings, validation and
queue state or blocker. Report `QUEUED` for an observed queue entry and `AUTO-MERGE ON` for a
pending auto-merge request. Actions owns the remaining checks.

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

The queue admission exception is limited to verified same-repository `locales` → `main` changes
from the Actions bot, with a complete immutable diff of permitted non-English locale blobs and a
head-owned trusted Crowdin validation receipt. It does not bypass findings, threads, sensitive
approval, CI, preview or queue integration. [CI and release](systems/ci-and-release.md#crowdin-automatic-merges)
owns submission, retry and rollback.
