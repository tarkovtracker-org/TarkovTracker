# Game-data precompute

The scheduled and manually dispatched producer prepares neutral game catalogs and
English import snapshots for `TARKOV_DATA`. Production credentials are available
only to the trusted `main` workflow in the `production-precompute` environment.

## Release contents

A full run publishes ten neutral datasets for each of the three game modes
and one objective counts view per mode, plus a strings bundle per distinct
selectable API language. The current scope is 46 objects across 30 mode catalogs,
3 counts views, and 13 language bundles. Strings contain only references the final
adapted catalogs use and include English fallback for every mode.

Every object is gzip-compressed and addressed by SHA256 of its uncompressed UTF-8
JSON. The writer enforces size limits and reads stored bytes back before replacing
`neutral-catalog-v1-manifest`. That manifest includes the source-overlay SHA,
completion timestamp, object keys, uncompressed lengths, and overlay headers.
Failed staging preserves the previous complete manifest. Seven-day retention
bounds stored-object lifetime.

The same run refreshes three independent whole English import snapshots. Their
scope, age, progress-critical task/objective structure, and overlay provenance
remain independently validated. They use `tasks-import-json-v1-en-<mode>` keys.
The 48 legacy localized entries were retained through reader verification and
expire under their original TTL once the writer stops refreshing them.
The producer now refreshes only the neutral release and English import snapshots.

## Preseed and promote

1. Release the overlay producer's neutral sidecar alongside its existing artifact.
2. Merge the reviewed Tracker producer while the deployed reader still uses its
   previous contract.
3. Dispatch **Precompute Tarkov Data** on `main` with the legacy-overlay digest in
   `expectedOverlaySha` and both filters empty.
4. Inspect the uploaded `overlay-precompute-manifest` artifact. Require the matching
   `catalogRelease.overlaySha`, every catalog/language scope, successful readbacks,
   and all three import results before promoting the new reader.
5. Verify production with `pnpm run verify:overlay`. Allow 90 seconds after the
   successful pointer readback for KV propagation. Recheck the intended release
   before using **Purge Game Data**, then record the language-switch evidence.

A filtered maintenance run leaves the neutral manifest untouched. Preview namespaces
need their own complete release and imports. Use a reviewed producer with the
explicit preview namespace through an approved operator or broker path. Candidate
preview code receives no production credentials. Local Nuxt development without
KV uses the neutral builders directly through `devCatalog`; it needs the overlay
read token and does not certify a deployed release.

## Verification

`pnpm run verify:overlay` checks canonical production by default. Set
`TARKOV_OPERATIONS_ORIGIN` to the exact authorized HTTPS operations origin when
using paired `TARKOV_OPERATIONS_CLIENT_ID` and `TARKOV_OPERATIONS_CLIENT_SECRET`.
Redirects are rejected. `OVERLAY_TOKEN` supplies read-only access to the private
overlay. `EXPECTED_OVERLAY_SHA` can pin the release being certified.

The command requires a fresh published-overlay read and verifies the complete exact
scope set, a release timestamp no older
than 14 hours, matching published overlay, raw response digest and length,
`PRECOMPUTE` source, `no-store`, release timestamp, and overlay headers/body identity.
`STALE` fallback is a failed certification. It checks all three whole English import
responses separately. A changed manifest triggers one full retry; another change
fails. A unique private temporary report retains keys, digests, counts, and failure
reasons without raw private payloads. Missing data or any failed check exits nonzero.

## Files

| File                        | Responsibility                                             | Run by                                         |
| --------------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| `run.ts`                    | Trusted CLI and publication diagnostics                    | Precompute Tarkov Data workflow                |
| `precompute.ts`             | Catalog object TTL and English import filter validation    | run.ts and snapshot producers                  |
| `catalog-release.ts`        | Immutable object staging, readback, and pointer activation | run.ts                                         |
| `import-snapshots.ts`       | Whole English import generation and validation             | run.ts                                         |
| `kv.ts`                     | Bounded KV reads and writes                                | run.ts and catalog-release.ts                  |
| `check-overlay.ts`          | Served-release and import verification                     | pnpm run verify:overlay                        |
| `verify-catalog-release.ts` | Exact scope, digest, headers, age and source checks        | check-overlay.ts                               |
| `verify-overlay.ts`         | Whole English import comparison and freshness window       | check-overlay.ts and verify-catalog-release.ts |
| `nuxt-imports.ts`           | Standalone Nuxt import shim                                | Script TypeScript configuration                |
| `tsconfig.json`             | Standalone module aliases and compiler settings            | tsx and tsc                                    |
| `__tests__/`                | Producer and verifier regressions                          | Vitest                                         |

The complete architecture and release rules are in
[Overlay and precompute](../../docs/systems/overlay-and-precompute.md#precompute-workflow).
