# scripts/workflow-tests/

`node --test` contract tests for the GitHub workflows and the automation scripts they call. They
read the workflow YAML and run scripts against fixture repos so a broken path, permission, or gate
fails locally. Run with `pnpm run test:workflow`.

| File                      | Covers                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `workflows.mjs`           | Workflow triggers, Dependabot gating, path-based CI job selection, metrics inputs. |
| `validation.mjs`          | `ci/validation-plan.mjs` and `ci/validate-changes.mjs`.                            |
| `tools.mjs`               | `ci/validation-tools.mjs`.                                                         |
| `dispatched-status.mjs`   | `ci/check-ci-result.mjs` and `ci/report-dispatched-ci.mjs`.                        |
| `metrics.mjs`             | `ci/workflow-metrics-timing.mjs` duration math.                                    |
| `crowdin.mjs`             | `crowdin.yml` and `ci/crowdin-pr.sh`.                                              |
| `i18n.mjs`                | `checks/lint-i18n.mjs`.                                                            |
| `pnpm.mjs`                | `setup/ensure-pnpm.sh`.                                                            |
| `release-commit.mjs`      | `release/release-commit.sh` against a fixture repo.                                |
| `security.mjs`            | Security workflow wiring and Gitleaks rules.                                       |
| `preview*.mjs`            | The `preview/` pipeline and its workflows.                                         |
| `finalization-shadow.mjs` | `preview/finalization-shadow.mjs`.                                                 |
| `helpers/`                | Shared fixtures: temp repos, workflow block parsing, ZIP building.                 |

CI supplies its existing validation plan to `scripts/ci/run-workflow-tests.mjs`. Only pull requests
whose complete diff consists only of `app/utils/changelog.ts` and/or its unit test select the release
commit contract tests and selection regressions. The helper is consumed by
`scripts/release/release-highlights.test.mjs` and `scripts/release/release-scope.test.mjs`; those
Vitest tests, the application tests, all required CI jobs and the aggregate remain unchanged.
This is a deliberately narrow dependency boundary, not a general affected-test graph. Update it
when adding consumers. Workflow, tooling, configuration, mixed or unknown paths, malformed or
missing plans, main pushes and merge groups run the full Node suite. Local `pnpm run test:workflow`
also defaults to the full suite; clearing the two `WORKFLOW_TEST_*` variables is the rollback.
