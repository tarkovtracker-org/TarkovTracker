# Logic coverage baseline and guardrails

Issue [#586](https://github.com/tarkovtracker-org/TarkovTracker/issues/586) targets
untested application logic, rather than presentational components. Its original
57.9% line figure and file names predate several refactors.

## Reproduce

Run `pnpm install --frozen-lockfile`, then `pnpm run test:coverage`. The unsharded
run includes all `app/**/*.{ts,vue}` files except the exclusions in
`vitest.config.ts`. It writes `coverage/coverage-summary.json`,
`coverage/lcov.info`, and the Istanbul map `coverage/coverage-final.json`, which
`pnpm run metrics --coverage coverage` uses for measured CRAP scores
([codebase metrics](workflow-automation.md#codebase-metrics)). Run
lint/typecheck separately from coverage: their Nuxt preparation can regenerate
files while Vitest is reading them.

The baseline at `c4912a817738ece8d868fe2d45af77a425615fa0` on 2026-09-06 passed
281 files / 2,800 tests: 65.19% lines, 63.07% statements, 60.12% functions and
50.88% branches. These are local V8 measurements, not Codecov badge values.

## Scope and contracts

| Historical target              | Current target and coverage intent                                                                                                                                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stores/utils/gameMode.ts`     | Same path: valid modes, invalid/missing getters and store failure fallback.                                                                                                                                                                                                  |
| `stores/utils/storeHelpers.ts` | `utils/storeHelpers.ts`: real Pinia replacement/reset, removal of absent fields, preservation of falsy values, invalid input and patch failure.                                                                                                                              |
| `composables/useTaskState.ts`  | Same path: completion/failure truth table, conservative unlock behavior, reactive IDs and progress updates.                                                                                                                                                                  |
| `composables/useTaskRepair.ts` | Same path: manual and prerequisite-caused failures, confirmation/cancellation, rechecking current progress and mutation failures.                                                                                                                                            |
| `composables/useApp.ts`        | Startup logic now lives in `composables/useAppInitialization.ts`: metadata/locale failure, retry after sync/migration failure, stale account work and optional service failures. `stores/useApp.ts` is a separate drawer store and remains outside this logic-focused scope. |
| `server/api/changelog.get.ts`  | Same path: release/commit responses, pagination, local/shared cache expiry and failures, partial/total upstream failures, query bounds and abort timeout.                                                                                                                    |
| `stores/useTeamStore.ts`       | Same path: real teammate composable hydration, normalized modes, legacy fallback boundaries, Seasonal isolation, realtime races and cleanup. Replaces tests of a copied filtering algorithm. Existing team controller tests remain in place.                                 |
| `stores/changelog.ts`          | Text transformation now lives in `utils/changelog.ts`: markdown cleanup, release bullets and conventional commit filtering/normalization.                                                                                                                                    |

Tests exercise production functions while mocking network, Supabase, shared
cache and UI service boundaries. No runtime application behavior changes.
The task-repair tests use current `failConditions`; they intentionally do not
introduce fixtures depending on the retired task `alternatives` field. Removal
of that remaining legacy branch belongs with #716/#727. Artificial property
traps and redundant defensive catches in store helpers are not coverage goals.

## Measured result

The closing full run passed 287 files / 2,888 tests with the new gates enabled, covering 524
additional lines over the baseline. Per-module before/after percentages were a snapshot of that
run, not a contract — exact floors live in `vitest.config.ts` (see Gates below). Do not extend
this section with new tables; update the config instead.

## Gates

Each blank-line scanner module has separate coverage floors in
`scripts/checks/blank-lines.vitest.config.mjs`. Run `pnpm run test:blank-lines`;
CI also runs it in Lint & Format. These floors do not change the application
coverage denominator or thresholds below. Scanner behavior and CI wiring are
documented in [workflow automation](./workflow-automation.md#blank-line-scanner-tests).

Unsharded Vitest requires 65% lines, 63% statements, 60% functions and 50%
branches. These rounded floors preserve the measured pre-change baseline;
per-module floors additionally protect the newly covered small logic modules
and changelog handler. Exact values are in `vitest.config.ts`. The larger team
store retains the project gate rather than treating this test increment as
complete coverage of every team behavior.

CI runs four shards without thresholds and uploads their Vitest blob reports.
The `Coverage thresholds` job merges them with `vitest run --merge-reports
--coverage`, which applies every gate in `vitest.config.ts` and blocks `CI
Result` when one fails. Merging uses `scripts/ci/vitest-merged-coverage.mjs`
to apply the `include` filter, zero-fill application files no test imports,
and sum shard hits per file, so CI reports the same denominator and per-file
numbers as the local unsharded run, except for
`app/server/routes/profile/[...path].get.ts`: Vitest treats the covered path as
a glob ignore pattern and zero-fills it again locally (16/17 statements); the
merged provider preserves its real coverage (16/16 statements). Shards also upload imported-file lcov to
Codecov, which applies a 65% absolute line floor alongside the automatic
project/patch comparisons; Codecov does not count unimported files, so its
percentage is higher than the gated one. Forks that skip uploads retain the
existing missing-report behavior.

For focused development, use `pnpm run test <test-file>`. A focused coverage run
with the full application denominator is expected to fail project/module
floors; use the complete coverage command for the acceptance result.
