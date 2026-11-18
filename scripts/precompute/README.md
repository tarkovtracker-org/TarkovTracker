# scripts/precompute/

## Neutral catalog release

A full run stages ten adapted catalogs for each of the three game modes and one strings bundle per
distinct selectable API language. Every object is gzip-compressed, addressed by a SHA-256 of its
uncompressed JSON, written to KV, and read back byte-for-byte. The publisher replaces
`neutral-catalog-v1-manifest` only after all object checks succeed. Filtered legacy/import runs
leave this manifest alone. Failed staging leaves the previous complete manifest available.

During migration the same workflow continues to refresh the localized catalog fleet and the three
English import snapshots. First publish the overlay's neutral sidecar alongside its existing
artifact. Merge the Tracker producer while the deployed reader still uses the previous keys.
Dispatch **Precompute Tarkov Data** on `main` with the legacy overlay digest as
`expectedOverlaySha` and both filters empty. Download the run's `overlay-precompute-manifest`
artifact and check `catalogRelease.overlaySha`, all catalog and language scopes, and all three
import results before deploying a reader of the new manifest.

Scheduled every 12 hours by `precompute-tarkov-data.yml`: fetches Tarkov.dev data, runs the same
adapt/overlay pipeline as the API, and writes the result to Cloudflare KV. TypeScript run with
`tsx` because it imports the app's server code. See the precompute section of
[`docs/systems/overlay-and-precompute.md`](../../docs/systems/overlay-and-precompute.md).

| File                  | What it does                                                            | Run by                     |
| --------------------- | ----------------------------------------------------------------------- | -------------------------- |
| `run.ts`              | Command-line entry point.                                               | `precompute:tarkov`        |
| `precompute.ts`       | The pipeline itself.                                                    | `run.ts`                   |
| `import-snapshots.ts` | Produces three whole English EFT import snapshots off the request path. | `run.ts`                   |
| `kv.ts`               | Writes to Cloudflare KV over its REST API.                              | `precompute.ts`            |
| `nuxt-imports.ts`     | Stand-in for Nuxt's `#imports` so app server code runs outside Nuxt.    | `tsconfig.json` path alias |
| `check-overlay.ts`    | Verifies production is serving a fresh, correctly overlaid payload.     | `verify:overlay`           |
| `verify-overlay.ts`   | Freshness and overlay comparison used by `check-overlay.ts`.            | `check-overlay.ts`         |
| `tsconfig.json`       | TypeScript settings for this folder.                                    | `typecheck`, `tsx`         |
| `__tests__/`          | Vitest tests.                                                           | `pnpm run test`            |
