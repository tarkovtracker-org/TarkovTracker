# Task performance validation (#444)

This records the #808 baseline and the [follow-up validation and closure policy](#follow-up-complete-initial-task-cards).

## #808: warm-cache startup fix

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

## #808 acceptance policy

For this fix, a warm-cache page must not spend its auto-load budget on a detached or hidden
sentinel, or flash an empty result before the first filter refresh settles. At the desktop test viewport with default expanded cards, initial rendering must
remain eight cards; scrolling must load further batches. Compare repeated warm-load blocking
work and first-card appearance, not only a cold navigation score.

The cold-load non-regression budget is median TBT no more than the baseline plus the greater
of 100 ms or 10%, LCP within 10%, and mobile Lighthouse CLS below 0.1. This is a controlled
comparison budget, not a new universal performance floor. Keep the existing warning-only
0.20 performance floor and single-run collection in PR CI; dedicated investigations use
repeated runs. The historical 0.55 threshold is not a closure test for this patch.

At the merge of #808, issue #444 remained open: expanded desktop cards still shifted as deferred
objectives/rewards arrived. The follow-up below addresses those shifts, edition eligibility,
representative persisted/team rendering, and the broader measurement policy. The #808 checks
alone were not a closure claim.

## #808 measured results

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
why #808 did not close the broader CLS work in #444 despite its low Lighthouse CLS.

## #808 functional validation

- Production build, repository lint, typecheck, and systems drift check passed.
- Nine focused Vitest files passed (129 tests), covering infinite scroll, tasks/Hideout/Needed
  Items pages, task filtering, page effects, task actions, deep links, and objective visibility.
- The new infinite-scroll tests failed on the original implementation for detached/hidden
  sentinels and for losing layout during auto-fill, then passed with the guard.
- Browser interaction checks passed for warm initial rendering, scroll loading (8 → 16 cards),
  collapse/expand, pin/unpin, search/clear, task deep links, and completion/undo.
- Authenticated team synchronization was not exercised in the offline preview. Existing team
  filtering and teammate map-marker regressions are covered by the focused tests.

Additional browser checks passed for Hideout scrolling (14 → 20 stations), Needed Items
scrolling (36 → 60 entries), graph and map routes, and PvP → PvE → Seasonal → PvP transitions.
Paired real-time mobile traces reproduced the same cold layout-shift values on both revisions
(0.2204 and 0.2586, in different run order); warm layout-shift sum remained 0.1075. The fixed
mobile runs rendered eight initial cards rather than the baseline's 72, without empty-state
flashes. These checks produced no uncaught browser exceptions.

The Cloudflare build/deployment also passed. Its hosted preview requires Cloudflare Access;
the interaction checks above used the local production build, not an authenticated hosted
preview session.

## Follow-up: complete initial task cards

The follow-up compares main `8f0c63896ffa8df08d40df241474dcc0e21701c2` (the merged #808
implementation) with implementation commit `fa6f422b092a3b2546b6bf595304d1e71c7a5917`.
The measurements below identify the initial implementation; the review corrections and their
validation are recorded separately below. The same production-build method and public API
response replay described above are used. The subsequent main release commit changes the
version only.

### Cause and behavior

Three asynchronous changes affected the first visible list: objective skeleton replacement,
reward-summary insertion, and edition eligibility arriving after filtering. A frame-by-frame
trace of the intermediate follow-up showed Shooting Cans replaced by Shady Contractor once
edition data arrived. Waiting for objectives/rewards alone therefore did not fix cold CLS.

`useTaskDetailReadiness` requests objectives, rewards, and editions concurrently once core
metadata is ready. It also waits for background edition revalidation and objective mode-count
metadata, including one retry if hydration discarded an in-flight count request. The tasks page
filters after these settle and presents complete cards together. It uses the existing cache, deduplication, and response-context guards; other
routes retain deferred loading. No card expansion defaults, task eligibility rules, batch sizes,
progress persistence, or remote data contracts change.

The wait is bounded at **three seconds after core readiness**. Failures release the page;
stalled requests continue in the background after the bound. This intentionally favors usable
navigation over stable layout during an outage. A mode/locale change or core reload invalidates
an earlier wait, including cached core replacements tracked by `tasksCoreRevision`; unmount
clears timers. Filter refresh generations prevent an older async
completion from releasing a newer loading cycle. Its regression test failed before the guard.

### Measurement policy for closing #444

Keep the existing warning-only 0.20 CI score floor, single collection, and standard simulated
mobile throttling. Shared-runner scores are a smoke signal, not an application readiness test;
the historical 0.55 gate is deliberately not restored. For task performance changes:

- Use three independent profiles per comparison scenario, with identical public API responses,
  viewport, CPU settings, and build configuration. Include guest, persisted progress, and team
  rendering; include cold and warm caches. Do not run builds/tests alongside measurements.
- Collect Lighthouse with `pauseAfterFcpMs: 5000` and `pauseAfterLoadMs: 5000` for both revisions.
  Verify that objectives, rewards, and edition eligibility were included before interpreting
  the score. Extend collection if the specific environment has not reached that state.
- Require observed layout-shift sums below **0.1** in successful-load desktop/mobile probes,
  through 15 seconds after cards appear. Summing all shifts is at least as strict as the CLS
  session-window maximum. Failure/stall fallbacks are availability tests, not CLS claims.
- Require median full-window mobile Lighthouse TBT no more than the baseline plus the greater
  of **100 ms or 10%**. Compare first **settled complete cards** in the real-time traces with
  the same tolerance. Also report first incomplete cards, FCP, LCP, and its candidate so a
  loading-state change cannot masquerade as faster useful content.
- Keep task filtering, paging, progress actions, deep links, game modes, and graph/map routes
  functional. Exercise delayed/failed detail requests and obsolete refresh completion.

This replaces #808's narrow cold-navigation comparison budget for issue closure. It does not
claim that the application has reached ideal mobile performance or that arbitrary slow-network
loads will have no shifts after the availability fallback.

### Why default Lighthouse was misleading

The original default collection on #808 ended before objectives/rewards requests. Its LCP node
was the header search text. A fresh follow-up default collection includes task content and
reports a lower score (0.40 versus #808's 0.48 median) and higher LCP. Extending both collection
windows exposes main's deferred CLS and CPU work:

| Extended mobile Lighthouse | Main runs                | Follow-up runs           |
| -------------------------- | ------------------------ | ------------------------ |
| Performance score          | 0.26 / 0.27 / 0.28       | 0.41 / 0.41 / 0.40       |
| TBT (ms)                   | 1150 / 1077 / 923        | 969 / 945 / 1024         |
| CLS                        | 0.2565 / 0.2565 / 0.2565 | 0.0020 / 0.0020 / 0.0020 |
| FCP (ms)                   | 4973 / 5050 / 5048       | 5042 / 5042 / 5045       |
| LCP (ms)                   | 9277 / 9288 / 9285       | 23359 / 23359 / 23284    |

Median full-window TBT improves about 10%; FCP is effectively unchanged. **LCP is higher**:
main's candidate remains header search text, while the follow-up candidate is a visible task
objective. Do not describe this as an LCP improvement. The new readiness boundary delays the
first incomplete cards in exchange for a stable, complete list; compare the actual settled-card
timings below. Large game-data downloads and long main-thread tasks remain optimization
opportunities even after these startup defects are fixed.

### Representative rendering fixtures

The persisted fixture uses a guest-owned localStorage envelope, level 40, and 120 completed
low-level task IDs selected from the production task dataset. The team fixture adds three
synthetic teammates at levels 25/30/35 with 50/70/90 completed tasks, using the application's
teammate progress event and real stores, with the All users filter. Browser assertions verify
these stores and progress values. Fixtures use no private user data or production credentials.
This validates team rendering/filtering cost, not authenticated Supabase transport; those
contracts are unchanged and remain covered by their existing tests.

### Guest traces

Three follow-up profiles per viewport, with eight complete initial cards in every run:

| Real-time trace | Main shift sums          | Follow-up shift sums     | Main median first / settled cards (ms) | Follow-up median first complete cards (ms) |
| --------------- | ------------------------ | ------------------------ | -------------------------------------- | ------------------------------------------ |
| Desktop cold    | 0.1010 / 0.1319 / 0.1010 | 0.0009 / 0.0009 / 0.0009 | 2318 / 3740                            | 3324                                       |
| Desktop warm    | 0.0361 / 0.0361 / 0.0361 | 0.0002 / 0.0002 / 0.0002 | 1170 / 2524                            | 2008                                       |
| Mobile cold     | 0.2586 / 0.2204 / 0.2204 | 0.0020 / 0.0020 / 0.0020 | 2345 / 3693                            | 3155                                       |
| Mobile warm     | 0.1075 / 0.1075 / 0.1075 | 0 / 0 / 0                | 1130 / 2507                            | 1969                                       |

The main guest traces retain the #808 final-build samples (identical executable behavior to
its squash merge), plus a fresh paired mobile profile; all fixture and follow-up samples were
collected anew. “Settled” is the final card/height frame in the no-input settling window.
The follow-up has one such frame: no skeleton replacement, reward insertion, or edition-driven
card replacement after first display. Complete cards appear 11–21% earlier at the median,
although the first incomplete cards previously appeared sooner.

Warm desktop observed blocking portions were 1065 / 1346 / 1107 ms, compared with
1061 / 1044 / 1128 ms on main (median about 4% higher). The grouped initial render can produce
longer individual tasks; this change fixes layout/readiness, not every source of main-thread
work. Full-window Lighthouse TBT and the complete-card timing pass the stated comparison
budgets. No transient empty-state frames were observed.

### Persisted/team mobile traces

Three fresh profiles per fixture and revision:

| Fixture        | Main shift sums          | Follow-up shift sums     | Median settled cards (ms) |
| -------------- | ------------------------ | ------------------------ | ------------------------- |
| Persisted cold | 0.1818 / 0.1524 / 0.1524 | 0.0020 / 0.0020 / 0.0020 | 4036 → 3414               |
| Persisted warm | 0.0699 / 0.0699 / 0.0699 | 0.0000 / 0.0000 / 0.0000 | 2640 → 2029               |
| Team cold      | 0.0540 / 0.0540 / 0.0540 | 0.0020 / 0.0020 / 0.0020 | 4007 → 3327               |
| Team warm      | 0.0519 / 0.0519 / 0.0519 | 0.0000 / 0.0000 / 0.0000 | 2742 → 2081               |

All fixture values were checked against the live store snapshots. These runs pass the layout
and settled-card budgets without changing the selected progress or task filters.

### Follow-up functional validation

The initial implementation passed production build, lint, typecheck, systems drift check, and
eight focused Vitest files (123 tests). Coverage includes readiness settlement, failures, the three-second timer,
mode/locale changes, core reloads, unmount cleanup, and stale filter refreshes, plus existing
filtering, actions, deep-link, infinite-scroll, and objective visibility regressions.

Real-browser checks passed for paging, collapse/expand, pin/unpin, search/clear, task deep
links, completion/undo, Hideout/Needed Items scrolling, graph/map routes, and PvP/PvE/Seasonal
switching. A stalled detail request released the gate after its three-second timer (about
3.2 seconds including filtering/rendering on the test machine); rejected requests released it
promptly. Both retained interactive cards. Teammate selection and hide/show were checked with
a synthetic identity on the offline client; no authenticated network access was involved.
Desktop/mobile screenshots were inspected. Local CodeRabbit review raised one stale-refresh
finding, which the generation guard and failing-then-passing regression test address.

### Review corrections and repeated validation

Review identified three additional initial-render races: cached core replacements without a
loading transition, background edition revalidation after a cache hit, and deferred objective
mode-count badges. Core revisions now re-arm readiness, and the gate includes edition
revalidation and count metadata. Edition promise/loading cleanup is identity-guarded so an
older request cannot clear the current request's tracking. Empty-to-populated core recovery is
covered as well. The three-second availability timer still bounds all optional waits.

The corrected production build at `98991762f91d0b46e1998f264eeb4ac0a51e0a22` was measured
again on September 6 using the same response
replay, viewports, throttling, and three independent profiles per scenario. These are separate
from the initial implementation samples above. All runs displayed eight initial cards and no
transient empty state.

| Scenario         | Cold shift sums          | Warm shift sums          | Median settled cards, cold / warm (ms) |
| ---------------- | ------------------------ | ------------------------ | -------------------------------------- |
| Guest desktop    | 0.0009 / 0.0009 / 0.0009 | 0.0002 / 0.0002 / 0.0002 | 3266 / 2109                            |
| Guest mobile     | 0.0020 / 0.0020 / 0.0020 | 0 / 0 / 0                | 3330 / 1924                            |
| Persisted mobile | 0.0020 / 0.0020 / 0.0020 | 0 / 0 / 0                | 3560 / 1960                            |
| Team mobile      | 0.0020 / 0.0020 / 0.0020 | 0 / 0 / 0                | 3479 / 2120                            |

All layout and settled-card timing budgets still pass against main. The corrected build's
median complete-card appearance is 10–26% earlier than main across these scenarios. This
retains the tradeoff above: first incomplete cards previously appeared sooner.

The corrected build's extended mobile Lighthouse runs were score **0.41 / 0.40 / 0.41**,
TBT **987 / 1034 / 978 ms**, CLS **0.0020 / 0.0020 / 0.0020**, FCP
**4972 / 5042 / 5046 ms**, and LCP **23357 / 23356 / 23363 ms**. Median TBT is about 8%
below main's 1077 ms and passes the budget. The LCP candidate/tradeoff remains unchanged.

The review corrections passed 11 focused Vitest files (145 tests), typecheck, and production
build. Cached-core, edition-revalidation, count-metadata, and edition-deduplication
regressions failed before their corresponding fixes. Page tests now independently delay
objectives, rewards, and editions. Local CodeRabbit's second review
identified the edition loading cleanup race, now covered by a concurrent-request test.

Browser checks repeated successfully on the corrected build: all task controls and shared
routes listed above, mode switching, and teammate selection/hide/show. Deterministic delayed
actions in the production browser also verified cached core replacement, empty-core recovery,
edition revalidation, and count metadata: cards stayed hidden until settlement, then eight
appeared. Stalled requests released usable cards about 3.2 seconds after core readiness;
rejections released them promptly. No uncaught browser exceptions were observed.

### Final review edge cases

Subsequent review added item-lite hydration to the readiness wait and connected deep-link
handling to the combined page loading state. Count metadata now explicitly returns `stale`
when discarded, so the single retry does not repeat handled network failures. Obsolete edition
cache reads, responses, and errors are ignored before they can change eligibility or cached
payloads. Request registration precedes execution, including synchronous network failures.

The final corrections passed 12 focused Vitest files (158 tests), lint, typecheck, and Fallow.
Regression tests reproduced the item wait, premature deep-link handling, failure retry, and
obsolete edition response/error problems before their fixes. Reverse-order response tests also
verify that newer edition state and its cache write survive an older request's completion.

The final production browser checks also passed, including a deep link activated during a
1.5-second cached-detail delay. All task/shared-route controls were repeated. Three fresh
mobile profiles recorded cold shift sums **0.0020 / 0.0020 / 0.0020** and warm sums **0 / 0 / 0**;
complete cards appeared at **3250 / 3210 / 3058 ms** cold and **1966 / 1998 / 1902 ms** warm.
A final team cold/warm smoke repeat also retained eight cards and shift sums of **0.0020 / 0**.
The broader desktop/persisted/team comparison remains the explicitly identified revision above.

Final extended Lighthouse runs were score **0.40 / 0.42 / 0.41**, TBT **1009 / 910 / 946 ms**,
CLS **0.0020 / 0.0020 / 0.0020**, FCP **5043 / 5043 / 5045 ms**, and LCP
**23357 / 23281 / 23360 ms**. Median TBT is about 12% below main; the layout and timing budgets
still pass. The reported LCP tradeoff remains and is not described as an improvement.
