# Pull-request previews

Part of the [systems spec](./README.md): summary, flow, files, and invariants per system.

## Actions-owned Cloudflare previews

Open, ready ordinary same-repository PRs targeting main request a preview after successful
current PR CI, without a command or merge intent. `ready_for_review` and `reopened` reuse
already-passed current CI; they do not request another build. Drafts pause and `/preview stop`
revokes automatic readiness until a fresh maintainer `/preview`. Forks retain their command
or protected environment approval gates. Dependabot, Crowdin and release staging retain
their dedicated owners; non-deployable paths still skip deployment. The state
workflow handles CI completion and metadata events; ordinary pushes wait for CI. Before CI
finishes the status may be absent, or pending if a metadata event has already run. Main-push
CI completions do not start a state job. The deployment workflow remains dispatch-only.
Queued, running, and approval-waiting requests from the trusted `main` preview workflow are
reused when their run ID and continuous command grant match and they were created after that CI
attempt completed; completed failed or cancelled requests can be retried. A stop followed by an
enable gets a fresh dispatch binding, so revoked work cannot suppress the resumed preview.
State events serialize within their concurrency group instead of cancelling a dispatching job.
Manual commands use the same active-run lookup. Repeating an enable command preserves a still-live
original grant; any accepted stop after that grant revokes it even after another enable command.
Readiness requires no live manual command in both planning and upload verification. A stop followed
by a fresh enable therefore cannot revive a queued readiness run; the new bound command resumes it.
Accepted original commands are collapsed with GraphQL `minimizeComment` (`RESOLVED`), using
their original node ID. They are never edited or deleted. Body-edit metadata continues to authorize
collapsed commands; stop receipts remain visible, immutable revocation evidence. Minimization
failures are cosmetic. Readiness creates no comment.

**Summary.** Pull requests and eligible non-main dispatches do not rely on Cloudflare's
automatic Git previews. The candidate `Validate` job builds the actual Pages output once with the
anonymous preview profile (`scripts/preview/profile.mjs`), records a versioned manifest
(`scripts/preview/manifest.mjs`, `scripts/preview/write-manifest.mjs`) inside the output, and
uploads it as the `pages-preview` artifact (seven-day retention). Main pushes keep the production
configuration. The trusted controller in `.github/workflows/preview.yml`
(`scripts/preview/controller.mjs`, `scripts/preview/github-api.mjs`, `scripts/preview/archive.mjs`)
loads from the default branch, resolves the candidate through the GitHub API, requires successful
`CI Result` and current revision evidence, verifies every manifest claim and the recomputed content
digest, uploads the verified output with pinned Wrangler to the existing `tarkovtracker` Pages
project's preview environment under a generated `preview-*` branch, verifies the deployment record
(`scripts/preview/deployment.mjs`, `scripts/preview/verify-deployment.mjs`), runs the Playwright
smoke suite (`scripts/preview/smoke/preview.smoke.mjs`) without Cloudflare credentials, and
publishes the authoritative `Preview Result` commit status. Downstream consumers (the release
gate and interrupted-release recovery) must not trust the status in isolation: commit statuses
are forgeable by write collaborators, so the evidence binds to the controller run behind its
`target_url`. That run must report path `.github/workflows/preview.yml`, event
`workflow_dispatch`, branch `main`, and this repository; its `Publish preview result` job must
succeed and it must retain a `preview-deployment-<sha>` artifact for the exact candidate.

Cloudflare Pages serves prerendered public documents and finite client shells outside the Pages Function routes, so runtime route
rules alone cannot provide browser response headers for those documents. Keep the static
`public/_headers` frame-ancestor policy in the uploaded build output alongside the runtime app
CSP; `frame-src` remains an independent directive for permitted embedded content. The build-time
check requires the `/*` block to set a same-origin `frame-ancestors` and rejects any block that
widens it, because Pages applies every matching block.

### Flow

```text
PR update → CI (selected validation + security + preview build + manifest + artifact)
          → CI Result succeeds
          → Preview State (workflow_run / pull_request_target) publishes pending
          → auto-merge intent, maintainer `/preview`, or trusted merge automation requests Preview
            for the validated PR CI run and attempt
          → ready PR + current head/base/test-merge + attempt + artifact claims verified
          → environment `preview` or `preview-fork` (maintainer approval for forks)
          → recheck → wrangler pages deploy --branch preview-* → deployment record verified
          → smoke tests on the unique deployment URL (5-minute startup window)
          → freshness recheck → Preview Result success [preview <digest12> v<profile>]
```

### Result contract

| Situation                                                          | `Preview Result`                           |
| ------------------------------------------------------------------ | ------------------------------------------ |
| Validation running, deployable draft, fork awaiting approval       | pending, with reason                       |
| Preview-required PR has successful CI but no dispatch yet          | pending, waiting for a maintainer request  |
| Successful CI and a change set with no deployable paths            | success: not applicable                    |
| Current deployment and smoke tests succeed                         | success, with digest/profile marker        |
| Validation, artifact verification, deployment, or smoke tests fail | failure                                    |
| Revision or attempt becomes obsolete                               | no success is published for that candidate |

Statuses target only the validated head SHA, for pull requests and standalone branch previews
alike, so GitHub shows one required result. They never target the controller's default-branch SHA
or the test-merge commit: GitHub regenerates a PR's test-merge commit (new SHA, same parents and
tree) when a merge is attempted, which dropped test-merge statuses and blocked every merge. The
ruleset's strict freshness requires the head to contain current main at merge time, so a
head-bound result cannot merge against a stale base. The status links to the controller run summary, which
records action, revision, digest, deployment URL, and validation-to-preview duration.
Artifact claims still bind to the test merge. When GitHub has not computed it yet, the controller
retries and leaves the required result pending. A regenerated test merge is the same candidate only
when both commits have the current base and head as parents and identical trees. A dispatched branch
build associated with a PR can satisfy that PR only if its Git tree matches the test-merge tree
and its base is current main, including when the change set has no deployable paths. The comparison is
repeated before deployment and final success. An hourly state-only reconciliation re-evaluates a head
with no result, or whose latest result is pending only because the test merge was not ready, once
GitHub has computed the test merge; other pending reasons are left alone.

### Invariants

- Candidate builds receive no deployment credentials. The controller never checks out, installs,
  or executes candidate code and never consumes candidate Wrangler configuration; the uploader
  discovers `wrangler.toml` from the default-branch checkout at the repository root, uses a fixed
  project name and generated `preview-*` branch, and rejects the configured production branch at
  every layer.
- Every manifest field is a claim: repository, pull request, head SHA, base SHA, checked-out
  test-merge SHA, tree SHA, run id, run attempt, build-profile version, preview branch, app URL,
  and digest are compared with live GitHub state and the recomputed digest before planning and
  again immediately before upload. A superseded attempt, moved head, moved base, or test merge
  with different parents or tree cannot deploy, and a late success is not published for an obsolete
  candidate. A regenerated test merge with the same parents and tree is the same candidate.
- Automatic state refresh uses the latest CI run for the candidate head and branch. A delayed
  completion from an older run does not overwrite the current preview status, including for forks.
- Archives are parsed from the central directory before extraction; symbolic links, special
  files, traversal, absolute paths, duplicates, encryption, and checksum mismatches are rejected.
- Successful deployments are deduplicated by revision, artifact digest, and profile version through
  the status marker. Before `ready_for_review` reuses a result, the controller authenticates the
  original run and its exact-SHA deployment artifact, then keeps that run URL on the new success.
- Pull-request and CI-completion events run only the trusted `preview-state.yml` workflow, so
  ordinary PRs do not instantiate skipped deployment or smoke-test jobs. These events and comment
  events never upload to Cloudflare. An exact, unedited `/preview` comment from a current repository
  maintainer or administrator opts that PR into automatic previews, including forks; `/preview stop`
  disables the opt-in. The controller uses GraphQL `lastEditedAt` to detect body edits; REST
  `updated_at` can change for metadata updates and does not by itself invalidate a command. Missing
  edit metadata or inconsistent REST/GraphQL comment snapshots fail closed. Commands predating the rollout activation instant cannot become
  persistent grants. The instant defaults to the contract start shipped with the handler commit,
  so no manual post-merge variable flip is required. The optional canonical UTC
  `PREVIEW_OPT_IN_START` variable overrides it; any non-empty malformed value (the legacy `0`,
  date-only, zone-less or impossible strings) fails closed and grants no persistent access — an
  explicit off switch.
  The request resolves matching successful CI before dispatching the trusted controller. Only a trusted
  `workflow_dispatch` from `main` can deploy, and it repeats the exact-SHA, CI, artifact, and
  freshness checks. Crowdin and release staging dispatch once after their own exact-SHA CI passes;
  allowlisted Dependabot auto-merge candidates dispatch from a trusted post-CI `workflow_run` after
  all checks pass. Dependabot's dedicated workflow remains its sole automatic request owner.
  Ordinary same-repository PR CI completions request deployment when ready, while a live command
  still opts in fork PRs or auto-merge requests their protected approval path;
  a stop overrides either path. Opted-in drafts remain paused until `ready_for_review`.
  Metadata refresh also covers reopening. The
  hourly reconciliation remains status-only. Cloudflare automatic preview builds are disabled while production Git
  deployments for `main` remain enabled.
- The Pages-only deployment token is stored only in the protected `preview` and `preview-fork`
  environments, whose branch policy allows `main`; remove the repository-scoped copy. This prevents
  a manually dispatched workflow selected from another ref from reading the deployment credential.
- Fork candidates with a live maintainer command deploy through `preview`; the controller exhausts
  comment pagination, chooses the latest authorized command, and rechecks the requester's current
  role. GitHub's owner/member/collaborator association filters public outsider comments before any
  role lookup; it never substitutes for the current maintain/admin permission check. Permissions
  are cached only within one scan. Immediately before upload, the command must still be enabled
  with the same ID and author. A newer enable command does not supersede an original live grant;
  an intervening accepted stop always does.
  A newer associated user's stop remains a revocation barrier after a role change when its author
  currently verifies as maintain/admin or when the handler accepted it while verifying — the
  receipt comment from `github-actions[bot]` records that acceptance; a historical stop without
  either is not honored and the previous enabled opt-in stays in control. Resuming requires a
  fresh command from a current maintainer.
  Automatic dispatches carry the authorizing comment ID, so a command revoked before planning
  cannot fall back to the manual deployment path. Trusted default-branch dispatches without a
  bound comment (manual or automation-owned) own their authorization directly and are not revoked
  by a later stop.
  Readiness dispatches instead carry `authorization=readiness` and the selected `ci_attempt`.
  Immediately before upload the controller rechecks the stop barrier, open/non-draft status,
  same repository, exact planned head/base, current main, latest successful PR CI and its
  attempt-specific `CI Result` job. Readiness cannot fall back to independent dispatch authority.
  GitHub can suppress metadata events generated by `GITHUB_TOKEN`; automation must retain its
  existing explicit trusted dispatch fallback. No new credentials are needed.
  A stop, deleted command, or revoked role prevents a queued opted-in upload. Each revision still
  requires fresh CI, manifest and digest verification, and smoke tests; the command grants preview
  intent for the PR, never a reusable CI result. Forks without a live opt-in deploy through
  `preview-fork`, where manual approval or an administrator override is required. Its self-review
  rule stays enabled. The exact revision is displayed before approval and rechecked afterward.
  Fork CI runs carry no `pull_requests` and the base repository's commit-association lookup omits
  fork-only commits, so a fork candidate's PR is resolved by listing open PRs for its
  `owner:branch` head and then matching head SHA, head repository, and base like any candidate.
- The Pages preview environment has no production KV or Durable Object bindings and empty Supabase,
  analytics, Turnstile, Stripe, and log-forwarding values; the anonymous build sets `APP_URL` to the
  controlled branch alias so host trust covers the unique deployment URL, and the app's offline
  Supabase fallback activates on `pages.dev`. Public game data still flows through `/api/tarkov/*`.
- Nuxt's Turnstile key-pair validation runs only for production `build`/`generate` commands, not for
  `pnpm install`'s `nuxt prepare`; deployable builds still reject a one-sided key configuration.
- Smoke tests run in a separate credential-free job against the unique deployment URL and require
  the served manifest, usable `/` and `/tasks` content, loaded assets, the anonymous
  `/api/tarkov/cache-meta` shape, nonempty `/api/tarkov/bootstrap?lang=en` data, and no browser
  requests to Supabase, Stripe, or analytics hosts. Persistent failure blocks merging.
- Reporting failures fail the controller so automation cannot promote the commit. Deployment and
  smoke evidence artifacts are retained for 30 days. An unexpected controller error re-identifies
  the current PR or standalone branch before publishing failure; the CI run's PR base snapshot must
  still match, so an obsolete event cannot turn a newer PR revision red. A `pull_request` CI run
  must carry matching PR, head, and base snapshots to be attributed to the current revision; runs
  without them, notably forks, have no trustworthy run-scoped base, so an unexpected refresh error
  leaves the existing result unchanged. A failure for a planned decision targets that decision's head
  and does not require a computed test merge. Tree equality remains required for a dispatched branch build claiming
  preview success.
- Release staging and recovery read `Preview Result` on the standalone version commit; Crowdin and
  Dependabot read it on their PR's validated head. All still bind deployment evidence
  to the intended head revision ([release publication](./ci-and-release.md#release-validation-and-publication)). Production deployment remains Cloudflare's Git
  integration for `main` and is unchanged.
- The public repository's `pull_request_target` use is confined to `preview-state.yml` by a
  repository-level Actions policy whose event allowlist is exactly `pull_request_target`,
  `workflow_run`, and `schedule` for that workflow path. GitHub enforces its default
  public-repository block of `pull_request_target` from 2026-11-02, so the policy is required
  external state; `docs/workflow-automation.md` records how to recreate it.

Current gates consume `CI Result` and `Preview Result` on the validated head for PRs and
standalone branch candidates. Both come from GitHub
Actions (app id 15368), and waiting automation re-reads them from the API rather than trusting
`target_url` or a payload snapshot. The app id does not authenticate a workflow definition: a
same-repository PR can edit its `pull_request` workflow and request `statuses: write`. The opt-in
shadow below never publishes a merge result; a separate trusted publisher boundary is required
before moving the ordinary preview build out of CI. When an aggregate accepts a job during a
documented compatibility window, the window
applies only to that job's absence; a reported non-success outcome still fails the aggregate, and
the accepting aggregator version ships in the same change that activates the job.

### Opt-in finalization shadow

`.github/workflows/finalization-shadow.yml` is a non-authoritative rehearsal of a late build.
A maintain/admin actor dispatches it from `main` with an open non-draft PR number and its successful
exact-head CI run id. The trusted planner checks the live head/base/test-merge parents and tree,
the CI run's PR snapshot, and the attempt-specific `CI Result` job. Docs-only changes skip build.
The `github-script` handoff passes the repository explicitly because spreading its context drops
the computed `repo` property; missing repository identity fails planning before any build.
Docs-only runs still receive a terminal revision recheck. GitHub's workflow-run API may omit the
PR/base snapshot for fork runs; the shadow rejects those runs until an authenticated historical
base source is available. This does not change the existing approved fork-preview path.
Deployable changes build the test merge in a digest-pinned Node container without repository
write credentials, Actions runtime/cache token, OIDC, deployment secrets, or Docker socket. A
trusted host step rejects links, special files, and oversized output before the artifact uploader
can read it. A separate clean runner treats the candidate build artifact as hostile, safely extracts it, rechecks
the live revision, and seals `pages-preview-shadow` with a digest and versioned manifest. Competing
same-PR dispatches cancel; pushes and base changes invalidate the old request. The shadow neither
deploys nor publishes required statuses. Ordinary CI still builds/uploads `pages-preview`.

### Efficiency evidence

The optional `benchmark` tests in `scripts/workflow-tests/preview.mjs` and
`scripts/workflow-tests/preview-request.mjs` compare this controller with a main-branch snapshot
provided through `PREVIEW_BASELINE_ROOT`. Against main `1fe5b00`, 20 repeat commands after the
initial request produced 21 dispatches before versus one after; both requested zero extra CI
builds. A ready-with-passed-CI event required a later command before, and requests its preview
directly after. This removes the agent's wait-for-CI-then-command step; status observation remains.

The mock API count increases from 189 to 274 across those 21 commands, and from 10 to 18 for
one ready event, including the new exact-attempt checks and existing active-run lookup.
Command minimization adds one cosmetic GraphQL mutation per accepted command. In 20 local
Linux/Node 24 samples, median ready-controller overhead was below one millisecond in both
versions (main 0.655 ms, candidate 0.506 ms in the final recorded sample); mock calls exclude network latency. These counts
demonstrate fewer dispatches and commands for sequential events after an active run is visible,
not exactly-once delivery, elapsed CI or token savings. Actions event
delivery and run-list visibility can still race; concurrency and upload freshness checks remain
the final controls. A post-merge canary is needed to prove live readiness and comment collapse.
The trusted hourly fallback retains readiness or standing command authorization when a test merge
becomes available later; ordinary synchronize events still wait for current successful CI.

### Files

- `.github/workflows/preview-state.yml` — automatic preview state refresh and opt-in preview dispatch
- `.github/workflows/preview.yml` — explicit trusted controller: plan, deploy, smoke, result jobs
- `.github/workflows/preview-request.yml`, `scripts/preview/comment-request.mjs` — trusted
  maintainer comment request, current CI selection, and dispatch
- `.github/workflows/finalization-shadow.yml`, `scripts/preview/finalization-shadow.mjs`,
  `scripts/preview/shadow-container.sh` — opt-in late-build rehearsal, no deployment or required result
- `.github/workflows/ci.yml` — `Validate` build profile, manifest, `pages-preview` artifact; `security` call
- `.github/workflows/security.yml` — reusable audit/Gitleaks/CodeQL workflow plus weekly schedule
- `scripts/preview/profile.mjs` — project identity, branch alias derivation, anonymous build env
- `scripts/preview/build-profile.mjs` — candidate-side profile selection for the single build step
- `scripts/preview/manifest.mjs`, `scripts/preview/write-manifest.mjs` — digest and manifest
- `scripts/preview/controller.mjs`, `scripts/preview/github-api.mjs`, `scripts/preview/archive.mjs` — verification and reporting
- `scripts/preview/deployment.mjs`, `scripts/preview/verify-deployment.mjs` — deployment record evidence
- `scripts/preview/smoke/preview.smoke.mjs`, `scripts/preview/smoke/readiness.mjs` — smoke suite
- `scripts/ci/github-ci-gate.sh`, `scripts/release/release-recovery.mjs` — dual-gate waits for automation
- `wrangler.toml` — isolated `[env.preview.vars]`
- `scripts/workflow-tests/preview.mjs`, `scripts/workflow-tests/preview-workflow.mjs`, `scripts/workflow-tests/security.mjs` — regression tests
