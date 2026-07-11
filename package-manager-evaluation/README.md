# Package Manager Evaluation: npm 11 vs pnpm 10.34.5

**Branch:** `chore/package-manager-evaluation`
**Date:** 2026-07-11
**Status:** Experimental — not for production use

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
scenarios are now equivalent between npm and pnpm.

**Pending validation:** `wrangler pages dev` and the Lighthouse workflow must be validated
with this configuration before migration approval. This requires running the pr-checks
Lighthouse job with pnpm-installed dependencies.

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

**Pending:** `wrangler pages dev` and Lighthouse validation with `onlyBuiltDependencies`
configuration (requires `workerd` build script, which is now approved).

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

### Version drift: lru-cache

| Package    | npm resolved | pnpm resolved | Declared range | Match |
| ---------- | ------------ | ------------- | -------------- | ----- |
| lru-cache  | 11.3.5       | 11.5.1        | ^11.3.3        | **NO** |

This is the only direct dependency version mismatch. `pnpm import` re-resolved `lru-cache`
to 11.5.1 within the `^11.3.3` range, while the npm lockfile pinned 11.3.5. Both versions
satisfy the declared range. This is a compatible version bump, not a security concern.
If exact version parity is required, add `lru-cache: 11.3.5` to the pnpm overrides.

### Version differences (transitive)

37 packages have different version sets. These are all cases of pnpm deduplicating
more aggressively (fewer duplicate versions hoisted) or platform-specific packages
that npm doesn't list on linux but pnpm includes in the lockfile. No security-critical
or override-targeted package has an unexpected version difference.

### Summary

- Total direct dependencies compared: 62
- Matched: 61
- Mismatched: 1 (`lru-cache`: compatible version drift within semver range)
- npm unique packages: 1664
- pnpm unique packages: 978 (fewer due to better deduplication)
- All overridden packages: verified identical
- All Socket Registry substitutions: verified active
- No direct dependency disappeared due to hoisting differences

## Part 3: Benchmark Results

**Status:** Local results are preliminary and have known methodology limitations.
The committed raw results were produced by the previous (single-manager) script version
and cannot be reproduced by the current paired-trial script. They establish the **direction**
of the performance difference but not a trustworthy magnitude.

**Methodology issues in committed results:**
- npm and pnpm ran concurrently with mutual interference
- Warm-cache runs used ambient (uncontrolled) caches
- npm and pnpm were not paired on the same machine
- Build scripts were not equivalent (pnpm blocked 6 packages)

The corrected benchmark script and workflow are now committed. CI results from the
corrected workflow will replace these numbers.

**Environment:** WSL2 (Linux 6.6.87.2-microsoft-standard-WSL2), Node 24.12.0
**Runs per scenario:** 5

### Root install — per scenario (preliminary, uncontrolled)

| Scenario         | npm median (ms) | pnpm median (ms) | Improvement |
| ---------------- | --------------- | ---------------- | ----------- |
| cold, scripts    | 21,144          | 6,663            | **68%**     |
| warm, scripts    | 14,654          | 3,090            | **79%**     |
| cold, no scripts | 18,166          | 4,801            | **74%**     |
| warm, no scripts | 13,554          | 1,772            | **87%**     |

### Worker install — per scenario (preliminary, uncontrolled)

| Scenario         | npm median (ms) | pnpm median (ms) | Improvement             |
| ---------------- | --------------- | ---------------- | ----------------------- |
| cold, scripts    | 2,244           | 6,501            | **-190%** (pnpm slower) |
| warm, scripts    | 1,579           | 3,258            | **-106%** (pnpm slower) |
| cold, no scripts | 2,161           | 4,869            | **-125%** (pnpm slower) |
| warm, no scripts | 1,540           | 1,753            | **-14%** (pnpm slower)  |

**Why pnpm is slower for worker-only installs:** `pnpm --filter api-gateway install`
processes the entire workspace lockfile and links all root dependencies too (812 MB
vs npm's isolated 236 MB worker `node_modules`). This is not a fair comparison — in a
unified pnpm workspace, a single install covers both root and worker.

### CI job pattern comparison (preliminary, uncontrolled)

Most CI jobs install only the root project. The Workers job installs root + worker
sequentially. Under pnpm workspace, a single `pnpm install` covers both.

| CI Pattern                          | npm (ms) | pnpm (ms) | Improvement |
| ----------------------------------- | -------- | --------- | ----------- |
| Typical root job (warm, scripts)    | 14,654   | 3,090     | **79%**     |
| Workers job (root+worker, warm)     | 16,233   | 3,090     | **81%**     |
| Typical root job (warm, no scripts) | 13,554   | 1,772     | **87%**     |
| Workers job (root+worker, warm)     | 15,094   | 1,772     | **88%**     |

### Disk usage (node_modules apparent size only)

These measurements are `du -sb` on `node_modules` directories only. They do **not** include
the pnpm store, npm cache, or GitHub cache archive size. For developer disk footprint, add
the incremental package-manager cache/store growth. For CI, installation duration is more
important than post-install directory size.

| Manager      | root node_modules | worker node_modules                      |
| ------------ | ----------------- | ---------------------------------------- |
| npm 11       | 1,087 MB          | 236 MB (separate)                        |
| pnpm 10.34.5 | 812 MB            | shared (workspace)                       |
| **Saving**   | **275 MB (25%)**  | **-576 MB** (but shared, not duplicated) |

### Interpretation

- Root install improvement: **68-87%** across all scenarios (preliminary)
- The percentage will likely shrink after enabling equivalent lifecycle scripts,
  eliminating ambient-cache advantages, and running paired CI trials
- WSL2 filesystem may amplify pnpm's hard-linking advantage; CI numbers on
  `ubuntu-24.04` will be more conservative
- Worker-only install is slower with pnpm, but this is misleading — a unified
  workspace install covers both in one pass

## Part 6: Recommendation

### Decision criteria

| Criterion                              | Result                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------- |
| Linked probe                           | Failed (upstream ghost dep in nuxt-define) — but pnpm handles it           |
| pnpm needs shamefullyHoist             | NO                                                                         |
| Validation differs                     | NO — all checks pass (pending wrangler pages dev / Lighthouse)             |
| Overrides cannot be proven             | NO — all verified (ajv override corrected and verified)                    |
| Build scripts equivalent               | YES — all 6 blocked packages approved via `onlyBuiltDependencies`          |
| No unexplained direct dependency changes | 1 drift: `lru-cache` 11.3.5→11.5.1 (compatible, within semver range)    |
| Measured improvement (local)           | 68-87% (preliminary, uncontrolled — not decision-grade)                    |
| CI benchmark                           | Workflow corrected and on branch; pending CI execution                     |

### Preliminary assessment

pnpm 10.34.5 is technically compatible with this repository:

1. All validation passes without compatibility flags
2. All overrides and security substitutions are preserved (ajv override corrected)
3. All direct dependencies resolve to the same versions except `lru-cache` (compatible drift)
4. The ghost dependency that broke the linked probe does NOT break pnpm
5. No `shamefullyHoist` or peer-dep suppression needed
6. Build scripts are now equivalent (all 6 packages approved)
7. Local benchmarks show 68-87% install time improvement (preliminary, uncontrolled)

### Recommendation: PROVISIONALLY CONFIRMED (pending corrected CI benchmark)

**Technical feasibility: provisionally confirmed.**
**Performance benefit: pending corrected CI benchmark.**

The PR supports "pnpm is feasible and promising," not yet "pnpm migration approved."

### Remaining steps before migration approval

1. Run the corrected `package-manager-benchmark.yml` workflow via temporary branch push
2. Validate `wrangler pages dev` and Lighthouse with `onlyBuiltDependencies` config
3. Replace committed raw results with CI-produced results from the corrected workflow
4. Confirm ≥20% improvement in representative warm CI installs on paired same-runner trials
5. Confirm no critical-path duration regression

### Migration plan (if CI benchmark confirms)

1. **Commit 1: Dependency resolution** — pnpm-workspace.yaml, translated overrides,
   `onlyBuiltDependencies`, pnpm-lock.yaml, updated packageManager/engines, removed npm lockfiles
2. **Commit 2: Command migration** — package scripts, npx→pnpm exec, husky hooks,
   setup script
3. **Commit 3: Infrastructure** — GitHub Actions, Dependabot, Cloudflare PNPM_VERSION,
   documentation
