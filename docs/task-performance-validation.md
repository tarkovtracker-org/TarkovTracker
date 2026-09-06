# Task performance validation (#444)

## Scope

This change fixes two task-page startup races. Nuxt Suspense mounts the
list in a detached tree. The sentinel's bounding rectangle is then zero, which previously
looked like a visible sentinel and exhausted eight auto-fill cycles before the first paint:
8 initial cards became 72. The layout guard preserves eight-card batches and resumes through
the existing intersection observer when the sentinel is actually rendered.

Separately, metadata can become ready before the debounced task filter refresh completes.
The page now keeps its loading state until that refresh settles, preventing a transient
"No tasks found" message and footer jump. Real empty results still render the empty state.

It does not change filtering, sorting, progress persistence, metadata scheduling, card defaults,
or Lighthouse CI thresholds. No migration, dependency, or deployment ordering is required.
Reverting the composable change restores the previous behavior.

## Reproduction and method

- Base: `1571da2182ef30d78a979d8a74a448e623dda414`, September 6, 2026.
- Build both revisions with Node 24.19.0, the frozen lockfile, `CI=true`,
  `NUXT_PUBLIC_PROMOTED_TWITCH_ENABLED=false`, and the same `APP_URL`; run `pnpm run build`.
- Serve each built `dist` locally. The comparison used a static preview with gzip and a replay
  proxy for public `/api/tarkov/*` responses captured from production on September 6. Keep
  exactly the same response bodies across revisions; do not benchmark empty/error screens.
- Use an isolated Chrome 149.0.7827.200 profile and a local `*.pages.dev` hostname mapped to loopback to
  exercise the existing offline preview fallback. This measures guest progress; it does not
  exercise authenticated Supabase synchronization. No production credentials are needed.
- Desktop trace: 1440 × 900, 4× CPU throttling, unthrottled network. First visit primes the
  browser's metadata cache; reload without clearing it for the warm sample. Wait 15 seconds
  after cards appear, recording `longtask`, `layout-shift`, and first rendered card count.
  Repeat with three independent profiles for each revision, without builds/tests competing
  for CPU. Also check a 412 × 823 mobile viewport.
- Lighthouse: version 13.4.1, three fresh profiles per revision, default simulated mobile
  throttling, performance category. These cold-load scores are not comparable to the original
  issue's historical report or to a different GitHub runner.
- Instrumenting the baseline's `getBoundingClientRect` confirmed nine consecutive warm-cache
  sentinel checks with `isConnected=false`, no client rectangles, and `top=0` before paint.

Useful response fingerprints (SHA-256 prefixes): tasks-core `6d8940f89f17`, items-lite
`625c4c63ec7e`, regular objectives `c925244c5d21`, rewards `84fc091370f6`.

## Acceptance policy

For this fix, a warm-cache page must not spend its auto-load budget on a detached or hidden
sentinel, or flash an empty result before the first filter refresh settles. At the desktop test viewport with default expanded cards, initial rendering must
remain eight cards; scrolling must load further batches. Compare repeated warm-load blocking
work and first-card appearance, not only a cold navigation score.

The cold-load non-regression budget is median TBT no more than the baseline plus the greater
of 100 ms or 10%, LCP within 10%, and mobile Lighthouse CLS below 0.1. This is a controlled
comparison budget, not a new universal performance floor. Keep the existing warning-only
0.20 performance floor and single-run collection in PR CI; dedicated investigations use
repeated runs. The historical 0.55 threshold is not a closure test for this patch.

Issue #444 should remain open for cold-load investigation: expanded desktop cards still shift
as deferred objectives/rewards arrive. A complete resolution needs those shifts addressed,
representative persisted/team progress measurements, and a broader performance budget. Passing
CI or this warm-cache regression check does not prove those remaining goals are complete.

## Measured results

Three independent warm-cache desktop profiles per revision:

| Metric                                        | Baseline runs            | Fixed runs               | Median change |
| --------------------------------------------- | ------------------------ | ------------------------ | ------------- |
| Initial cards                                 | 72 / 72 / 72             | 8 / 8 / 8                | 89% fewer     |
| First frame with cards (ms)                   | 3211 / 3192 / 3490       | 1170 / 1113 / 1324       | 64% earlier   |
| Blocking portions of observed long tasks (ms) | 6896 / 6480 / 6945       | 1061 / 1044 / 1128       | 85% lower     |
| Longest main-thread task (ms)                 | 2150 / 2133 / 2378       | 383 / 372 / 453          | 82% shorter   |
| Observed layout-shift sum                     | 0.0361 / 0.0361 / 0.0361 | 0.0361 / 0.0361 / 0.0361 | Unchanged     |

“Blocking portions” sums `max(duration - 50, 0)` across observed long tasks through the
15-second settling window after cards first appear. It is **not Lighthouse TBT**, which has
its own measurement window and simulated throttling. First-card appearance is a DOM/animation
frame observation, not LCP or a guarantee that all deferred objectives have loaded.

An intermediate build with only the sentinel guard exposed the independent empty-state race:
one warm desktop run showed the footer at 516 px before the first cards and layout-shift sum
0.3964; mobile showed 0.4020. The final readiness gate removed that transient empty state in
all three final desktop runs. These intermediate values are diagnostic observations, not
additional baseline samples.

The method follows Chrome's guidance to investigate actual layout-shift sources and compare
performance distributions under consistent conditions:
[layout shift diagnosis](https://web.dev/articles/optimize-cls) and
[Lighthouse score variability](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring).

Cold mobile Lighthouse runs:

| Metric            | Baseline runs               | Fixed runs                  |
| ----------------- | --------------------------- | --------------------------- |
| Performance score | 0.45 / 0.48 / 0.45          | 0.48 / 0.48 / 0.46          |
| TBT (ms)          | 723 / 552 / 709             | 582 / 572 / 652             |
| LCP (ms)          | 9273 / 9270 / 9279          | 9274 / 9273 / 9270          |
| CLS               | 0.00205 / 0.00205 / 0.00205 | 0.00205 / 0.00205 / 0.00205 |

Median Lighthouse TBT fell from 709 to 582 ms; LCP was effectively unchanged. These pass the
comparison budgets above. The real-time 4× CPU traces still show deferred-content movement:
final cold desktop layout-shift sums were 0.1010, 0.1319, and 0.1010; the final mobile probe
was 0.2586 cold and 0.1075 warm. None of the final probes flashed the empty state. These are
why the broader CLS work in #444 remains open despite the low Lighthouse CLS.

## Functional validation

- Production build, repository lint, typecheck, and systems drift check passed.
- Nine focused Vitest files passed (129 tests), covering infinite scroll, tasks/Hideout/Needed
  Items pages, task filtering, page effects, task actions, deep links, and objective visibility.
- The new infinite-scroll tests failed on the original implementation for detached/hidden
  sentinels and for losing layout during auto-fill, then passed with the guard.
- Browser interaction checks passed for warm initial rendering, scroll loading (8 → 16 cards),
  collapse/expand, pin/unpin, search/clear, task deep links, and completion/undo.
- Authenticated team synchronization was not exercised in the offline preview. Existing team
  filtering and teammate map-marker regressions are covered by the focused tests.
