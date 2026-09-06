# Logic coverage baseline and guardrails

Issue [#586](https://github.com/tarkovtracker-org/TarkovTracker/issues/586) targets
untested application logic, rather than presentational components. Its original
57.9% line figure and file names predate several refactors.

## Reproduce

Run `pnpm install --frozen-lockfile`, then `pnpm run test:coverage`. The unsharded
run includes all `app/**/*.{ts,vue}` files except the exclusions in
`vitest.config.ts`. It writes `coverage/coverage-summary.json` and
`coverage/lcov.info`. Run lint/typecheck separately from coverage: their Nuxt
preparation can regenerate files while Vitest is reading them.

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

The final full run passed 287 files / 2,888 tests with the new gates enabled.

| Metric     | Baseline |  After |
| ---------- | -------: | -----: |
| Lines      |   65.19% | 66.85% |
| Statements |   63.07% | 64.74% |
| Functions  |   60.12% | 61.35% |
| Branches   |   50.88% |  52.2% |

| Current module (under `app/`)         | Lines before → after | Branches before → after |
| ------------------------------------- | -------------------: | ----------------------: |
| `stores/utils/gameMode.ts`            |        66.66% → 100% |              75% → 100% |
| `utils/storeHelpers.ts`               |          0% → 86.95% |                0% → 90% |
| `composables/useTaskState.ts`         |        85.71% → 100% |              25% → 100% |
| `composables/useTaskRepair.ts`        |          0% → 91.22% |             0% → 76.19% |
| `composables/useAppInitialization.ts` |      83.46% → 97.63% |         68.99% → 80.62% |
| `server/api/changelog.get.ts`         |          0% → 92.85% |             0% → 73.54% |
| `stores/useTeamStore.ts`              |      57.76% → 81.93% |          49.15% → 66.8% |
| `utils/changelog.ts`                  |         13.2% → 100% |             0% → 93.02% |

The application denominator is unchanged (31,591 executable lines); the tests
cover 524 additional lines. These figures are a snapshot, not an expectation
that future unrelated changes leave coverage percentages identical.

## Gates

Unsharded Vitest requires 65% lines, 63% statements, 60% functions and 50%
branches. These rounded floors preserve the measured pre-change baseline;
per-module floors additionally protect the newly covered small logic modules
and changelog handler. Exact values are in `vitest.config.ts`. The larger team
store retains the project gate rather than treating this test increment as
complete coverage of every team behavior.

CI continues to report imported files from each of four shards without
per-shard thresholds. Codecov merges those reports and applies a 65% absolute
line floor, alongside the existing automatic project/patch comparisons.
Because local coverage also counts unimported application files, the two
numbers have different denominators and should not be presented as identical.
Per-module floors are enforced by the full local coverage run, not by a single
CI shard. Forks that skip uploads retain the existing missing-report behavior.

For focused development, use `pnpm run test <test-file>`. A focused coverage run
with the full application denominator is expected to fail project/module
floors; use the complete coverage command for the acceptance result.
