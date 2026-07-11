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
| Worker `ajv: ^8.18.0`                                     | `api-gateway>ajv: ^8.18.0`                     | YES — `ajv@8.20.0`                                    |
| Worker `esbuild: ^0.28.1`                                 | global `esbuild: ^0.28.1`                      | YES — `esbuild@0.28.1`                                |
| All other Socket Registry substitutions                   | same syntax                                    | YES — all active                                      |

### Peer-dependency warnings

Only 2 pre-existing warnings (not caused by migration):

- `@json-render/core`: unmet peer `zod@^4.0.0` (found 3.25.76)
- `@json-render/ink`: unmet peer `ink@^6.0.0` (found 7.0.1)

### Build scripts

pnpm blocked 6 build scripts by default:

- `@parcel/watcher`, `esbuild`, `sharp`, `unrs-resolver`, `vue-demi`, `workerd`

These need `pnpm approve-builds` in a real migration. Build and tests pass without them,
but `workerd` is needed for `wrangler pages dev` in the pr-checks workflow.

### No compatibility flags needed

- `shamefullyHoist`: NOT enabled
- No peer-dependency suppression
- No broad compatibility workarounds

## Part 4: pnpm Validation Matrix

All pnpm validation checks pass. See Part 1 table above.

## Part 5: Dependency Comparison

### Direct dependency versions

| Package               | npm resolved | pnpm resolved | Match |
| --------------------- | ------------ | ------------- | ----- |
| nuxt                  | 4.4.8        | 4.4.8         | YES   |
| vue                   | 3.5.39       | 3.5.39        | YES   |
| @nuxt/ui              | 4.9.0        | 4.9.0         | YES   |
| @supabase/supabase-js | 2.103.0      | 2.103.0       | YES   |
| vitest                | 4.1.9        | 4.1.9         | YES   |
| eslint                | 10.6.0       | 10.6.0        | YES   |
| typescript            | 5.9.3        | 5.9.3         | YES   |
| tailwindcss           | 4.3.1        | 4.3.1         | YES   |
| wrangler              | 4.105.0      | 4.105.0       | YES   |
| pinia                 | 3.0.4        | 3.0.4         | YES   |
| vue-i18n              | 11.4.6       | 11.4.6        | YES   |
| @nuxtjs/i18n          | 10.4.0       | 10.4.0        | YES   |
| h3                    | 1.15.11      | 1.15.11       | YES   |

### Version differences

37 packages have different version sets. These are all cases of pnpm deduplicating
more aggressively (fewer duplicate versions hoisted) or platform-specific packages
that npm doesn't list on linux but pnpm includes in the lockfile. No security-critical
or override-targeted package has an unexpected version difference.

### Summary

- npm unique packages: 1664
- pnpm unique packages: 978 (fewer due to better deduplication)
- All overridden packages: verified identical
- All Socket Registry substitutions: verified active
- All direct dependencies: verified identical
- No direct dependency disappeared due to hoisting differences

## Part 3: Benchmark Results

**Environment:** WSL2 (Linux 6.6.87.2-microsoft-standard-WSL2), Node 24.12.0
**Runs per scenario:** 5
**Caveat:** npm and pnpm benchmarks ran concurrently with some mutual interference.
Raw results in `npm-results.json` and `pnpm-results.json`. CI numbers still needed
for authoritative results, but the magnitude is clear.

### Root install — per scenario

| Scenario         | npm median (ms) | pnpm median (ms) | Improvement |
| ---------------- | --------------- | ---------------- | ----------- |
| cold, scripts    | 21,144          | 6,663            | **68%**     |
| warm, scripts    | 14,654          | 3,090            | **79%**     |
| cold, no scripts | 18,166          | 4,801            | **74%**     |
| warm, no scripts | 13,554          | 1,772            | **87%**     |

### Worker install — per scenario

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

### Real-world CI comparison: npm (root + worker) vs pnpm (single workspace install)

In CI, npm requires two separate installs (root + worker). pnpm's unified workspace
needs one install that covers both.

| Scenario         | npm root+worker (ms) | pnpm single (ms) | Improvement |
| ---------------- | -------------------- | ---------------- | ----------- |
| cold, scripts    | 23,388               | 6,663            | **72%**     |
| warm, scripts    | 16,233               | 3,090            | **81%**     |
| cold, no scripts | 20,327               | 4,801            | **76%**     |
| warm, no scripts | 15,094               | 1,772            | **88%**     |

### Disk usage

| Manager      | root node_modules | worker node_modules                      |
| ------------ | ----------------- | ---------------------------------------- |
| npm 11       | 1,087 MB          | 236 MB (separate)                        |
| pnpm 10.34.5 | 812 MB            | shared (workspace)                       |
| **Saving**   | **275 MB (25%)**  | **-576 MB** (but shared, not duplicated) |

### Interpretation

- Root install improvement: **68-87%** across all scenarios
- Real-world CI improvement (root+worker vs single workspace): **72-88%**
- Disk saving on root: **25%** (1,087 MB → 812 MB)
- Worker-only install is slower with pnpm, but this is misleading — a unified
  workspace install covers both in one pass
- WSL2 filesystem may amplify pnpm's hard-linking advantage; CI numbers on
  `ubuntu-24.04` will be more conservative but the margin is large enough to
  confidently exceed the 20% threshold

## Part 6: Recommendation

### Decision criteria

| Criterion                    | Result                                                           |
| ---------------------------- | ---------------------------------------------------------------- |
| Linked probe                 | Failed (upstream ghost dep in nuxt-define) — but pnpm handles it |
| pnpm needs shamefullyHoist   | NO                                                               |
| Validation differs           | NO — all checks pass                                             |
| Overrides cannot be proven   | NO — all verified                                                |
| Measured improvement (local) | 72-88% real-world CI install, 25% disk                           |
| CI benchmark                 | Workflow on branch; requires merge to main to trigger            |

### Preliminary assessment

pnpm 10.34.5 is technically compatible with this repository:

1. All validation passes without compatibility flags
2. All overrides and security substitutions are preserved
3. All direct dependencies resolve to the same versions
4. The ghost dependency that broke the linked probe does NOT break pnpm
5. No `shamefullyHoist` or peer-dep suppression needed
6. Local benchmarks show 68-87% install time improvement

### Recommendation: PROCEED (pending CI benchmark confirmation)

Based on the evaluation:

- **Technical compatibility:** Confirmed — all validation passes
- **Override preservation:** Confirmed — all security and compatibility overrides verified
- **Performance:** Local benchmarks far exceed the 20% threshold
- **No compatibility flags needed:** No shamefullyHoist, no peer-dep suppression

**Next steps:**

1. Run the `package-manager-benchmark.yml` workflow to get CI numbers
2. If CI confirms >20% improvement: proceed with migration
3. If CI shows <15%: remain on npm despite local numbers
4. If 15-20%: decide based on workspace growth expectations

### Migration plan (if CI benchmark confirms)

1. **Commit 1: Dependency resolution** — pnpm-workspace.yaml, translated overrides,
   pnpm-lock.yaml, updated packageManager/engines, removed npm lockfiles
2. **Commit 2: Command migration** — package scripts, npx→pnpm exec, husky hooks,
   setup script
3. **Commit 3: Infrastructure** — GitHub Actions, Dependabot, Cloudflare PNPM_VERSION,
   documentation
4. **Separate follow-up:** `pnpm approve-builds` for esbuild, sharp, workerd, etc.
