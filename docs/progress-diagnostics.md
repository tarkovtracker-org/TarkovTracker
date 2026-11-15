# Aggregate progress diagnostic collector

Preparation for [#960](https://github.com/tarkovtracker-org/TarkovTracker/issues/960).
The collector is not deployed by this change. Both browser sink settings remain empty;
do not enable collection until the protection and verification steps below pass.

## Boundaries

The existing opt-in client body goes to `POST /api/logs/progress` on the canonical
`APP_URL` host. Only the exact raw pathname `/api/logs/progress` is accepted
(query strings are allowed); encoded, case-changed, double-slash and trailing-slash
aliases cannot deliver. Pages accepts no forwarded-host override and quietly drops requests
to production `pages.dev` aliases. The production-only `PROGRESS_DIAGNOSTICS` service
binding calls `tarkovtracker-progress-diagnostics`; root/local and preview have no binding.
Pages environment overrides repeat the existing DO, KV and variables because overriding
one non-inheritable key requires all the others. The configuration test checks the
installed Wrangler's resolved values, including the isolated preview KV.

Before Nitro buffers the upload, the existing Pages entry boundary caps actual streamed
bytes at 128 KiB, regardless of `Content-Length`. The endpoint applies the same bound
and rejects excessive JSON depth using an iterative walk. The private Worker repeats
the byte, depth and schema checks. Valid diagnostics are much smaller than this bound.

The endpoint requires the existing `API_GATEWAY_LIMITER` distributed binding, with a
separate 10 requests/IP/minute namespace. Missing bindings, limiter failures (including
fallback), invalid bodies and delivery failures quietly return 204. IP is used only for
the existing limiter key; it is never included in collector payloads or application logs.
The IP limiter does not replace an edge/WAF rule: it runs after the pre-Nitro body bound.

Only these reconstructed fields reach the collector's custom structured log:

- Constant `event = progress_sync_payload`; build commit (40 lowercase hexadecimal
  characters, or empty when the build did not provide a commit).
- Nonnegative safe-integer aggregate and request wire bytes; per-mode wire bytes.
- Known modes `pvp`, `pve`, `seasonal`, and a unique nonempty batch subset of those modes.
- Known outcomes `accepted`, `failed`, `superseded`, `payload_too_large`.
- Fixed numeric counts for `taskCompletions`, `taskObjectives`, `taskAvailability`,
  `hideoutParts`, `hideoutModules`, `traders`, `skills`, `skillOffsets`, `storyChapters`,
  `apiUpdateHistory`, and `manualActivityHistory`.

Unknown fields are discarded by reconstruction; unknown modes and invalid known fields
reject the event. No raw values, profile map keys, user IDs, credentials, browser timestamps,
location, referrer, arbitrary errors or client headers are forwarded. The service call uses
a fresh constant URL and headers, not the incoming browser Request or its `cf` context.
Pages awaits the private fetch before its invocation ends.
The Worker emits one JSON-encoded aggregate, preserving all numeric values and fixed
counts in the captured message. The workerd test parses that message and compares the
complete aggregate with its independent fixture, alongside the private-field omission check.
Cloudflare documents this JSON-string logging pattern as searchable/filterable
[structured logging](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/#enable-workers-logs-and-traces).
Hosted field extraction and the stored envelope still require the synthetic query gate below.

The collector has `workers_dev = false`, `preview_urls = false` and no routes. Only
validated custom logs persist: invocation logs and traces are explicitly disabled.
Cloudflare still manages platform metadata (for example event time, Worker/version and
request correlation). Verify the stored event envelope as well as the custom fields
before enabling browser traffic; do not claim the platform stores no metadata.

## Retention and query destination

Use the existing account's Workers Logs destination, with no new external service,
Logpush destination, queue or database. As verified on 2026-11-14, Cloudflare documents
**3 days on Workers Free and 7 days on Workers Paid**. These are platform retention
periods, not a configurable retention promise. The same page announces a pricing change
on 2026-12-01; recheck retention, quotas and account usage immediately before rollout.
Do not upgrade the plan or enable paid add-ons as part of this preparation.

Sources: [Workers Logs retention, limits and pricing](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#pricing),
[invocation logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#invocation-logs),
[Pages environment configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/#non-inheritable-keys),
[Pages service bindings](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings).
The collector pins compatibility date `2026-10-26`, the newest supported by the
installed workerd binary. A `2026-11-14` pin fails runtime startup; revisit this
pin when updating the existing Wrangler dependency. `pnpm run test:progress-diagnostics`
checks the Worker in workerd and fails on startup or privacy regressions.
The installed Wrangler schema also defines `observability.logs.persist`,
`observability.logs.invocation_logs`, and `observability.traces.enabled/persist`.

## Deployment and verification order — requires a later rollout

1. Agree the exact destination/account, quota budget and retention with the rollout owner.
   Verify a blocking edge/WAF rate-limit rule protects the canonical hostname and
   `/api/logs/progress`, including normalized/encoded/trailing-slash variants accepted by
   routing. Test the rule and inspect its configured action/window before activation.
   Do not infer protection from application rate limiting or a 204 response. Preview and
   `pages.dev` aliases must never deliver to the production collector.
2. Validate locally: `pnpm exec tsc -p workers/progress-diagnostics/tsconfig.json`,
   `pnpm exec wrangler deploy --config workers/progress-diagnostics/wrangler.jsonc --dry-run`,
   `pnpm run test:progress-diagnostics`, and the targeted tests under `workers/progress-diagnostics/src`,
   `app/server/api/logs/__tests__/progress.post.test.ts`, and
   `app/server/utils/__tests__/clientLogBody.test.ts`.
3. After rollout approval, deploy the private collector first:
   `pnpm exec wrangler deploy --config workers/progress-diagnostics/wrangler.jsonc`.
   Verify the deployed settings: no routes, workers.dev or preview URL; persisted custom
   logs enabled, invocation logs and traces disabled. Do not enable tail/Logpush exports.
4. Deploy Pages through its trusted production pipeline with the production-only service
   binding and unchanged limiter/KV/variables. Keep both sink settings empty. Verify the
   live service target, canonical `APP_URL`, limiter binding and served commit. Inspect the
   actual deployed effective `apiProtection.publicRoutes`, including every environment's
   `API_PUBLIC_ROUTES` override. Every override used for activation must explicitly include
   the exact `/api/logs/progress` route: overrides replace the default list and retain their
   authority; this route is not an invariant silently added to them.
5. Send one **unauthenticated synthetic** valid body shaped like `clientDiagnosticBody()` in
   `scripts/checks/progress-diagnostic-fixture.ts` to the canonical endpoint. No production profile
   contents or identifiers are needed. A 204 does not establish delivery: in Cloudflare
   dashboard → Workers & Pages → `tarkovtracker-progress-diagnostics` → Logs, filter custom
   logs by `event = progress_sync_payload`, synthetic `buildCommit`, outcome, and a narrow
   UTC window. Confirm the exact fixed counts and wire bytes and inspect the complete
   stored envelope for identifying request context. Check malformed, deep, oversized,
   rate-limited and forged-forwarded-host requests produce no collector event. Record
   only aggregate results and the deployment/configuration revisions in #960.
6. Before activation, collect a **fresh, immediately preceding 24-hour PostgreSQL baseline**.
   Record exact UTC start/end, total PostgreSQL log entries, and occurrences of the exact
   `p_modes exceeds the maximum payload size` error; generic `P0001` errors are not size
   rejections. Record the application commit, deployed RPC/migration revision, collector
   version and effective configuration alongside these counts. Historical baseline or
   short smoke snapshots in #960 are context, not a substitute for this fresh baseline.
   Only after the unauthenticated delivery/privacy gate and fresh baseline pass, set **only**
   `NUXT_PUBLIC_PROGRESS_DIAGNOSTIC_SINK_URL=/api/logs/progress` at production build time,
   rebuild and deploy. Keep `NUXT_PUBLIC_CLIENT_LOG_SINK_URL` empty. Verify the served
   public setting and revision, then query the first real aggregate samples.
7. Observe at least 24 hours after verified collection begins. Use the first complete
   24-hour post-activation window for comparison with the 24-hour pre-activation baseline;
   report longer follow-up observations separately. Record exact UTC bounds,
   sample count, aggregate/per-mode wire sizes and counts, outcomes, and build commit.
   Compare PostgreSQL log entry count and the exact
   `p_modes exceeds the maximum payload size` occurrences with the fresh pre-activation baseline recorded in #960; generic
   `P0001` errors are not size rejections. A low-volume zero-error window is inconclusive.
   Do not equate wire bytes with PostgreSQL JSONB size. Record the closure decision and
   any supported-profile failures in #960 before closing it.

To stop collection, clear the progress sink setting and rebuild/redeploy Pages; remove
the production service binding if immediate server-side suspension is needed. Never
enable the general client logger as a fallback. Retained events expire on the platform's
plan-specific schedule; disabling the sink does not delete existing logs.
