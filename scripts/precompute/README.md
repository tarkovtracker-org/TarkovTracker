# scripts/precompute/

Scheduled every 12 hours by `precompute-tarkov-data.yml`: fetches Tarkov.dev data, runs the same
adapt/overlay pipeline as the API, and writes the result to Cloudflare KV. TypeScript run with
`tsx` because it imports the app's server code. See the precompute section of
[`docs/systems/overlay-and-precompute.md`](../../docs/systems/overlay-and-precompute.md).

| File                | What it does                                                         | Run by                     |
| ------------------- | -------------------------------------------------------------------- | -------------------------- |
| `run.ts`            | Command-line entry point.                                            | `precompute:tarkov`        |
| `precompute.ts`     | The pipeline itself.                                                 | `run.ts`                   |
| `kv.ts`             | Writes to Cloudflare KV over its REST API.                           | `precompute.ts`            |
| `nuxt-imports.ts`   | Stand-in for Nuxt's `#imports` so app server code runs outside Nuxt. | `tsconfig.json` path alias |
| `check-overlay.ts`  | Verifies production is serving a fresh, correctly overlaid payload.  | `verify:overlay`           |
| `verify-overlay.ts` | Freshness and overlay comparison used by `check-overlay.ts`.         | `check-overlay.ts`         |
| `tsconfig.json`     | TypeScript settings for this folder.                                 | `typecheck`, `tsx`         |
| `__tests__/`        | Vitest tests.                                                        | `pnpm run test`            |
