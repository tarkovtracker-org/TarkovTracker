# Agent and CI shadow-rollout handoff

## PR scope

The PR branch is `codex/agent-ci-shadow`, prepared on main revision `f66b1569`. It contains the agent
policy, manifest-pinned setup, conservative classifier, strict aggregate, baseline collector, and
CodeRabbit's metrics-boundary correction from the original implementation.

Release deduplication is handled separately in [PR #805](https://github.com/tarkovtracker-org/TarkovTracker/pull/805).
This PR leaves release behavior and main-run cancellation unchanged. It preserves the newly merged
Crowdin Sync workflow and its configuration. The original complete implementation remains on local
branch `codex/agent-ci-turnaround`; its alternative release implementation is not part of this PR.

Documentation/translation skips remain disabled by `--shadow`. Every existing CI job stays enabled
while proposed selections and `CI Result` are verified on live PRs. No changes to review-provider
settings, required checks, application APIs, database schema, or deployment integrations are included.

## Validation evidence

The original code was validated against `fb919ca0` and reviewed by CodeRabbit CLI 0.7.5 at `ebe4b2f9`.
The only finding was an empty metrics `--after` argument silently selecting the baseline; it was fixed
and regression-tested. Removing the alternative release implementation leaves 11 focused workflow
tests on this PR branch. The production-readiness pass found no must-fix defects in this scope.

Required checks are recorded against the final PR revision in its description:

- `pnpm run test:workflow`: temporary-repository and mocked pnpm/Corepack tests for classification,
  dirty Git state, aggregation, expected check names, shard/Deno/fork preservation, and metrics input.
- `pnpm run lint`, `pnpm run typecheck`, and `pnpm run format:check`.
- `pnpm run lint:fallow --base origin/main`, `pnpm run i18n:check`, and `pnpm run systems:check`.
- actionlint 1.7.12, shell syntax validation, and `git diff --check`.

The root Vitest/Codecov configuration and Dependabot merge workflow remain unchanged. Application,
Worker, build, and database suites are left to their existing CI jobs. The precompute job reuses the
same setup action; its schedule, permissions, command, and environment remain unchanged.

## Rollout checks

- Demonstrate successful and failing `CI Result` runs on GitHub, plus documentation-only,
  translation-only, mixed, and dependency PR selections before removing shadow mode.
- Confirm actual Dependabot and Codecov failure handling. Local contract tests verify the names and
  existing status-polling code, not GitHub execution.
- Crowdin Sync uses `GITHUB_TOKEN`; its generated PR workflow runs require a repository writer's
  approval under [GitHub's token event behavior](https://docs.github.com/en/actions/concepts/security/github_token).
  Removing translation path exclusions does not remove that platform approval requirement.
- Establish Codex delivery and reliable exclusions before disabling duplicate automatic reviewers.
  Historical application PR #781 and translation PR #748 did not establish Codex delivery or usage
  exclusions. Existing provider settings remain unchanged.
- Read-only inspection returned no classic main-branch protection and only deletion/non-fast-forward
  applied rules. Existing governance is preserved; `CI Result` does not become required automatically.
- Record the actual rollout timestamp, then collect the first 20 subsequent merges. See
  [the historical baseline](ci-turnaround-baseline.md) and
  [the rollout instructions](WORKFLOW_AUTOMATION.md#ci-rollout-and-measurements).
