# Game-data precompute

The scheduled and manually dispatched producer prepares neutral game catalogs and
English import snapshots for `TARKOV_DATA`. Production credentials are available
only to the trusted `main` workflow in the `production-precompute` environment.

## Release contents

A full run publishes ten neutral datasets for each of the three game modes
and one strings bundle per distinct selectable API language. The current scope is
30 catalog objects plus 13 language objects. These constants come from
`app/utils/catalogDatasets.ts`. Strings contain only references the final adapted
catalogs use and include English fallback for every mode.

Every object is gzip-compressed and addressed by SHA256 of its uncompressed UTF-8
JSON. The writer enforces size limits and reads stored bytes back before replacing
`neutral-catalog-v1-manifest`. That manifest includes the source-overlay SHA,
completion timestamp, object keys, uncompressed lengths, and overlay headers.
Failed staging preserves the previous complete manifest. Seven-day retention
bounds stored-object lifetime.

The same run refreshes three independent whole English import snapshots. Their
scope, age, progress-critical task/objective structure, and overlay provenance
remain independently validated. They use `tasks-import-json-v1-en-<mode>` keys.
During migration the workflow also refreshes the 48 legacy localized entries.
Retire that producer only after the new reader passes production verification.
Those temporary entries are outside the neutral release contract.

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

| File                        | Responsibility                                                  |
| --------------------------- | --------------------------------------------------------------- |
| `run.ts`                    | Trusted CLI entry point and run diagnostics                     |
| `catalog-release.ts`        | Immutable neutral object staging, readback, complete activation |
| `import-snapshots.ts`       | Whole English snapshot generation and validation                |
| `kv.ts`                     | Bounded KV REST reads and writes                                |
| `check-overlay.ts`          | End-to-end served-release and import verification               |
| `verify-catalog-release.ts` | Exact scope, provenance, bytes, headers, and timestamp checks   |
| `verify-overlay.ts`         | Import comparison and historical localized-fleet comparison     |
| `nuxt-imports.ts`           | Stand-in for Nuxt auto-imports in standalone scripts            |
| `tsconfig.json`             | Script TypeScript settings                                      |
| `__tests__/`                | Producer and verifier regression tests                          |

The complete architecture and release rules are in
[Overlay and precompute](../../docs/systems/overlay-and-precompute.md#precompute-workflow).
