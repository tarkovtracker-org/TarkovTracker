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
| `worker-build-inputs.mjs` | Runbook's api-gateway Workers Builds input list against the Worker import closure. |
| `helpers/`                | Shared fixtures: temp repos, workflow block parsing, ZIP building.                 |
