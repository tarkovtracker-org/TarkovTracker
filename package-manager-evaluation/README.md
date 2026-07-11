# Package Manager Evaluation: npm 11 vs pnpm 10.34.5

**Branch:** `chore/package-manager-evaluation`
**Date:** 2026-07-11
**Status:** Evaluation record — not for production merge. Open a clean migration PR referencing #530.

## Part 1: npm Linked-Install Probe

### Results

| Check                                    | npm (normal) | npm (linked) | pnpm 10.34.5 |
| ---------------------------------------- | ------------ | ------------ | ------------ |
| `npm ci` / `pnpm install` (install only) | PASS         | PASS         | PASS         |
| `nuxt prepare` (postinstall)             | PASS         | **FAIL**     | PASS         |
| `lint`                                   | PASS         | **FAIL**     | PASS         |
| `format:check`                           | PASS         | PASS         | PASS         |
| `typecheck`                              | PASS         | **FAIL**     | PASS         |
| `test` (1989 tests, 205 files)           | PASS         | **FAIL**     | PASS         |
| `build`                                  | PASS         | **FAIL**     | PASS         |
| `supabase:check`                         | PASS         | PASS         | PASS         |
| Worker `typecheck`                       | PASS         | PASS         | PASS         |
| Worker `validate:openapi`                | PASS         | PASS         | PASS         |
| Worker `test:api-gateway` (55 tests)     | PASS         | PASS         | PASS         |
| `semantic-release --dry-run`             | PASS         | N/A          | PASS         |

### Linked-install failure root cause

`nuxt-define@1.0.0` (transitive via `@nuxtjs/i18n` → `nuxt-define`) imports `@nuxt/kit`
without declaring it as a dependency. Under npm's normal hoisting, `@nuxt/kit` is hoisted
to top-level `node_modules` and is accessible. Under the linked install strategy, it is
isolated in its `.store` location and unreachable from `nuxt-define`'s store.

This is an **upstream ghost dependency** in `nuxt-define`, not in TarkovTracker's own code.

### Interpretation

- The linked probe **failed** for the root application, indicating hoisting reliance.
- However, pnpm's semistrict layout resolves this correctly — `@nuxt/kit` is available to
  `nuxt-define` through pnpm's peer-dependency resolution without `shamefullyHoist`.
- The Worker has no hoisting issues.

## Part 2: pnpm Workspace Setup

### Configuration

- `pnpm-workspace.yaml` created with workspace covering `.` and `workers/api-gateway`
- All npm overrides translated to pnpm-compatible syntax
- `packageManager` updated to `pnpm@10.34.5`
- `engines` updated to include `pnpm: ">=10.34.5 <11"`
- `pnpm-lock.yaml` generated via `pnpm import` from existing `package-lock.json`
- npm lockfiles removed

### Build scripts (onlyBuiltDependencies)

pnpm 10 blocks dependency lifecycle scripts by default. The following 6 packages were
blocked and have been explicitly approved in `pnpm-workspace.yaml` via `onlyBuiltDependencies`:

- `@parcel/watcher` — file watcher native addon (used by Nuxt dev)
- `esbuild` — JS bundler (used by Vite/Nuxt build)
- `sharp` — image processor (used by `@nuxt/image`)
- `unrs-resolver` — native resolver (used by eslint-plugin-import-x)
- `vue-demi` — Vue 2/3 compatibility shim
- `workerd` — Cloudflare Workers runtime (needed for `wrangler pages dev`)

This ensures pnpm's lifecycle script behavior matches npm's. The `scripts enabled` benchmark
scenarios are equivalent between npm and pnpm.

### Override translation

| npm override                                              | pnpm override                                  | Verified                                              |
| --------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `@nuxt/test-utils.h3-next: npm:h3@2.0.1-rc.20`            | `@nuxt/test-utils>h3-next: npm:h3@2.0.1-rc.20` | YES — `h3@2.0.1-rc.20` under `@nuxt/test-utils@4.0.3` |
| `@nuxt/test-utils.srvx: ^0.11.15`                         | `@nuxt/test-utils>srvx: ^0.11.15`              | YES — `srvx@0.11.15`                                  |
| `npm..: ^11.18.0`                                         | `npm: ^11.18.0`                                | YES — `npm@11.18.0`                                   |
| `npm.picomatch: ^4.0.4`                                   | `npm>picomatch: ^4.0.4`                        | YES — `picomatch@4.0.4` under npm                     |
| `aggregate-error: npm:@socketregistry/aggregate-error@^1` | same                                           | YES — `@socketregistry/aggregate-error@1.0.15`        |
| `esbuild: ^0.28.1`                                        | same                                           | YES — `esbuild@0.28.1`                                |
| `fast-xml-parser: ^5.7.1`                                 | same                                           | YES — `fast-xml-parser@5.7.1`                         |
| `brace-expansion: ^5.0.6`                                 | same                                           | YES — `brace-expansion@5.0.7`                         |
| `lodash: ^4.18.1`                                         | same                                           | YES — `lodash@4.18.1`                                 |
| `vite: ^7.3.5`                                            | same                                           | YES — `vite@7.3.5`                                    |
| `ws: ^8.20.1`                                             | same                                           | YES — `ws@8.21.0`                                     |
| `yaml: ^2.8.3`                                            | same                                           | YES — `yaml@2.8.3`                                    |
| Worker `ajv: ^8.18.0`                                     | `@apidevtools/swagger-parser>ajv: ^8.18.0`     | YES — see ajv override verification below             |
| Worker `esbuild: ^0.28.1`                                 | global `esbuild: ^0.28.1`                      | YES — `esbuild@0.28.1`                                |
| All other Socket Registry substitutions                   | same syntax                                    | YES — all active                                      |

### ajv override verification

The original pnpm translation used `api-gateway>ajv: ^8.18.0`, but `api-gateway` does not
directly declare `ajv` — it is transitive via `@apidevtools/swagger-parser`. The pnpm
`parent>child` syntax overrides the named dependency belonging to that parent, so the
original targeting was ineffective.

**Verification method:** Removed the override and regenerated the lockfile with
`pnpm install --lockfile-only`. The resolved `ajv` version stayed at `8.20.0`, confirming
the override was a no-op (the natural resolution from `@apidevtools/swagger-parser`'s
`^8.17.1` already satisfies `^8.18.0`).

**Corrected override:** `@apidevtools/swagger-parser>ajv: ^8.18.0` — targets the actual
package that declares the `ajv` dependency. This is structurally correct as a version floor,
even though the current registry state makes it a no-op.

### lru-cache version drift

`pnpm import` re-resolved `lru-cache` from 11.3.5 (npm lockfile) to 11.5.1 within the
declared `^11.3.3` range. This is the only direct dependency version mismatch (61 of 62
match). Both versions satisfy the declared range. This has been resolved by pinning
`lru-cache: 11.3.5` in the pnpm overrides to match the npm lockfile exactly, so the
migration contains no version changes.

### Peer-dependency warnings

Only 2 pre-existing warnings (not caused by migration):

- `@json-render/core`: unmet peer `zod@^4.0.0` (found 3.25.76)
- `@json-render/ink`: unmet peer `ink@^6.0.0` (found 7.0.1)

### No compatibility flags needed

- `shamefullyHoist`: NOT enabled
- No peer-dependency suppression
- No broad compatibility workarounds

## Part 4: pnpm Validation Matrix

All pnpm validation checks pass. See Part 1 table above.

### Cloudflare preview validation (CI)

The `pnpm-preview-validation.yml` workflow validates the complete production-like
preview path under pnpm with `onlyBuiltDependencies` enabled.

**CI run:** https://github.com/tarkovtracker-org/TarkovTracker/actions/runs/29145324062
**Commit:** `ea4373e2`
**Result:** ALL PASS (8m0s)

| Step                                | Status |
| ----------------------------------- | ------ |
| `pnpm install --frozen-lockfile`    | PASS   |
| `pnpm run build`                    | PASS   |
| `pnpm exec wrangler pages dev dist` | PASS   |
| Readiness checks (5 URLs)           | PASS   |
| Lighthouse CI                       | PASS   |

This confirms that `workerd`, `sharp`, `esbuild`, and all other approved build
dependencies function correctly under pnpm on `ubuntu-24.04`.

## Part 5: Dependency Comparison

### Direct dependency versions

Machine-readable comparison: `dependency-comparison.json`

| Package               | npm resolved | pnpm resolved | Match |
| --------------------- | ------------ | ------------- | ----- |
| nuxt                  | 4.4.8        | 4.4.8         | YES   |
| vue                   | 3.5.39       | 3.5.39        | YES   |
| @nuxt/ui              | 4.9.0        | 4.9.0         | YES   |
| @supabase/supabase-js | 2.103.0      | 2.103.0       | YES   |
| vitest                | 4.1.9        | 4.1.9         | YES   |
| eslint                | 10.6.0       | 10.6.0        | YES   |
| typescript            | 5.9.3        | 5.9.3         | YES   |
| tailwindcss           | 4.3.2        | 4.3.2         | YES   |
| wrangler              | 4.105.0      | 4.105.0       | YES   |
| pinia                 | 3.0.4        | 3.0.4         | YES   |
| vue-i18n              | 11.4.6       | 11.4.6        | YES   |
| @nuxtjs/i18n          | 10.4.0       | 10.4.0        | YES   |
| h3                    | 1.15.11      | 1.15.11       | YES   |
| lru-cache             | 11.3.5       | 11.3.5        | YES (pinned via override) |

### Version differences (transitive)

37 packages have different version sets. These are all cases of pnpm deduplicating
more aggressively (fewer duplicate versions hoisted) or platform-specific packages
that npm doesn't list on linux but pnpm includes in the lockfile. No security-critical
or override-targeted package has an unexpected version difference.

### Summary

- Total direct dependencies compared: 62
- Matched: 62 (lru-cache pinned to match npm lockfile)
- Mismatched: 0
- npm unique packages: 1664
- pnpm unique packages: 978 (fewer due to better deduplication)
- All overridden packages: verified identical
- All Socket Registry substitutions: verified active
- No direct dependency disappeared due to hoisting differences

## Part 3: Benchmark Results (Authoritative CI)

### Environment

| Parameter              | Value                                                                          |
| ---------------------- | ------------------------------------------------------------------------------ |
| CI run                 | https://github.com/tarkovtracker-org/TarkovTracker/actions/runs/29144471579    |
| Benchmark commit       | `9bb5d2fb3c34deb335e33b44fd875ab256062acf`                                     |
| npm baseline (merge-base) | `7ec139375f1a7231124f9ff31ab42c9691156559`                                  |
| Runner                 | `ubuntu-24.04`                                                                 |
| Node                   | 24.12.0                                                                        |
| pnpm                   | 10.34.5                                                                        |
| Paired trials per scenario | 5                                                                          |
| Total paired measurements | 80                                                                         |
| Failed trials          | 0                                                                              |

### Methodology

Paired trials on the same runner, alternating order (npm→pnpm, pnpm→npm) to control
for ordering effects. Warm caches use isolated, pre-primed cache directories (untimed
priming run, then reuse). Cold caches are freshly created per trial. npm fixtures are
pinned to the merge-base commit. Build scripts are equivalent (all 6 pnpm-blocked
packages approved via `onlyBuiltDependencies`).

Raw CI results: `ci-results/` directory.

### Root install — per scenario

| Scenario         | npm median (ms) | npm range (ms)   | pnpm median (ms) | pnpm range (ms)  | Improvement |
| ---------------- | --------------- | ---------------- | ---------------- | ---------------- | ----------- |
| cold, scripts    | 28,376          | 28,055–29,594    | 10,942           | 10,812–11,658    | **61%**     |
| warm, scripts    | 22,652          | 22,575–22,851    | 9,429            | 9,254–9,442      | **58%**     |
| cold, no scripts | 27,163          | 26,547–27,494    | 8,323            | 8,223–8,371      | **69%**     |
| warm, no scripts | 19,205          | 19,131–19,694    | 3,307            | 3,234–3,377      | **83%**     |

### Worker install — per scenario

| Scenario         | npm median (ms) | npm range (ms) | pnpm median (ms) | pnpm range (ms) | Improvement             |
| ---------------- | --------------- | -------------- | ---------------- | --------------- | ----------------------- |
| cold, scripts    | 3,048           | 2,998–3,436    | 11,407           | 11,052–13,010   | **-274%** (pnpm slower) |
| warm, scripts    | 2,380           | 2,371–2,527    | 9,141            | 9,105–9,358     | **-284%** (pnpm slower) |
| cold, no scripts | 2,993           | 2,906–3,071    | 8,167            | 7,970–9,512     | **-173%** (pnpm slower) |
| warm, no scripts | 2,269           | 2,246–2,434    | 3,353            | 3,244–3,681     | **-48%** (pnpm slower)  |

**Worker-only pnpm installation is not the intended production pattern.**
`pnpm --filter api-gateway install` processes the entire workspace lockfile and links
all root dependencies. In the unified pnpm workspace, a single `pnpm install` covers
both root and worker — the worker-only scenario exists only for methodology completeness.

### CI job pattern comparison (decision-relevant)

Most CI jobs install only the root project. The Workers job installs root + worker
sequentially. Under pnpm workspace, a single `pnpm install` covers both.

| CI Pattern                          | npm (ms) | pnpm (ms) | Improvement |
| ----------------------------------- | -------- | --------- | ----------- |
| **Typical root job (warm, scripts)**    | 22,652   | 9,429     | **58%**     |
| **Workers job (root+worker, warm, scripts)** | 25,032   | 9,429     | **62%**     |
| Typical root job (warm, no scripts) | 19,205   | 3,307     | **83%**     |
| Workers job (root+worker, warm, no scripts) | 21,474   | 3,307     | **85%**     |

### Disk usage (node_modules apparent size only)

These measurements are `du -sb` on `node_modules` directories only. They do **not** include
the pnpm store, npm cache, or GitHub cache archive size. For developer disk footprint, add
the incremental package-manager cache/store growth. For CI, installation duration is more
important than post-install directory size.

| Manager      | root node_modules | npm cache | pnpm store | worker node_modules |
| ------------ | ----------------- | --------- | ---------- | ------------------- |
| npm 11       | 1,096 MB          | 357 MB    | N/A        | 236 MB (separate)   |
| pnpm 10.34.5 | 812 MB            | N/A       | 821 MB     | shared (workspace)  |
| **Saving**   | **284 MB (26%)**  | —         | —          | —                   |

### Interpretation

- Warm root install improvement: **58%** with equivalent lifecycle scripts (22.7s → 9.4s)
- Workers pattern improvement: **62%** (25.0s → 9.4s)
- All 80 paired trials completed successfully — zero failures
- The percentage shrank from the preliminary 79% to 58% for warm-scripts, as expected
  after enabling equivalent lifecycle scripts, eliminating ambient-cache advantages,
  and running paired CI trials
- Worker-only pnpm install is slower, but this is not the intended production pattern

## Part 6: Recommendation

### Decision criteria

| Criterion                                | Result                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| Linked probe                             | Failed (upstream ghost dep in nuxt-define) — but pnpm handles it              |
| pnpm needs shamefullyHoist               | NO                                                                            |
| Validation differs                       | NO — all checks pass including wrangler pages dev / Lighthouse CI validation   |
| Overrides cannot be proven               | NO — all verified (ajv override corrected and verified)                       |
| Build scripts equivalent                 | YES — all 6 blocked packages approved via `onlyBuiltDependencies`             |
| Direct dependency changes                | 0 — all 62 match (lru-cache pinned to 11.3.5 via override)                   |
| CI benchmark (warm root, scripts)        | **58% improvement** — exceeds 20% threshold                                   |
| CI benchmark (Workers pattern, scripts)  | **62% improvement** — exceeds 20% threshold                                   |
| Failed trials                            | 0 of 80                                                                       |

### Assessment

pnpm 10.34.5 is technically compatible with this repository:

1. All validation passes without compatibility flags
2. All overrides and security substitutions are preserved (ajv override corrected)
3. All 62 direct dependencies resolve to identical versions (lru-cache pinned)
4. The ghost dependency that broke the linked probe does NOT break pnpm
5. No `shamefullyHoist` or peer-dep suppression needed
6. Build scripts are equivalent (all 6 packages approved)
7. CI benchmarks show 58% warm install improvement on paired same-runner trials

### Recommendation: PROCEED with migration to pnpm 10.34.5

All validation is complete. The Cloudflare preview path (build, wrangler pages dev,
Lighthouse) passes under pnpm with `onlyBuiltDependencies` enabled.

The corrected CI benchmark confirms:
- 58% warm root install improvement (22.7s → 9.4s)
- 62% Workers pattern improvement (25.0s → 9.4s)
- Zero failed trials across 80 paired measurements

### Migration approval status: APPROVED

All criteria are met:
- Technical compatibility: confirmed
- Override preservation: confirmed (ajv corrected, lru-cache pinned)
- Direct dependency parity: 62/62 identical
- Build script equivalence: confirmed (all 6 packages approved)
- CI benchmark: 58% warm install improvement (exceeds 20% threshold)
- Cloudflare preview validation: PASS (build, wrangler pages dev, Lighthouse)
- Zero failed trials across 80 paired measurements

### Migration plan

This PR is an evaluation record. Close it and open a clean migration PR referencing #530,
structured as three reviewable commits:

**Commit 1 — dependency resolution:**
- `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `onlyBuiltDependencies`
- Correct overrides (including `@apidevtools/swagger-parser>ajv` and `lru-cache: 11.3.5`)
- `packageManager`, pnpm engine constraint
- Removal of npm lockfiles

**Commit 2 — commands:**
- `npm run` → `pnpm run`, `npx` → `pnpm exec`, `npm --prefix` → `pnpm --filter`
- Husky hooks, setup scripts, local documentation

**Commit 3 — infrastructure:**
- Package-manager-dependent workflows, `actions/setup-node` pnpm caching
- Dependabot, Cloudflare `PNPM_VERSION=10.34.5`
- Release and security commands, contributor documentation

**Rollback plan:**
Restore npm manifests (`package.json`, `package-lock.json`), remove `pnpm-workspace.yaml`
and `pnpm-lock.yaml`, revert `packageManager` to `npm@11.16.0`, revert command changes
in scripts and workflows, and remove pnpm-specific CI configuration.
