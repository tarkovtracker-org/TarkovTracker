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

Baseline initial queue delay was 3-4 seconds. All six Security Scan logs confirm warm
package-cache hits on the same lockfile key; their installs still took 15.1-17.6 seconds.
Node 24.19.0 and integrity-pinned pnpm 11.14.0 are common to all nine observations.
Four baselines and all three candidates use Ubuntu image `20260927.320.1`; the older
two baselines use `20260920.314.1`. The same-image baseline subset retains the full
sample's medians. Hosted runner hardware was not fixed or randomized. Thus this opportunity
exists with a warm cache; cold-cache savings and a fleet-level effect are not measured.

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
and no selected-check regression. No manual production dispatches, stress runs, or settings
changes were used.

## Candidate execution

[CI 36950472241](https://github.com/tarkovtracker-org/TarkovTracker/actions/runs/36950472241),
attempt 1 at `0390cd949f394ba251a37bbd27a8d9bacce38e2a`, completed successfully. Security
Scan took **20 seconds**, including **7 seconds** of project setup. Both audits, Gitleaks
canary/repository scan, CodeQL, all four test shards, workflow tests, pinned actionlint/online
zizmor, and CI Result succeeded. Logs show the exact verified pnpm pin, runtime-only input,
and no package-cache restoration or workspace install in Security Scan.

Against six baseline observations (median Security Scan 45 seconds; median setup 29.5 seconds),
this one candidate observation is 25 seconds (55.6%) shorter in the scanner and 22.5 seconds
shorter in setup. That is measured job execution evidence, not a sum of theoretically skipped
jobs. It corresponds to 0.417 fewer runner minutes for this component against the historical
median. The small, non-random sample does not establish a statistical effect or a fleet saving.

The full candidate run recorded **185 seconds** from run creation to last job completion,
**182 seconds** of job span, **3 seconds** initial queue delay, and **19.42 summed runner
minutes. The baseline-main observation was 206 seconds, 202 seconds, 4 seconds, and 20.53
minutes respectively. Those whole-run differences include test/cache/scheduling variance
and are not attributed to this setup change. The scanner was not on the full CI critical path;
no repeatable wall-clock improvement is claimed.

Docs-only post-change CI and a standalone weekly run have not been measured. Docs PRs use
the same unconditional Security Scan invocation; the expected component saving there is a
projection. Weekly installation behavior is preserved by deterministic workflow tests.
The baseline docs run's measured event-to-completion wall time was 130 seconds, rather than
the 131-second completion-metadata proxy. Job totals exclude PR Checks and external services.

Local verification: all 221 workflow/Codex-guard tests pass on Linux Node 24.19.0; full Prettier
patterns, blank lines, design lint, Nuxt prepare, repository ESLint, Fallow, and systems drift
pass on Node 24.21.0/pnpm 11.14.0. Local actionlint 1.7.12 and checksum-verified offline zizmor
1.30.1 pass; the candidate CI additionally passed its pinned online tools. Windows wrappers
required direct formatter invocation; Bash/symlink workflow fixtures passed in Linux instead.
Commit hooks were replaced by those explicit checks. Local CodeRabbit review remains incomplete:
automatic approval review rejected third-party code transmission under this task's guarded
remote-review authorization. No workaround or direct named-agent request was made.

The final evidence-only commit receives normal CI before readiness; its exact head and results
belong in the PR description to avoid another commit solely to embed its own hash.
