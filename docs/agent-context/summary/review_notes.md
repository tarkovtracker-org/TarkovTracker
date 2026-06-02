# Review Notes — TarkovTracker Documentation

Consistency and completeness review of the generated knowledge base in
`docs/agent-context/summary/`. Checks were run against the repository's authoritative sources:
`package.json`, `nuxt.config.ts` references, `docs/ARCHITECTURE.md`, `docs/API.md`, `app/types/*`,
and the directory structure of `app/`, `supabase/`, and `workers/`.

## Consistency Check

| Area             | Result          | Notes                                                                                                                                                                             |
| ---------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack/versions   | ✅ Consistent   | Stack matches `package.json` and `docs/ARCHITECTURE.md`. Versions intentionally omitted from prose to avoid drift; `package.json` is the source.                                  |
| Store names      | ✅ Consistent   | `useTarkovStore`, `useMetadataStore`, `usePreferencesStore`, `useProgressStore` (facade) + `useTeamStore`/`useSystemStore`/`useAppStore`/`progressState` match `app/stores/`.     |
| API endpoints    | ✅ Consistent   | `/api/tarkov/*`, team/profile/stripe endpoints, cache TTLs match `docs/API.md`.                                                                                                   |
| Data types       | ✅ Consistent   | `Task`, `TaskObjective`, `HideoutStation`, `UserProgressData`, store state types verified against `app/types/tarkov.ts` and `app/types/progress.ts`.                              |
| Game-mode naming | ⚠️ Reconciled   | API/game-data uses `regular`/`pve`; team/profile/membership use `pvp`/`pve`. Called out explicitly in `data_models.md` and `interfaces.md` to prevent confusion.                  |
| Diagrams         | ✅ Mermaid only | No ASCII art used; all visuals are Mermaid (graph/sequence/class/er).                                                                                                             |
| Env var naming   | ✅ Consistent   | `NUXT_PUBLIC_*` / `NUXT_*` / platform-native split matches `docs/ARCHITECTURE.md` and `.env.example`. Canonical map intentionally left to `docs/ARCHITECTURE.md` (single source). |
| Cross-references | ✅ Consistent   | Generated docs defer to `docs/ARCHITECTURE.md` and `docs/API.md` as authoritative; `index.md` defines the precedence order.                                                       |

No contradictory statements were found across the generated files. Where two layers use different
terminology (game modes), the docs reconcile rather than pick one silently.

## Completeness Check

| Topic                   | Coverage                             | Notes / gaps                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Directory/module map    | ✅ Strong                            | `codebase_info.md` + `components.md`.                                                                                                                                                                                                                       |
| Architecture + patterns | ✅ Strong                            | `architecture.md`; defers deep detail to `docs/ARCHITECTURE.md`.                                                                                                                                                                                            |
| Public + internal APIs  | ✅ Strong                            | `interfaces.md`; exact gateway routes/versions live in `workers/api-gateway/src/openapi.ts`.                                                                                                                                                                |
| Data models             | ✅ Strong (types) / ⚠️ Moderate (DB) | App types fully verified. The Supabase ER diagram is **inferred from migration filenames + generated types**, not a fully re-derived schema. Verify column-level details against `supabase/migrations/` and `supabase/functions/_shared/database.types.ts`. |
| Workflows               | ✅ Strong                            | `workflows.md` covers init, fetch, sync, auth, teams, imports, payments, gateway, deletion, i18n, deploy.                                                                                                                                                   |
| Dependencies            | ✅ Strong                            | `dependencies.md`; versions deferred to `package.json`.                                                                                                                                                                                                     |
| Testing conventions     | ✅ Covered                           | Summarized; full detail in `docs/agent-context/style-and-validation.md`.                                                                                                                                                                                    |

## Gaps From Language / Tooling Support Limitations

The analysis relied on the provided structural overview plus targeted reads, not a full
symbol-level parse of every file. Areas where automated coverage is therefore shallower:

- **Vue SFC internals:** component-to-component prop/event wiring is described at the slice level,
  not per-prop. For exact contracts, read the `.vue` files directly.
- **Deno Edge Functions:** documented by responsibility from filenames + shared modules; runtime
  behavior (exact request/response payloads) should be confirmed in each `index.ts`.
- **SQL migrations:** the DB model is reconstructed from migration names and generated types; RLS
  policy specifics and column constraints are not exhaustively enumerated here.
- **Generated artifacts** (`.nuxt/`, coverage, lockfiles) were intentionally excluded.

These are documentation-depth limitations, not known defects in the code.

## Recommendations

1. **Keep `docs/ARCHITECTURE.md` and `docs/API.md` authoritative.** This knowledge base should
   summarize and link to them; regenerate it when those change rather than duplicating detail.
2. **Verify the DB ER diagram** against `supabase/migrations/` if you need column-accurate schema;
   treat the diagram here as an orientation aid.
3. **Treat metrics as out of scope.** These docs deliberately omit LOC/file-size/line counts so they
   don't go stale; do not add them.
4. **Regenerate on structural change** — new feature slice, new store, new endpoint, new Edge
   Function, or a change to the public gateway contract.
5. **Confirm before editing.** When acting on a described behavior, open the cited source file first;
   file contents drift faster than this summary.
