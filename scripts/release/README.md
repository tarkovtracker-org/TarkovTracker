# scripts/release/

Release automation. [`.releaserc.json`](../../.releaserc.json) loads the plugins and
[`release.yml`](../../.github/workflows/release.yml) runs the gate and recovery. See the releases
section of [`docs/workflow-automation.md`](../../docs/workflow-automation.md).

| File                        | What it does                                                                       | Run by               |
| --------------------------- | ---------------------------------------------------------------------------------- | -------------------- |
| `release-scope.mjs`         | Which commit scopes are internal and excluded from releases and notes.             | `.releaserc.json`    |
| `release-commit.mjs`        | semantic-release plugin that prepares the version commit.                          | `.releaserc.json`    |
| `release-commit.sh`         | Stages that commit with CI/preview and opens its immutable version PR.             | `release-commit.mjs` |
| `release-gate.mjs`          | Gates scheduled publication seven days after any stable release; permits dispatch. | `release.yml`        |
| `release-recovery.mjs`      | Resumes a release that stopped partway, using published release assets.            | `release.yml`        |
| `release-notifications.mjs` | Comments on and labels each merged PR once its stable release is published.        | `release.yml`        |
| `release-highlights.mjs`    | Builds player-facing highlights from each PR's `## Release note` section.          | `release-scope.mjs`  |
| `release-note-state.mjs`    | In-process proof that the prepare step succeeded before notes are written.         | `release-commit.mjs` |
| `*.test.mjs`                | Vitest unit and integration tests for the files above.                             | `pnpm run test`      |

## Queue promotion

Release now has two phases. `release-run.mjs` runs semantic-release preparation, explicitly
validates the immutable staging head, and creates a version-only PR. It exits successfully
without tags, publication, queue submission, or a review/queue wait. Normal review admission and
GitHub's protected merge queue own the merge. `release-promotion-queue.yml` consumes completed
trusted Review Admission or preparation runs, verifies run-owned receipts and the current reviewed
head, and submits the unchanged generated PR through normal protected merging. Already queued,
closed, superseded and queue-integration receipts are skipped. Only an observed actual merge can
dispatch main CI; queue submission is reported as QUEUED and never waits inside a workflow. Release explicitly dispatches trusted main Review
Admission for the created PR because job-token PR events can be suppressed or need approval. A
trigger failure reports a retry command; it never counts as approval and cannot authorize publication. The successful preparation run retains
`release-promotion-<candidate-sha>` proof; PR body text cannot substitute for it.

Admission wakeups authenticate the source workflow and attempt before reading its receipt, then
prove the receipt's `workflowSourceSha` belongs to main history before reading a PR. The event's
run SHA may identify an unmerged candidate, especially for `pull_request_target`; it is not the
policy checkout SHA. Preparation wakeups still prove their main run SHA before reading artifacts.

Successful trusted main CI completion immediately wakes finalization of a pending merged version;
schedule/dispatch also recover pending publication. CI callbacks never start new preparation or
change publication cadence.
`release-promotion.mjs` authenticates the bot-created same-repository PR, trusted preparation
attempt, generated assets, candidate validation and review admission. The actual merged SHA
must have the original source as its only parent and the candidate's exact tree. Release then
explicitly validates a preview of that merged SHA, rechecks all evidence and publishes/tag-recovers
idempotently. GitHub-only sanitized PR highlights come from the preparation process's authorized
second notes pass and its run-owned receipt; they never enter `CHANGELOG.md`. Legacy interrupted
direct-push recovery continues to use changelog-only notes. Existing release tags are never moved. Open promotion PRs suppress duplicate
preparation. No direct main push or bypass actor is used.

### Recovery when main or the queue interleaves changes

Publication fails closed if the source, tree or current-main identity changes. It never tags
interleaved commits that were absent from the prepared release notes. Do not update the original
version PR head or try to force a tag. Before enqueue, current main must still equal the verified candidate source; queue group admission
checks the same parent invariant. An ordinary scheduled/dispatched run can close and regenerate
only an authenticated, unchanged, unpublished, unqueued stale generated PR whose source is a
proven main ancestor. It retains branch history and records a handoff. Concurrent head changes
are reopened and held. CI callbacks never close snapshots or prepare replacements; edited, tagged
or uncertain evidence stays held for operator investigation.

If notes generation or receipt upload fails after opening the candidate PR, the next ordinary
validated schedule/dispatch can close and replace that orphan. This requires its exact trusted
main preparation attempt to have completed with failure/cancellation, an unchanged generated-only
candidate with successful CI/preview, a source equal to or ancestral to current validated main,
and no queue entry, tag or publication. Branch history and the handoff remain; a concurrent head
edit reopens and holds the PR. Running attempts stay held. Failed/missing receipts never authorize
enqueue or publication, and CI completion callbacks never perform this recovery.

If the stale version PR already merged, prepare a reviewed rollback of its unpublished generated
assets first. On a clean, dedicated topic branch from freshly fetched main, run:

```sh
node scripts/release/release-promotion-recovery.mjs tarkovtracker-org/TarkovTracker <version-PR>
```

Run this read-only GitHub observer from the repository root. It writes only local `package.json`
and `CHANGELOG.md`; it cannot commit, push, merge, mutate production, or publish. It authenticates
the preparation/source and requires no existing release tag, the promotion in main's ancestry, unchanged promoted version
and unchanged generated changelog. It restores only the previous version field/history while
preserving newer manifest fields. Any inconsistent evidence requires operator investigation.
Validate and review that rollback diff, merge its PR through normal admission, then dispatch
Release from fresh validated main so semantic-release includes all commits since the previous
tag. Missing/expired candidate CI or preview evidence must be regenerated on that exact immutable
candidate before recovery; never relax the checks. A rollback of published/tagged assets is rejected.
