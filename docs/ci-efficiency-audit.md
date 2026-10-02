# CI efficiency audit

Baseline: `b09cd3cc79a269b2e20ab93276a3f83f99a25daa`, inspected 2026-10-02.
This audit proposes one bounded setup optimization. It does not change the classifier,
selected checks, workflow triggers, permissions, production gates, or preview automation.
PR #1011's discovery brief is advisory; its classifier consumer remains compatible.

## Current coverage and triggers

| Workflow                                  | Automatic trigger                                         | Existing reduction / decision                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| CI                                        | PRs targeting main; main pushes                           | PR classifier; main pushes and dispatches force full validation; concurrency cancels superseded revisions                        |
| Security                                  | Called by CI; weekly standalone schedule                  | Standalone push/PR duplicates already removed; every CI event requires audits, Gitleaks and CodeQL                               |
| PR Checks                                 | PR opened, synchronized, reopened                         | Lighthouse limited to UI/performance labels or component/feature/config paths; fork Lighthouse excluded; PR Meta remains present |
| Link Check                                | Relevant main docs/config pushes; weekly                  | Already path-filtered; checks docs and public llms links                                                                         |
| Crowdin                                   | English/config/gate main pushes; weekly                   | Push uploads sources; weekly/dispatch opens translation PR and requires its CI/preview gates                                     |
| Release                                   | Weekly Tuesday; dispatch                                  | Batched already; validated current-main commit required before setup and publication                                             |
| Dependabot Auto Merge                     | CI completed                                              | Trusted workflow checks candidate eligibility and authoritative results before merge                                             |
| Precompute Tarkov Data                    | Every 12 hours                                            | Operational data refresh tied to cache TTL, independent of changes                                                               |
| Stale                                     | Daily                                                     | Repository maintenance, independent of changes                                                                                   |
| Finalization Shadow                       | Dispatch only                                             | No automatic work                                                                                                                |
| Preview / Preview State / Request Preview | Trusted dispatch, CI/lifecycle events, schedule, comments | Separate concurrent preview-lifecycle task; no changes proposed here                                                             |

Read-only GitHub ruleset inspection found active Main deletion/non-fast-forward protection,
and strict Main CI freshness requiring `CI Result` and `Preview Result`, both from GitHub
Actions (integration 15368). No legacy branch-protection rule was returned (404).
`PR Meta` is additionally required by the existing Dependabot merge helper, not by that
ruleset. Settings were not changed.

`CI Result` always runs, checks the classifier and every selected job, and rejects missing,
failed, cancelled or unexpected results. Its status-writing code comes from the default
branch. Unknown or unreadable diffs receive full validation. Rename parsing includes both
old and new paths; deleted paths remain inputs. Workflow changes select actionlint/zizmor.
Fork credential exclusions and release/production gates remain intact.

## Change matrix

The baseline and candidate select identical jobs. `scripts/workflow-tests/validation.mjs`
exercises these classes and aggregate success/failure behavior deterministically.

| Changes                                                           | CI selection                                          | Preview                                                      |
| ----------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| Root prose, docs Markdown, GitHub Markdown                        | Format, systems drift, security                       | Not required                                                 |
| Nested AGENTS/CLAUDE instructions outside public                  | Same reduced checks                                   | Not required                                                 |
| Docs generator/config/scripts, including non-Markdown docs inputs | Full                                                  | Not required for inert docs/scripts locations                |
| App code, shared dependencies, package manifest/lockfile          | Full                                                  | Required                                                     |
| Workflow/action code                                              | Full, including workflow lint                         | Not required                                                 |
| Edge functions, migrations                                        | Full                                                  | Required                                                     |
| Tests                                                             | Full                                                  | Not required for inert tests locations                       |
| Source English locale                                             | Full                                                  | Required                                                     |
| Crowdin-owned non-English locale                                  | Format, i18n, systems drift, security, Validate build | Required                                                     |
| Mixed prose and executable paths                                  | Full                                                  | Required when any deployable input changes                   |
| Rename app code into docs / delete executable input               | Full                                                  | Rename requires preview; inert deletion follows its location |
| Delete prose docs                                                 | Reduced                                               | Not required                                                 |
| Unknown path, empty/unreadable diff, forced full event            | Full                                                  | Required                                                     |

`DESIGN.md` and public Markdown remain full. Some README files outside the explicit docs
allowlist already receive full CI; expanding that allowlist requires a separate dependency
audit and representative evidence. Main docs pushes intentionally remain full under the
existing production validation policy.

## Measured baseline

Run IDs link to immutable Actions evidence. All six attempts completed successfully on
Ubuntu hosted runners, attempt 1. The sample is selected, not a random workload estimate.
The docs-only run's file list contains only `docs/decision-tarkov-data.md` and
`docs/systems/game-data.md`. PR #1002 has a docs title but mixed executable changes;
it is correctly treated as full.

| Run                                                                                        | Class                | Job span seconds | Summed runner minutes | Security Scan seconds | Project setup seconds |
| ------------------------------------------------------------------------------------------ | -------------------- | ---------------: | --------------------: | --------------------: | --------------------: |
| [36724927123](https://github.com/tarkovtracker-org/TarkovTracker/actions/runs/36724927123) | Docs #1005           |              127 |                  4.05 |                    42 |                    29 |
| [36707190637](https://github.com/tarkovtracker-org/TarkovTracker/actions/runs/36707190637) | Mixed #1002          |              246 |                 20.55 |                    48 |                    32 |
| [36934155543](https://github.com/tarkovtracker-org/TarkovTracker/actions/runs/36934155543) | #1011                |              188 |                 19.85 |                    44 |                    28 |
| [36943353908](https://github.com/tarkovtracker-org/TarkovTracker/actions/runs/36943353908) | App                  |              197 |                 19.23 |                    47 |                    32 |
| [36947640808](https://github.com/tarkovtracker-org/TarkovTracker/actions/runs/36947640808) | Actions dependencies |              189 |                 19.92 |                    45 |                    29 |
| [36949070796](https://github.com/tarkovtracker-org/TarkovTracker/actions/runs/36949070796) | Baseline main push   |              202 |                 20.53 |                    45 |                    30 |

Job span is last executed job completion minus first executed job start; it excludes initial
queue delay and includes dependencies/inter-job scheduling. Summed runner minutes sum each
executed job's start-to-completion seconds / 60, excluding skipped jobs, without billing
rounding. Run metadata duration (`updated_at - run_started_at`) is a different proxy;
for #1005 it is 131 seconds, versus 127 seconds of job span. Do not equate either with
runner consumption or use summed parallel jobs as wall-clock savings.

## Prioritized tranche and acceptance

1. Remove unnecessary cache restoration and frozen workspace installation from non-scheduled
   Security Scan setup. Audit commands already copy only package.json and pnpm-lock.yaml to
   a clean temporary directory. Runtime and integrity-verified pnpm activation remain;
   scheduled outdated checks retain full installation. No security check is skipped.
2. Defer docs formatter/PR Meta installation specialization: both still need external tooling,
   so preserving exact configuration/plugin/commitlint behavior needs its own benchmark.
3. Defer finer subsystem selection and trigger edits. Existing reductions are substantial;
   removing main full validation or CodeQL merely to reduce runs would exceed this tranche.

The setup action's opt-out is explicit: only the string `false` skips cache/install; its
default and unknown values keep full setup. Existing callers keep their installed workspace.
The Security workflow supplies false for CI calls and true for its standalone schedule.

Acceptance requires a successful candidate Actions run with all security operations present,
lower measured Security Scan setup/job duration, successful workflow lint and aggregate,
and no selected-check regression. Historical setup duration is an opportunity, not a claim
of saved workflow time. Candidate execution measurements and limits will be recorded before
this PR becomes ready. No manual production dispatches, stress runs, or settings changes.
