# CI turnaround baseline — 2026-09-06

Collected 2026-09-06T11:46:56.240Z from the 20 most recent main PR merges at or before 2026-09-06T12:00:00Z.

Reproduce with `node scripts/workflow-metrics.mjs --before 2026-09-06T12:00:00Z`.
This is the pre-rollout baseline; record the actual rollout timestamp before collecting the next 20 merges.

| Category      | PRs | CI runs | First CI attempt passed | Median CI minutes/run | Median runner minutes/run |
| ------------- | --: | ------: | ----------------------: | --------------------: | ------------------------: |
| documentation |   2 |       4 |                     2/2 |                  3.19 |                     18.22 |
| executable    |  17 |      87 |                   13/17 |                  3.07 |                     17.73 |
| translations  |   1 |       0 |                     0/0 |           Unavailable |               Unavailable |

## Per-PR observations

| PR                                                                  | Category      | CI runs | Total CI runner minutes | Median CI minutes/run | Median release minutes/run |
| ------------------------------------------------------------------- | ------------- | ------: | ----------------------: | --------------------: | -------------------------: |
| [#781](https://github.com/tarkovtracker-org/TarkovTracker/pull/781) | executable    |      12 |                  214.12 |                  3.10 |                      10.35 |
| [#802](https://github.com/tarkovtracker-org/TarkovTracker/pull/802) | executable    |       2 |                   36.58 |                  3.03 |                       9.35 |
| [#800](https://github.com/tarkovtracker-org/TarkovTracker/pull/800) | executable    |       5 |                  108.00 |                  3.18 |                      10.22 |
| [#801](https://github.com/tarkovtracker-org/TarkovTracker/pull/801) | documentation |       1 |                   18.45 |                  3.20 |                Unavailable |
| [#799](https://github.com/tarkovtracker-org/TarkovTracker/pull/799) | documentation |       3 |                   54.27 |                  3.18 |                Unavailable |
| [#786](https://github.com/tarkovtracker-org/TarkovTracker/pull/786) | executable    |      22 |                  398.28 |                  3.15 |                      10.33 |
| [#796](https://github.com/tarkovtracker-org/TarkovTracker/pull/796) | executable    |       2 |                   51.93 |                  2.85 |                       9.58 |
| [#748](https://github.com/tarkovtracker-org/TarkovTracker/pull/748) | executable    |      12 |                  183.08 |                  2.89 |                      10.15 |
| [#794](https://github.com/tarkovtracker-org/TarkovTracker/pull/794) | executable    |       2 |                   36.00 |                  3.24 |                       8.08 |
| [#791](https://github.com/tarkovtracker-org/TarkovTracker/pull/791) | executable    |       2 |                   34.08 |                  3.05 |                       9.92 |
| [#790](https://github.com/tarkovtracker-org/TarkovTracker/pull/790) | executable    |       3 |                   40.65 |                  3.08 |                      11.08 |
| [#787](https://github.com/tarkovtracker-org/TarkovTracker/pull/787) | executable    |       3 |                   52.55 |                  3.18 |                       8.07 |
| [#784](https://github.com/tarkovtracker-org/TarkovTracker/pull/784) | executable    |       3 |                   52.52 |                  3.03 |                       9.98 |
| [#789](https://github.com/tarkovtracker-org/TarkovTracker/pull/789) | executable    |       1 |                   16.52 |                  3.90 |                Unavailable |
| [#788](https://github.com/tarkovtracker-org/TarkovTracker/pull/788) | executable    |       1 |                   18.18 |                  3.45 |                Unavailable |
| [#770](https://github.com/tarkovtracker-org/TarkovTracker/pull/770) | translations  |       0 |             Unavailable |           Unavailable |                       9.55 |
| [#785](https://github.com/tarkovtracker-org/TarkovTracker/pull/785) | executable    |       1 |                   16.83 |                  2.83 |                      10.07 |
| [#778](https://github.com/tarkovtracker-org/TarkovTracker/pull/778) | executable    |      13 |                  230.90 |                  3.00 |                       9.87 |
| [#783](https://github.com/tarkovtracker-org/TarkovTracker/pull/783) | executable    |       2 |                   32.00 |                  2.71 |                       9.25 |
| [#780](https://github.com/tarkovtracker-org/TarkovTracker/pull/780) | executable    |       1 |                   16.62 |                  2.72 |                      10.07 |

## Interpretation limits

- First-pass success refers only to the earliest CI run’s first attempt, not every external PR check.
- GitHub omitted historical PR associations. CI runs are inferred from matching head repository, branch, and PR lifetime; branch reuse can make this imperfect.
- CI durations use workflow start and update timestamps as a completion proxy. Runner minutes sum executed job durations across attempts; they are not rounded billing minutes.
- No translation CI runs were observed under the former path exclusions. Do not treat this as a successful first pass or compare it directly with the new always-reporting shadow rollout.
- Correction pushes, review-to-correction delay, and agent usage are unavailable from this collection. Commit counts are not used as substitutes.
- No API collection failures occurred. Missing release samples may reflect documentation exclusions or commits without a release run.
- Compare the next 20 PRs by category and report sample sizes. A 30% improvement is an objective, not a proven saving.
