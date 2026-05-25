# Style, Testing, and Validation Details

Deeper conventions for agents. Root `AGENTS.md` links here for reference; these rules are not always loaded.

## Test Stack

- Vitest + Vue Test Utils + `@nuxt/test-utils` (globals enabled).
- Tests live next to code under `__tests__/` folders.
- Prefer focused unit/component tests over end-to-end flows.
- Mock all network and Supabase calls. Keep tests deterministic.

## Test Invocation

- All tests: `npm run test`
- Watch mode: `npm run test:watch`
- Coverage: `npm run test:coverage`
- API gateway tests: `npm run test:api-gateway`
- Single file: `npx vitest path/to/file.test.ts`
- By name pattern: `npx vitest -t "pattern"`
- Interactive dashboard: `npx vitest --ui`
- Ad hoc coverage: `npx vitest --coverage`

## Styling Details

- Tailwind classes are auto-sorted by Prettier via `prettier-plugin-tailwindcss`. Keep class lists tidy.
- Use Tailwind theme layer for colors — no hex values in templates.
- For complex animations or utilities not available in Tailwind, define them in `app/assets/css/tailwind.css` using `@theme` or `@keyframes`.
- Prefer shared UI components in `app/components/` or `app/features/**/components`.
- Use `@nuxt/ui` components consistently with existing patterns.
- Inline styles are acceptable only for truly dynamic values (e.g., computed positions).

## TypeScript Details

- Keep types close to usage; reuse existing types where possible.
- Match existing patterns for enums (often union types in this codebase).
- Prefer explicit types for exported functions, stores, and composables.
