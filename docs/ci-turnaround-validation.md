# Agent and CI turnaround implementation handoff

## Reviewable changes

| Commit     | Change                                                                                     | Rollout condition                                                                       |
| ---------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `e822b118` | Agent/review policy and manifest-pinned setup                                              | Review and merge first                                                                  |
| `d5da766d` | Conservative classifier, shadow CI aggregate, setup reuse, Lighthouse decoupling, baseline | Keep all checks enabled while collecting representative PR results                      |
| `ebe4b2f9` | Reusable release after validated main CI                                                   | Merge separately only after successful and failing live aggregate runs are demonstrated |

Do not merge the entire series as one rollout. Documentation/translation skips remain disabled by
`--shadow`; enabling them is a follow-up change after live verification. No production deployments,
review-provider settings, required-check settings, or remote branches were changed during implementation.

## Validation evidence

The implementation branch is `codex/agent-ci-turnaround`, based on `fb919ca0`. The complete implementation
was committed at `ebe4b2f9` with a clean working tree before review. The checks below covered that code;
The subsequent correction rejects an explicitly empty metrics `--after` value and switches the
remaining scheduled precompute job to the same reviewed setup action. Its schedule, permissions, KV
command, and environment are unchanged. A focused regression, lint, formatting, and Fallow were checked
after the correction; actionlint was rerun for the setup replacement.

| Check                                                      | Result                                                                                                                                                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run test:workflow`                                   | 14 passed: pnpm activation, classification, dirty Git state, aggregation, Dependabot check names, fork/shard/Deno preservation, release eligibility, real remote advancement, and metrics boundary validation |
| actionlint 1.7.12                                          | All repository workflows passed; official release download checksum verified                                                                                                                                  |
| `pnpm run lint`                                            | Passed                                                                                                                                                                                                        |
| `pnpm run typecheck`                                       | Passed                                                                                                                                                                                                        |
| `pnpm run format:check`                                    | Passed                                                                                                                                                                                                        |
| `pnpm run lint:fallow --base fb919ca0`                     | Passed; no new findings after simplifying policy helpers                                                                                                                                                      |
| `node scripts/check-systems-drift.mjs`                     | Passed                                                                                                                                                                                                        |
| `node scripts/lint-i18n.mjs`                               | Passed with existing non-fatal drift: 788 missing keys, 355 extra keys, one locale warning                                                                                                                    |
| `bash -n scripts/ensure-pnpm.sh scripts/setup-worktree.sh` | Passed                                                                                                                                                                                                        |
| `git diff --check`                                         | Passed                                                                                                                                                                                                        |

Workflow tests use isolated temporary repositories and mocked pnpm/Corepack commands. They do not
publish releases or contact production services. The application, database, Worker code, existing
Vitest/Codecov configuration, semantic-release rules, and Dependabot merge workflow are unchanged.
The full application suite, database reset, and production build were not rerun locally for this
workflow-only change; their CI jobs remain in place.

CodeRabbit CLI 0.7.5 completed the whole-branch review of `ebe4b2f9` against `fb919ca0`. Its one minor
finding (an empty metrics `--after` argument silently selected the baseline) was corrected and covered
by a regression test. There were no other findings. No repeat review was requested for this small
correction.

## External verification still required

- Demonstrate successful and failing `CI Result` runs on GitHub, plus documentation-only,
  translation-only, mixed, and dependency PR selections before removing shadow mode.
- Confirm actual Dependabot behavior and Codecov failure handling on representative PRs; local
  contract tests verify the names and existing status-polling code, not GitHub execution.
- Establish Codex delivery and reliable exclusions before disabling duplicate automatic providers.
  Read-only inspection of application PR #781 and translation PR #748 showed other providers, but
  did not establish Codex delivery or usage exclusions. No review requests were posted.
- Classic main-branch protection returned “Branch not protected”; the applied rules endpoint listed
  only deletion and non-fast-forward protection. No required CI/review rules were returned. Existing
  governance was preserved; do not assume the new aggregate becomes a required merge check automatically.
- Observe a real release only after the separate release change is eligible to merge. Local fixtures
  establish decision behavior, not production publication or deployment success.
- Record the actual rollout timestamp, then collect the first 20 subsequent merges using the metrics
  collector. See [the historical baseline](ci-turnaround-baseline.md) and
  [the rollout instructions](WORKFLOW_AUTOMATION.md#ci-rollout-and-measurements).
