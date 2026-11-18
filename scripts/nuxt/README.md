# scripts/nuxt/

| File                 | What it does                                                       | Run by                                                     |
| -------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| `buildHooks.ts`      | Cleans Cloudflare server output and filters Nuxt auto-imports.     | The compiled and imports:extend hooks in `nuxt.config.ts`. |
| `buildHooks.test.ts` | Checks output traversal, filesystem failures and import filtering. | Vitest via `pnpm run test`.                                |
