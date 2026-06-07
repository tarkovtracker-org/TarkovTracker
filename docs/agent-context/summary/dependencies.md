# Dependencies — TarkovTracker

> External dependencies and how/why they are used. Versions live in `package.json` (root and
> `workers/api-gateway/`) — this file explains _roles_, not exact versions, to stay durable.
> Engines: Node `>=24.12.0`, npm `>=11.6.2` (`packageManager: npm@11.16.0`).

## Runtime Dependencies (root)

### Framework + UI

| Package                                          | Role                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `nuxt`                                           | Application framework (SPA mode, Nitro server, build).                             |
| `vue`, `vue-router`                              | Vue 3 runtime + routing.                                                           |
| `@nuxt/ui`                                       | Primary component library.                                                         |
| `@nuxt/image`                                    | Image optimization.                                                                |
| `reka-ui`, `tailwind-merge`, `tailwind-variants` | UI primitives + class composition (transitive via `@nuxt/ui`, used in components). |
| `motion-v` / `framer-motion`                     | Animations.                                                                        |
| `embla-carousel*`                                | Carousels.                                                                         |

### Styling

| Package                                           | Role                                       |
| ------------------------------------------------- | ------------------------------------------ |
| `tailwindcss` (v4)                                | Utility-first styling; theme tokens only.  |
| `@tailwindcss/postcss`, `autoprefixer`, `postcss` | CSS pipeline.                              |
| `prettier-plugin-tailwindcss`                     | Auto-sort Tailwind classes (via Prettier). |

### State + Persistence

| Package                       | Role                                             |
| ----------------------------- | ------------------------------------------------ |
| `pinia`, `@pinia/nuxt`        | State management (three-store pattern + facade). |
| `pinia-plugin-persistedstate` | Persist selected store state to localStorage.    |

### Backend + Data

| Package                 | Role                                                    |
| ----------------------- | ------------------------------------------------------- |
| `@supabase/supabase-js` | Auth, DB, realtime, Edge Function invocation.           |
| `ofetch`                | HTTP client for proxy/data fetches.                     |
| `h3`                    | Nitro server route primitives.                          |
| `jsonpath-plus`         | Extract/transform fields when adapting tarkov.dev JSON. |
| `lru-cache`             | In-memory caching (server utils).                       |
| `ipaddr.js`             | IP/CIDR checks in API-protection middleware.            |
| `stripe`                | Supporter payments (Checkout + Portal).                 |

### Domain UI

| Package                                                     | Role                                                |
| ----------------------------------------------------------- | --------------------------------------------------- |
| `leaflet`, `@types/leaflet`                                 | Interactive maps with custom CRS + SVG/tile floors. |
| `@vue-flow/core`, `@vue-flow/controls`, `@vue-flow/minimap` | Task/hideout dependency graph views.                |
| `fflate`                                                    | Zip handling for backup export and EFT log import.  |

### i18n

| Package                                  | Role                                                    |
| ---------------------------------------- | ------------------------------------------------------- |
| `vue-i18n`, `@nuxtjs/i18n`, `@intlify/*` | Localization; `en.json` source, Crowdin-managed others. |

### SEO / meta

| Package             | Role                      |
| ------------------- | ------------------------- |
| `@nuxtjs/sitemap`   | Sitemap generation.       |
| `@iconify-json/mdi` | Material Design icon set. |

## Dev Dependencies (root)

| Package                                                          | Role                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------- |
| `vitest`, `@vitest/coverage-v8`, `@vitest/ui`                    | Test runner + coverage + dashboard.                     |
| `@vue/test-utils`, `@nuxt/test-utils`, `vitest-environment-nuxt` | Vue/Nuxt test harness.                                  |
| `happy-dom`, `fake-indexeddb`                                    | DOM + IndexedDB test environments.                      |
| `eslint`, `@nuxt/eslint`, `eslint-plugin-import-x`               | Linting (flat config, zero-warning policy).             |
| `prettier`                                                       | Formatting.                                             |
| `typescript`, `vue-tsc`                                          | Type checking.                                          |
| `husky`, `lint-staged`                                           | Pre-commit hooks (prettier + eslint --fix, i18n check). |
| `@commitlint/cli`, `@commitlint/config-conventional`             | Conventional commit enforcement.                        |
| `semantic-release`, `@semantic-release/*`                        | Automated versioning/changelog/release.                 |
| `knip`                                                           | Detect unused files/exports/deps.                       |
| `taze`                                                           | Dependency update checks (`npm run deps`).              |
| `supabase`                                                       | Supabase CLI (type gen, local checks).                  |
| `wrangler`                                                       | Cloudflare Workers/Pages CLI.                           |
| `@cloudflare/workers-types`                                      | Worker type definitions.                                |
| `@types/node`, `defu`                                            | Node types + config merging.                            |
| `@google/design.md`                                              | DESIGN.md linting (`npm run design:lint`).              |
| `wait-on`                                                        | Wait for services in CI/dev scripts.                    |

## `workers/api-gateway/` Dependencies

Independent package with its own lockfile. Key dev/runtime tools:

| Package                                                               | Role                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------- |
| `wrangler`, `miniflare`, `workerd`                                    | Worker dev/runtime + local emulation.                   |
| `@cloudflare/workers-types`                                           | Types for Worker + Durable Objects.                     |
| `@apidevtools/swagger-parser`, `openapi-types`, `ajv`, `ajv-draft-04` | Validate the OpenAPI spec (`npm run validate:openapi`). |
| `tsx`, `typescript`                                                   | TS execution + type checking.                           |
| `vitest`                                                              | Gateway tests (`npm run test:api-gateway`).             |

## Supabase Edge Functions

Run on **Deno** (not the Node dependency tree). They import via URL/`deno.json` import maps; local
shims live in `supabase/functions/{deno-stubs.d.ts,npm-shims.d.ts}`. Shared logic in `_shared/`.
Generated DB types: `supabase/functions/_shared/database.types.ts` (via `npm run supabase:types`).

## Dependency Diagram (high level)

```mermaid
graph TD
    App[app/ Nuxt SPA]
    App --> Nuxt[nuxt + vue + @nuxt/ui]
    App --> TW[tailwindcss v4]
    App --> Pinia[pinia + persistedstate]
    App --> SB[@supabase/supabase-js]
    App --> Leaflet[leaflet]
    App --> VueFlow[@vue-flow/*]
    App --> I18n[vue-i18n + @nuxtjs/i18n]
    App --> Stripe[stripe]
    App --> Ofetch[ofetch + h3 + jsonpath-plus]

    Worker[workers/api-gateway]
    Worker --> CF[wrangler + workerd + workers-types]
    Worker --> OpenAPI[swagger-parser + ajv]

    EdgeFns[supabase/functions Deno]
    EdgeFns --> Deno[Deno std + import maps]
```

## Notable Version Pins / Overrides

`package.json` documents intentional pins in `__pinnedNotes` and `overrides`, e.g. `fast-xml-parser`
pinned to the patched v5 line (until `@nuxtjs/sitemap` supports v6), `@vueuse/core` and
`@nuxt/test-utils` adjustments, and security-driven overrides (`ws`, `node-forge`,
`serialize-javascript`, `tar`, `yaml`, etc.). Per the agent contract: **do not add runtime
dependencies without justifying why existing ones are insufficient**, and pin/justify any change to
overrides.
