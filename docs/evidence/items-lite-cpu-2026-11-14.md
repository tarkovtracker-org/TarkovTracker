# Items-lite cold-path CPU evidence

Baseline: `23952e67b155196c4ca67c8461dbcf11c1f56305`. Measurements collected on 2026-11-14.

## Production reproduction

Three ordinary French items-lite GETs, one per mode, returned HTTP 200 with both CDN and
application cache status `MISS`. A sanitized deployment tail matched the requests by method,
locale, mode and a fixed public probe user agent:

| Mode     | Worker CPU | Worker wall time |
| -------- | ---------: | ---------------: |
| Regular  |     422 ms |         1,061 ms |
| PvE      |     417 ms |           932 ms |
| Seasonal |     460 ms |         1,008 ms |

Immediate repeat GETs and HEADs were CDN hits and did not invoke the Worker. A CDN hit can replay
the originally stored `X-Cache-Status: MISS`; that header alone does not count new Worker misses.
No cache purge, bypass flag, production configuration or production data write was used.

## Confirmed avoidable work

A cold request decodes an approximately 17.3 MB upstream catalog, localizes it, adapts the
items, applies overlays and serializes the approximately 7.8 MB result. Sampled local CPU
profiles identify translation traversal, item-reference expansion, URL validation and JSON
processing as significant work. The lite adapter expanded 6,139 contained-item references and
categories that it then discarded. Localization also traversed descriptions and five top-level
catalogs absent from the lite result.

The fix returns before full-only expansion and omits only six exact unused translation
declarations. Retained properties/default presets, URL checks, unknown or overlapping paths,
English fallback and full-items behavior remain intact. Shared upstream envelopes are not mutated.

## Controlled before/after CPU

Actual route, H3, fetch/translation/adapter/overlay/cache helpers in project-pinned local workerd.
The same captured public input JSON was decoded on each miss. The overlay was a valid synthetic
fixture; assertions required its cached version marker. A consuming synthetic Cache API drained
each write. Both response bodies had identical SHA-256 hashes before and after the change.

CPU is Windows `TotalProcessorTime` summed over the isolated user-worker and Wrangler proxy
workerd processes, not elapsed request time. Six paired batches of eight cold operations per
variant and locale alternated execution order. Profiles were collected separately from timed
CPU trials. The numbers below are medians of per-operation batch CPU:

| Cold route handler through H3      |     Before |      After | Reduction |
| ---------------------------------- | ---------: | ---------: | --------: |
| English                            | 216.797 ms | 175.781 ms |     18.9% |
| French, including English fallback | 277.344 ms | 216.797 ms |     21.8% |

English batch CPU ranges were 193.359–244.141 ms before and 158.203–189.453 ms after. French
ranges were 228.516–320.313 ms before and 191.406–281.250 ms after. Cold elapsed medians were
183.428 → 144.151 ms for English and 234.971 → 199.472 ms for French.

The cache-hit branch was not changed. Its local harness CPU medians varied from 12.500 →
13.281 ms (English) and 13.021 → 15.365 ms (French); no warm-hit improvement is claimed.
The harness buffers bodies for comparison and includes proxy/GC CPU, so these small warm
measurements are not production streaming latency measurements.

These are **local CPU measurements, not production billed CPU or a production savings estimate**.
They exclude network waiting, production middleware, real private-overlay download/validation
and deployment startup.
The fix removes confirmed wasted work; legitimate cold decoding/localization/overlay work remains,
so it does not guarantee elimination of every CPU spike.

## Correctness checks

- Seven performance regression cases failed on unchanged baseline; compatibility cases passed.
- Three modes × English/French × pipeline/actual route: twelve byte-identical before/after
  comparisons using fresh public upstream fixtures, including valid synthetic overlay metadata.
- Tests cover retained properties and default presets, URL sanitization, primary/English
  fallback, unfamiliar/overlapping paths, full route behavior and concurrent full/lite locale
  consumers sharing one unmodified upstream envelope.
- Cache keys, TTLs, stale refresh, bypass authorization and HEAD routing are unchanged.
