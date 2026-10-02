# scripts/codex-review/

Requests or waits for a Codex PR review without duplicate posts. Agents use it as described in
[`AGENTS.md`](../../AGENTS.md); never post raw `@codex review` comments instead.

| File                           | What it does                                                      | Run by                   |
| ------------------------------ | ----------------------------------------------------------------- | ------------------------ |
| `codex-review.mjs`             | Command-line entry: `node scripts/codex-review/codex-review.mjs`. | agents, by hand          |
| `codex-review-state.mjs`       | Reads a PR's review state from GitHub.                            | `codex-review.mjs`       |
| `codex-review-lock.mjs`        | Lock so two runs cannot request the same review.                  | `codex-review.mjs`       |
| `codex-review-collapse.mjs`    | Collapses acknowledged or completed review commands.              | `codex-review.mjs`       |
| `codex-review-disposition.mjs` | Verifies explicit dispositions of historical untagged requests.   | `codex-review.mjs`       |
| `*-tests.mjs`                  | `node --test` tests for the files above.                          | `pnpm run test:workflow` |

## Guard behavior

Agents must use `node scripts/codex-review/codex-review.mjs <PR> --wait-seconds 600` to inspect and wait for
reviews. Add `--request` only when authorized to post a review request. Use `--repo owner/name`
when the PR belongs to another repository. Do not post raw `@codex review` comments or issue a
second request because a polling window expired. Batch corrections before requesting a review.
Only observed code-review completion exits successfully; pending, unreviewed, or uncertain status
exits nonzero. A successful exit confirms review completion, not merge readiness.

Authorized `--request` invocations also collapse original review commands after a verified eyes
reaction from `chatgpt-codex-connector[bot]` or explicit matching code-review completion. This
uses GraphQL `minimizeComment` with `RESOLVED` and the original node ID; findings and result
comments remain visible. Summary-only completion with unknown findings does not authorize
cleanup. Cosmetic failures warn without changing guard decisions, locks, quiet periods or
completion evidence. Plain status/wait invocations remain read-only. Add `--collapse-requests`
when authorized to clean up existing manually posted commands while observing status.

After an authorized request's polling window ends, continue this command-cleanup workflow with
`node scripts/codex-review/codex-review.mjs <PR> --collapse-requests --wait-seconds 600`.
Omit `--request`: continuation observes the existing review and collapses commands acknowledged
or completed later without requesting another review. This also covers eligible manually posted
commands, which do not need a wrapper marker. Use plain `--wait-seconds 600` for intentionally
read-only inspection; it does not collapse late acknowledgements or completion.

GitHub's [issue_comment activity types](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#issue_comment)
do not include reactions, so cleanup uses the existing bounded polling loop rather than inventing
a reaction event. Commands posted outside that loop, or acknowledged after it ends, require a
later authorized cleanup invocation. No new background workflow, credential or permission is
added. A per-invocation cache removes repeat cleanup calls after success. The
[cleanup regression benchmark](./codex-review-collapse-tests.mjs)
owns the API budget and local compute measurements. Network latency and token savings are
unmeasured.

The guard checks live PR review evidence, waits for outstanding requests, and reuses completed
code reviews for the current commit. Security-review completion alone is not code-review
completion. A report's top-level security heading or dedicated leading marker identifies a security report; quoted
security headings inside a code review do not exclude that review. Completion requires an exact full commit identity: abbreviated bot evidence is
resolved through GitHub's commit endpoint, and ambiguous or unavailable resolution fails closed.
The PR head, base branch, base SHA, and eligibility are refreshed after collecting evidence;
head or base changes during collection fail closed. Completion reuse only establishes a review
for the head commit. After a base update, review evidence may remain useful for an unchanged diff
under the root review policy, after assessing integration risks. The guard still requires completion
for the exact current head; it does not transfer completion from a pre-update commit. After
retargeting to a different base branch, review the new diff before merging.
A completed code review can contain findings; the normal feedback-resolution gate still applies.
Unknown or unavailable status must be reported as incomplete, never treated as permission to retry.
An unreviewed PR must be quiet for five minutes after creation or its latest
update before requesting, allowing automatic review to start after opening, pushing, or marking ready.
This grace period uses the final PR response's GitHub `Date` header, never the local wall clock;
missing or invalid server time fails closed. Only a literal first-line `@codex review` command
from a GitHub `OWNER`, `MEMBER`, or `COLLABORATOR` association counts as request evidence;
prose mentions, fenced examples, indented code, and outsider markers do not. This trusts GitHub's
association metadata for coordination; it does not grant permission to post a request. Running
bot activity remains authoritative regardless of who triggered it.

Request invocations share a lock and durable intent in the Git common directory across local
worktrees. Repository identity is case-insensitive, including previously saved intents under a
different casing. Intent is saved before posting, so an ambiguous network failure cannot cause the next
invocation to blindly post again. Inspect GitHub and the recorded intent before manual recovery;
agents must not delete the guard state to force another request.

A successful post records GitHub's request timestamp, so request/completion ordering never
compares the local clock with the server clock. When delivery is uncertain, a matching current
commit completion can retire the local intent; absence of that evidence remains pending.
SHA-marked requests for older commits do not block the current commit, while unmarked requests
require a completion of the current commit at or after the request time. Equality is accepted
because GitHub timestamps have second precision and exact-commit completion is reusable;
bot activity still marked running continues to block a new request. A newer summary-only completion
remains unknown even when an earlier explicit result exists for the same SHA; completion does not
establish clean findings, which must be verified from the actual review output.

### Historical untagged requests

An old untagged request can otherwise block every new head (#1038). Disposition is explicit and
separate from requesting a review:

```bash
node scripts/codex-review/codex-review.mjs <PR> \
  --retire-request <original-comment-id> --request-sha <full-request-time-sha> \
  --evidence-run <pull-request-run-id>
```

The guard verifies an unchanged trusted command, with GraphQL `lastEditedAt: null` to reject commands
edited into place after creation (REST `updated_at` can change for reactions), authenticated later formal code-review completion
for that exact SHA, and a same-repository PR Actions run created before the command. It exhausts
run pagination for the interval between that run and the command without a branch filter, so branch
renames cannot hide evidence. Another PR head or a different-head run with missing PR association
fails closed; an explicitly identified unrelated PR does not block disposition. This does not support fork requests or infer
a SHA from commit author dates. It cannot run with `--request`.

A mode-0600 receipt in the Git common directory records the command ID, original body hash/time,
SHA and run ID. Subsequent observations revalidate the GitHub evidence; editing or deleting the
command invalidates the receipt. No GitHub evidence is edited or removed. The receipt scopes only
that historical request, never establishes current-head completion, and leaves current pending
requests, intents and running activity authoritative. After successful disposition, use the normal
separate guarded request command for the new head.

The helper recovers a request lock only when complete owner metadata identifies this host and
a PID confirmed dead (`ESRCH`). Live PIDs, permission errors, foreign hosts, missing or malformed
metadata, and an interrupted recovery remain blocked. Lock age never authorizes removal.
For a lock left between directory creation and metadata writing (or an interrupted recovery),
an operator must inspect the lock, running processes and GitHub request evidence, ensure no
request invocation can run concurrently, and remove only the confirmed orphaned lock directory
or its `.recovery` sibling. Preserve all intent files and rerun read-only inspection before an
authorized request. Agents must report this condition for operator recovery rather than deleting
uncertain state themselves.

This is a cooperative agent guard, not a GitHub-wide restriction: unrelated clones, other machines,
and callers that bypass the helper do not share the local lock. Existing GitHub requests are still
checked, but GitHub comment creation has no atomic deduplication key. A server-side single request
owner would be needed to eliminate that cross-machine race. The helper itself neither merges PRs
nor resolves findings.

GitHub also offers no atomic head condition on comment creation: a push after the final PR read
can race the POST. The request marker records the observed head; it does not pin the revision the
bot ultimately reviews. Always inspect fresh exact-head completion and checks before merging.
