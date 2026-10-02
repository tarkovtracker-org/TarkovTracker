# scripts/ci/

CI job planning, result gates, and GitHub automation helpers used by the workflows in
[`.github/workflows/`](../../.github/workflows/).

| File                          | What it does                                                               | Run by                                            |
| ----------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------- |
| `validate-changes.mjs`        | Decides which CI jobs a change needs and runs them locally or in CI.       | `validate:changes`, `ci.yml`                      |
| `validation-plan.mjs`         | Rules mapping changed files to CI jobs; aggregates job results.            | `validate-changes.mjs`, `preview/`                |
| `validation-tools.mjs`        | Resolves trusted absolute paths for `git` and `pnpm`.                      | `validate-changes.mjs`, `preview/`                |
| `change-brief.mjs`            | Pre-edit brief: consumers, owning docs, scoped rules, tests, checks.       | `brief`; see `workflow-automation.md`             |
| `change-brief-lib.mjs`        | Pure briefing model for `change-brief.mjs`; I/O is injected.               | `change-brief.mjs`                                |
| `metrics.mjs`                 | Codebase size and Fallow health snapshot, optionally compared with a base. | `metrics`, `ci.yml`; see `workflow-automation.md` |
| `metrics-lib.mjs`             | Pure model for `metrics.mjs`: path categories, health summary, deltas.     | `metrics.mjs`                                     |
| `check-ci-result.mjs`         | Final CI gate: fails if any job the plan selected did not pass.            | `ci.yml`                                          |
| `report-dispatched-ci.mjs`    | Publishes the gate result as a commit status for dispatched CI runs.       | `ci.yml`                                          |
| `github-ci-gate.sh`           | Shared shell helpers that check `main`'s ruleset and CI state.             | `crowdin-pr.sh`, `release/release-commit.sh`      |
| `crowdin-pr.sh`               | Opens, updates, and merges the Crowdin translation PR after CI passes.     | `crowdin.yml`                                     |
| `workflow-metrics.mjs`        | Collects read-only CI and review timing baselines from GitHub as JSON.     | by hand; see `workflow-automation.md`             |
| `workflow-metrics-timing.mjs` | Timing calculations for `workflow-metrics.mjs`.                            | `workflow-metrics.mjs`                            |
| `*.test.mjs`                  | Vitest tests for the scripts above.                                        | `pnpm run test`                                   |
