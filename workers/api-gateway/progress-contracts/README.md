# Progress contracts

`@tarkovtracker/progress-contracts@0.1.0` owns the existing pure rules used by the browser,
Nitro and the public API: task update caps, transitions, requirements, failure edges,
invalidation, materialized mode progress, season-number validation and display-name projection.
There are no runtime dependencies. Callers supply progress and catalog data; this package does
not fetch, persist, authenticate, select an active season or know about Nuxt/Workers/Supabase.

Use the explicit exported subpath for a rule, for example
`@tarkovtracker/progress-contracts/progressInvalidation`. Change a rule here once and run its
Node tests plus the repository's browser/Worker parity tests. SQL implementations remain owned
by `supabase/`; a package change does not authorize changing an applied migration.

From this directory: `pnpm install`, `pnpm run build`, `pnpm run test`, `pnpm pack`.
The tarball contains compiled ESM, declarations, original sources/tests and the common fixture.
The version describes these existing contracts; it does not change the HTTP API version.

This preparatory workspace uses `workspace:*`. After an approved repository split, the proposed
distribution is an immutable versioned GitHub Release tarball from
`tarkovtracker-org/TarkovTracker-API`, pinned by URL and lockfile integrity in the frontend.
No registry publication or cross-repository symlink is needed. Each release must bump the
package version, run package/gateway/parity checks, and supply a frontend dependency-update PR;
the frontend continues using its pinned version until that PR is validated and merged.
