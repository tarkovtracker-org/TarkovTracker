# Tarkov Data and Progress Architecture

## Document status

- **Purpose:** durable architecture record and resumable implementation plan
- **Decision status:** target architecture agreed; Phase 0 local safeguards implemented
- **Last verified:** 2026-07-18
- **Repository:** `tarkovtracker-org/TarkovTracker`, branch `tarkov-data-architecture`
- **Do not treat the current branch as the final data architecture.** Direct Worker JSON fetching remains an interim compatibility path, not the intended end state.

## Executive decision

Build one overlay-corrected, mode-aware, versioned Tarkov data release. Publish immutable UI and progress-rules artifacts to Cloudflare KV. Use one framework-free TypeScript progress engine in both the browser and API Worker. Keep Supabase authoritative for mutable user progress and enforce writes through atomic RPCs.

Platform responsibilities:

| Component                       | Responsibility                                                               |
| ------------------------------- | ---------------------------------------------------------------------------- |
| GitHub Actions precompute       | Fetch, normalize, apply overlay, validate, compile, publish                  |
| Cloudflare KV                   | Immutable globally distributed static data and compact progress rules        |
| Pages Functions                 | Serve UI projections from the active KV release                              |
| API Worker                      | Authentication, rate limiting, input validation, derived progress evaluation |
| Supabase                        | Transactional user state, atomic merge/command RPCs, team/auth queries       |
| Shared TypeScript domain module | All progression, branch, invalidation, and edition semantics                 |

Do not make Supabase the primary runtime store for globally static game definitions. A release audit table is reasonable, but full static payloads should not be a required Postgres read on every request.

---

## Verified production inventory

### GitHub Actions

Workflow: `.github/workflows/precompute-tarkov-data.yml`

- Triggered at `0 */12 * * *` and by manual dispatch.
- Runs `pnpm run precompute:tarkov` on GitHub-hosted Ubuntu.
- Installs the repository dependencies and writes through the Cloudflare KV REST API.
- Has a 30-minute timeout and serialized concurrency group.
- Opens or updates a GitHub issue when a scheduled run fails.
- Repository variables are configured:
  - `CLOUDFLARE_ACCOUNT_ID=fe638e80cee39a738275d92348d02bd4`
  - `TARKOV_DATA_KV_NAMESPACE_ID=6034d8d7b7534946bf04110c33ac3b88`
- The latest 15 scheduled runs inspected all succeeded.
- Latest inspected run: `29645388404`, commit `4045861902cab7fd3b397ff0f403b7272b7a4bfb`, 2026-07-18 13:01–13:02 UTC.
- The latest job successfully completed the `Precompute and write to KV` step.

The workflow currently precomputes only `tasks-core` payloads. It does not create a release manifest, compact Worker rules, hideout rules, rollback pointer, or permanent release history.

### Cloudflare

Account: `DysektAI` (`fe638e80cee39a738275d92348d02bd4`)

KV namespace:

- Title: `TARKOV_DATA`
- ID: `6034d8d7b7534946bf04110c33ac3b88`
- 32 keys currently exist: 16 languages × `regular`/`pve`.
- Keys use `tasks-core-json-v2-{lang}-{mode}`.
- Every key has an approximately seven-day expiration.
- No active-release or previous-release pointer exists.

Pages project:

- Project: `tarkovtracker`
- Production and preview both bind `TARKOV_DATA` to the namespace above.
- Production and preview both bind `API_GATEWAY_LIMITER` to the API Worker's Durable Object.

API Worker:

- Script: `api-gateway`
- Smart Placement enabled.
- Observability and invocation logs enabled at 100% sampling.
- Bound to `API_GATEWAY_LIMITER` and Supabase credentials.
- **Not bound to `TARKOV_DATA`.**

Production Worker CPU, 2026-07-18 20:00–23:19 UTC:

| Scope                   | Requests | Average |   p95 |   p99 |   Max |
| ----------------------- | -------: | ------: | ----: | ----: | ----: |
| All API Worker requests |   16,567 | 4.10 ms |  9 ms | 13 ms | 20 ms |
| GET `/api/v2/progress`  |    8,551 | 5.34 ms | 10 ms | 14 ms | 20 ms |
| Task-write paths        |    1,886 | 5.63 ms | 10 ms | 12 ms | 16 ms |

These values require a canary rollout. The production Worker likely still benefits from the old broken task query returning empty data, so populated metadata must be measured before full deployment.

### Supabase

The live Supabase MCP is authenticated.

- `user_progress` had approximately 15,833 rows when Phase 0 verification ran.
- No Tarkov game-data tables currently exist.
- `user_progress` stores PVP and PVE progress as JSONB.
- `merge_progress_data` already performs row locking and partial atomic merges.
- Browser code still performs direct full-row `user_progress` upserts.
- The live `record_api_usage` RPC still has its old six-parameter signature. The local Worker now sends `p_user_agent`, so the pending migration must be applied before that Worker code reaches production.

---

## Current data flow

### Frontend metadata

```text
json.tarkov.dev
  → app/server/utils/tarkov-json.ts
  → complete canonical model
  → app/server/utils/overlay.ts
  → reduced endpoint projections
  → edgeCache / precomputed TARKOV_DATA value
  → browser metadata store
```

Relevant files:

- `app/server/utils/tarkov-json.ts`
- `app/server/utils/overlay.ts`
- `app/server/utils/deepMerge.ts`
- `app/server/utils/edgeCache.ts`
- `app/server/utils/precomputedTarkov.ts`
- `app/server/api/tarkov/*.get.ts`
- `scripts/precompute/precompute.ts`
- `scripts/precompute/kv.ts`
- `scripts/precompute/run.ts`

### Public API progress reads

```text
request
  → Worker token lookup in Supabase
  → Worker tier lookup in Supabase
  → Durable Object daily/burst/IP rate limits
  → user_progress fetch from Supabase
  → display-name fetch when needed
  → task/hideout metadata fetch
  → Worker invalidation and hideout transforms
  → API response
```

### Public API task writes

```text
request
  → authenticate and rate limit
  → fetch current user_progress JSONB
  → mutate completion and dependent tasks in Worker
  → merge_progress_data RPC
```

### Browser progress writes

The browser directly upserts complete `user_progress` payloads. This is a second write authority and can race with public API commands despite the API's partial-merge RPC.

---

## Confirmed defects and architectural gaps

### P0: production KV contains malformed overlay projections

The live `tasks-core-json-v2-en-regular` value was inspected through Cloudflare API.

- Envelope version: 1
- Overlay version: 1.53
- Task count: 512
- Overlay task additions are present.

For overlay-corrected tasks, `objectives` is an ID-keyed object instead of an array. Examples:

- `66058cc5bb83da7ba474aba9`
- `5ae449c386f7744bde357697`

Root cause:

1. `adaptTaskCore()` produces a reduced task without objectives.
2. `applyOverlay()` runs after that projection.
3. `deepMerge()` replaces the missing property with the overlay's ID-keyed patch object.

The pipeline must apply the overlay to a complete canonical model before creating endpoint-specific projections.

### P0: the API Worker and frontend do not use one rules implementation

`app/utils/progressInvalidation.ts` and `workers/api-gateway/src/utils/invalidation.ts` differ.

Examples:

- Frontend skips recursive invalidation when a requirement accepts `failed`; Worker does not.
- Alternative-branch behavior differs.
- Worker still depends on `alternatives`, a field removed from upstream APIs.

Adding a third SQL implementation would increase drift. Extract one shared pure TypeScript engine.

### Resolved: interim Worker JSON migration was mode-insensitive

The Worker service, callers, and caches now select distinct `regular` and `pve` JSON data. Shared-profile failure metadata also uses the requested mode and the runtime-configurable Tarkov JSON base URL.

The remaining limitation is architectural rather than mode correctness: the Worker still fetches directly from the upstream JSON service instead of consuming an immutable validated release. Phase 4 removes that runtime upstream dependency.

### P0: branch semantics depend on removed `alternatives`

The upstream `alternatives` field no longer exists. Branch relationships are represented by `taskStatus` failure conditions. Compile explicit branch/failure edges from `failConditions` and remove runtime dependence on `alternatives`.

### P0: active usage migration is not yet deployed

The local Worker sends `p_user_agent`; the live Supabase RPC does not accept it. Apply the migration before deploying the new Worker.

### P1: Worker has no durable source for patched metadata

Its module cache is per-isolate and ephemeral. The current direct JSON fallback is unpatched and should not be the final source.

### P1: active KV data expires automatically

A scheduler or credential incident lasting seven days would remove the data. Active and previous validated releases should not expire automatically.

### P1: API task writes use GET → mutate → merge

The Worker reads current progress before generating dependent changes. Concurrent writers can make that read stale. Derived branch/invalidation state should not be persisted as ordinary explicit user state.

### P1: browser and API writes use different persistence paths

Browser full-row upserts and API partial merges can overwrite one another. Both must eventually use server-side merge/command contracts.

### P1: API request path has avoidable Supabase round trips

Token validation and tier lookup are separate database calls, followed by operation-specific reads. A combined auth-context RPC should return token state, permissions, mode, and tier before rate limiting.

---

## Target data model

### Canonical source model

The precompute process should create one complete, mode-specific canonical model before projection. It must include all fields needed by every consumer, including:

- tasks and task additions
- objective and failure-condition arrays
- task requirements and accepted statuses
- faction and level/edition/prestige restrictions
- maps, traders, rewards, and items needed by UI projections
- hideout stations, levels, requirements, and edition grants
- overlay provenance

### Compiled progress rules

Publish one language-independent rules artifact per mode:

```ts
type ProgressRuleset = {
  schemaVersion: number;
  releaseId: string;
  mode: 'regular' | 'pve';
  source: {
    generatedAt: string;
    overlayVersion: string;
    overlaySha256: string;
  };
  tasks: Record<
    string,
    {
      faction?: string;
      objectiveIds: string[];
      requirements: Array<{
        taskId: string;
        acceptedStatuses: string[];
      }>;
      failureConditions: Array<{
        taskId: string;
        statuses: string[];
      }>;
    }
  >;
  dependentsByTaskId: Record<string, string[]>;
  editionGrants: Record<
    string,
    {
      moduleIds: string[];
      requirementIds: string[];
    }
  >;
};
```

Measured against current upstream data:

- Raw tasks response: approximately 2,084 KB.
- Raw hideout response: approximately 83 KB.
- Basic task rules projection: approximately 136 KB.
- Relevant stash/cultist hideout projection: approximately 1.5 KB.
- Existing 510-task invalidation function benchmark: approximately 0.17 ms per evaluation in local Node.

Compile graph indexes during precompute to reduce request CPU further.

### Explicit versus derived progress

Persist explicit state:

- task completion
- manual or observed failure
- objective completion/count
- hideout progress
- timestamps, progress epoch, and import provenance

Derive from current rules:

- invalid faction tasks
- failed prerequisites
- locked/unavailable tasks
- branch failures caused by another completed task
- edition/prestige availability
- edition-granted hideout modules and requirements

Return effective derived state in API responses, but avoid permanently storing values that can become stale when metadata changes.

---

## Target release format

Recommended KV layout:

```text
tarkov/releases/{releaseId}/manifest
tarkov/releases/{releaseId}/rules/regular
tarkov/releases/{releaseId}/rules/pve
tarkov/releases/{releaseId}/ui/{lang}/regular/tasks-core
tarkov/releases/{releaseId}/ui/{lang}/regular/tasks-objectives
tarkov/releases/{releaseId}/ui/{lang}/regular/tasks-rewards
tarkov/releases/{releaseId}/ui/{lang}/regular/hideout
...same projections for pve...
tarkov/active-release
tarkov/previous-release
```

Release ID should be content-derived or otherwise immutable and include a manifest containing:

- schema version
- release ID
- generated timestamp
- source endpoint versions/hashes where available
- overlay version and SHA-256
- available modes/languages/projections
- per-artifact sizes and hashes
- validation summary

### Publish protocol

1. Fetch all required inputs for regular and PVE.
2. Normalize into complete canonical models.
3. Apply shared and mode-specific overlays.
4. Validate canonical models and all output projections.
5. Write every immutable release artifact.
6. Read back and verify required artifacts.
7. Acquire a single-writer promotion lock with a unique owner token and lease. Before changing either pointer, read `active-release` and verify it is the expected prior release `A`; if not, release the lock and abort because another publisher has won. A future compare-and-set implementation is acceptable only if it atomically claims the transition from `A` before either pointer write.
8. While the lock/claim remains valid, write `previous-release = A`, verify it, then write `active-release = B` last and verify it. If the first write fails, leave `active-release` at `A` and abort. If the final write fails, keep or restore `active-release = A`, repair `previous-release` to its pre-promotion value when known, and report the release as not promoted. Never retry by blindly overwriting pointers after the lock/claim is lost; re-read state and start a new promotion attempt. The two pointers must not both be advanced to `B`, or rollback would be ineffective.
9. Run production canaries.
10. Retain active and previous releases without expiration.
11. Optionally archive older releases in R2.

Do not fall back to raw tarkov.dev on a runtime miss. Use the previous validated release. If no validated release is available, reads may degrade explicitly, but progress writes should fail with 503 rather than accept unverifiable state.

---

## Target runtime flows

### Metadata/UI request

```text
Pages Function
  → read active release pointer
  → read immutable mode/lang projection from KV
  → return with release/hash headers
```

### API progress read

```text
Worker
  → combined Supabase auth-context RPC
  → Durable Object limits
  → consolidated progress/team RPC
  → load mode-specific rules from module memory or KV
  → shared TypeScript rules engine
  → return effective progress + releaseId
```

### API progress command

```text
Worker
  → combined auth-context RPC
  → Durable Object limits
  → load rules and validate entity/command
  → atomic Supabase command RPC for explicit state only
  → evaluate effective state using shared rules
  → return result + releaseId
```

### Browser sync

```text
Browser
  → timestamp/epoch-aware merge RPC
  → Supabase row lock and atomic merge
  → realtime notification
```

After migration, revoke broad direct client full-row updates.

---

## Why not use Supabase for all static game data?

Full normalized tables or JSON snapshots in Supabase are technically possible but are not the best primary serving path:

- static global data would consume transactional database capacity
- every Worker request would depend on a centralized origin
- returning the rules snapshot repeatedly would transfer unnecessary data
- implementing progression rules in SQL would duplicate browser TypeScript semantics
- the frontend still needs globally cached UI payloads

Appropriate Supabase additions:

- optional release/audit manifest table
- combined token+tier auth-context RPC
- consolidated progress and team-read RPCs
- atomic command and browser-merge RPCs
- release ID in operational logs/audit records

Inappropriate primary responsibility:

- serving full static Tarkov definitions on every request
- owning a second SQL implementation of progression rules

---

## Validation gates

### Canonical model

- Both `regular` and `pve` are present.
- All tasks and objectives have stable IDs.
- Requirements and task-status failure edges reference existing tasks.
- Overlay additions do not collide with upstream IDs.
- Disabled entities are absent from published projections.
- Objectives and failure conditions are always arrays.
- Edition grants reference existing hideout entities.
- No unexpected projection field changes.

### Release publication

- All required keys written before pointer changes.
- Artifact hashes match the manifest.
- Read-back verification succeeds.
- Previous release remains readable.
- Rollback can switch the active pointer without rebuilding.

### Shared rules engine

- One fixture suite runs against browser and Worker imports.
- Regular/PVE differences are covered.
- Failed-only and accepted-failed requirements are covered.
- Mutual branch failure conditions are covered.
- Faction and completed-task behavior are covered.
- Property tests check order independence and idempotency.

### Worker rollout

Compare before/after by endpoint:

- CPU average/p95/p99
- wall duration average/p95/p99
- 5xx and CPU-limit errors
- KV load failures
- stale/previous release usage
- Supabase operation count and latency
- response release ID

Use a canary before full rollout because current GET progress p95 CPU is already approximately 10 ms.

---

## Resumable implementation plan

### Phase 0 — deployment safety

- [ ] Apply `20260718120000_add_user_agent_to_api_usage_daily.sql` before Worker deployment. Production application is explicitly on hold; the corrected migration exists locally only.
- [x] Do not ship mode-insensitive direct JSON fetching as the final solution. Interim callers and caches are mode-aware; Phase 4 removes runtime upstream fetching.
- [x] Add tests proving regular and PVE use distinct data.
- [x] Add a regression test for overlay objective array shape.
- [x] Document or remove the obsolete `alternatives` contract.

### Phase 1 — canonical builder

- [ ] Define canonical model and release manifest schemas.
- [ ] Fetch all upstream inputs once per mode/language as needed.
- [ ] Apply overlay before reduced projections.
- [ ] Compile all current endpoint projections from the canonical model.
- [ ] Compile regular/PVE progress rules.
- [ ] Add invariant and cross-reference validation.

### Phase 2 — immutable publication

- [ ] Add versioned KV key builders.
- [ ] Publish immutable artifacts.
- [ ] Add read-back verification.
- [ ] Add active/previous release pointers.
- [ ] Remove expiration from active/previous releases.
- [ ] Add manual refresh and rollback dispatch inputs.
- [ ] Preserve scheduled failure issue behavior.

### Phase 3 — shared rules engine

- [ ] Extract one framework-free domain module.
- [ ] Port frontend invalidation behavior.
- [ ] Replace `alternatives` with failure-condition edges.
- [ ] Replace frontend implementation.
- [ ] Replace Worker implementation.
- [ ] Reuse engine in shared-profile/streamer paths where applicable.

### Phase 4 — Worker KV cutover

- [ ] Add `TARKOV_DATA` binding to `workers/api-gateway/wrangler.toml` and generated Env types.
- [ ] Load compact rules by requested game mode.
- [ ] Keep module memory only as a secondary optimization.
- [ ] Fall back to previous release, never raw upstream.
- [ ] Remove runtime tarkov.dev task/hideout fetches.
- [ ] Include release ID in logs and API metadata.
- [ ] Canary and verify CPU/latency.

### Phase 5 — Supabase request consolidation

- [ ] Add combined token+tier auth-context RPC.
- [ ] Add consolidated progress-read RPC.
- [ ] Add consolidated team-progress RPC.
- [ ] Add atomic task/objective command RPCs.
- [ ] Stop persisting derived invalid/branch state.
- [ ] Keep usage recording asynchronous and observable.

### Phase 6 — browser write unification

- [ ] Add server-side timestamp/epoch-aware sync RPC.
- [ ] Move browser full-row upserts to the RPC.
- [ ] Preserve offline-first conflict semantics.
- [ ] Revoke direct broad client updates after migration.
- [ ] Add concurrent browser/API writer tests.

### Resume point

When work resumes, start with **Phase 0**, then design the canonical schema and release manifest before changing storage bindings. Do not begin by adding Supabase game tables or by merely increasing the Worker memory TTL; both bypass the root consistency problems.

---

## Decision log

### 2026-07-18 — GraphQL removal

GraphQL was removed from active code because the Worker query referenced fields no longer present in the schema. Direct JSON fetching is an interim compatibility fix, not the target architecture.

### 2026-07-18 — Supabase game-data proposal rejected as primary runtime path

Supabase remains the mutable-state authority. Static globally read data belongs in versioned KV artifacts. This avoids centralized static-data reads and a second SQL progression engine.

### 2026-07-18 — shared TypeScript rules engine selected

The frontend must evaluate local/offline progress, so SQL cannot be the sole implementation. A single framework-free TypeScript engine prevents existing browser/Worker drift.

### 2026-07-18 — live KV projection defect confirmed

Cloudflare API inspection confirmed overlay objective patches are published as objects in tasks-core. Overlay-before-projection became a mandatory first-stage correction.

### 2026-07-18 — GitHub Actions remains the release control plane

The existing scheduled precompute workflow is healthy and appropriately keeps heavy work off the Free-plan Worker. It should be expanded into a validated release publisher rather than replaced by a scheduled Worker.

---

## Primary code references

### Precompute and caching

- `.github/workflows/precompute-tarkov-data.yml`
- `scripts/precompute/precompute.ts`
- `scripts/precompute/kv.ts`
- `scripts/precompute/run.ts`
- `app/server/utils/precomputedTarkov.ts`
- `app/server/utils/edgeCache.ts`

### Canonical data and overlay

- `app/server/utils/tarkov-json.ts`
- `app/server/utils/overlay.ts`
- `app/server/utils/deepMerge.ts`
- `app/server/utils/objectiveTypeInferrer.ts`

### Frontend progression

- `app/utils/progressInvalidation.ts`
- `app/stores/useProgress.ts`
- `app/stores/useTarkov.ts`
- `app/stores/tarkov/hideoutPrereqs.ts`
- `app/stores/tarkov/progressMerge.ts`

### API gateway

- `workers/api-gateway/src/services/tarkov.ts`
- `workers/api-gateway/src/utils/memory-cache.ts`
- `workers/api-gateway/src/utils/invalidation.ts`
- `workers/api-gateway/src/utils/transform.ts`
- `workers/api-gateway/src/handlers/progress.ts`
- `workers/api-gateway/src/handlers/team.ts`
- `workers/api-gateway/src/auth.ts`
- `workers/api-gateway/wrangler.toml`

### Supabase

- `supabase/migrations/20260708140000_add_merge_progress_rpc.sql`
- `supabase/migrations/20260718120000_add_user_agent_to_api_usage_daily.sql`
- `supabase/migrations/20260215160000_sanitize_user_progress_payload.sql`
