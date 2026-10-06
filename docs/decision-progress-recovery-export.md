# W10 recovery/export foundation checkpoint

This local slice is stacked on reviewed `813f450ae149712399a843c6710f9dddb97e6e16`.
It has no production runtime caller, UI, automatic import/restore or authority switch.
PR #1124 remains unchanged. The source inventory and codec make a recoverable artifact
possible before future writes become IndexedDB-only. They do not complete W10.

## Progress-only source inventory

The implementation accepts explicit progress keys and calls only `getItem` on those keys.
It never uses storage `length`, `key`, generic object enumeration or auth-key discovery.
All supplied keys are checked before the first storage read. A rejected/inaccessible read
fails the export; it is never converted to a missing key. Capture completeness remains
the caller's responsibility. A missing requested value is preserved as null, distinct from
an empty string and unparseable bytes.

| Key or prefix                               | Namespace and actual source contract                                                                                                  | Verified source                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `v2_progress`                               | v2 key namespace; current scoped progress envelope with `_userId`, `data` and clock metadata. Legacy unscoped values can also exist.  | `localStorage.ts` serializer/parser; `storageKeys.ts`                      |
| `progress`                                  | Unversioned legacy key. It does not imply a validated payload version.                                                                | `storageKeys.ts`; `00.storage-version.client.ts`                           |
| `v2_progress_backup_…`, `progress_backup_…` | Recognized backup namespaces. Do not infer owner, season or payload version from suffixes. No current writer was found in this audit. | `deviceData.ts`, `clientStorage.ts`, `storageQuota.ts`, `useDataBackup.ts` |
| `v2_progress_recovery_…`                    | Account-recovery copy preserves the scoped raw envelope. Payload ownership is a claim, independently of its key suffix.               | `accountRecovery.ts`                                                       |
| `v2_progress_superseded_…`                  | Export-only displaced-mode record: `ownerId`, `mode`, `seasonNumber`, `progress`, identity/time and possible extensions.              | `supersededProgress.ts`                                                    |
| `v2_progress_quarantine_…`                  | Opaque preserved active bytes; ownership can be unknown.                                                                              | `localStorage.ts` quarantine writer                                        |

`v2_progress_quarantine_removal_…` overlaps the quarantine prefix but stores a key pointer/removal
intent. It is explicitly excluded. `v2_device_data_removal_incomplete_…` is also excluded, along
with preferences, manual activity outside the progress envelope, storage-version flags and
all auth/session keys. This slice implements no forget, retention or deletion policy.

The current startup storage-version plugin deletes unversioned legacy progress/backups before
setting version 2. This library cannot recover bytes already deleted. Any eventual bridge
must review capture ordering against that plugin rather than claim a complete legacy archive.

Metadata is observational: a valid explicit null owner means guest, while absence/invalid
ownership remains undefined. Original positive integer season values are retained without
`ACTIVE_SEASON_NUMBER`, eligibility decisions or coercion. Invalid metadata remains available
in the exact raw string. Raw whitespace, Unicode code units, clocks, unknown formats and foreign
owners are not changed. Metadata is checked against those raw bytes when parsing a bundle.

## Committed export and file contract

`exportCommittedProgressRecovery` captures selected raw source observations, then awaits the
existing repository's readonly transaction-complete receipt. A successful cursor request is
insufficient. A transaction abort or stale owner token rejects without producing an artifact.
The bundle contains the captured session provenance, the entire committed owner snapshot
including revision/epochs/tombstone/state/legacy bytes, and selected source observations.
It is not an atomic snapshot of IndexedDB plus localStorage; the latter can be a cached
renderer observation. Later source replacement cannot alter the already captured string.

The outer JSON contract is `tarkovtracker-progress-recovery`, version 1, codec `devalue@5.9.4`.
The payload is data serialized by the existing installed codec's `stringify`/`unflatten`, with
no evaluation, reducers, revivers, construction overrides, global/prototype patches or codec
internal changes. A direct exact dependency reuses the existing lockfile resolution. Upstream
does not promise compatibility across codec releases; any dependency/format change requires
explicit compatibility review and retained old-file decoding, not a silent tag change.

On 2026-10-06 the installed package and lock resolution were verified at 5.9.4. The live
[GitHub advisory API](https://api.github.com/advisories?ecosystem=npm&affects=devalue%405.9.4)
returned zero matching advisories for that exact version. This is a scoped advisory receipt,
not a claim that an untrusted file needs no validation.

## Loss and resource boundaries

The supported data subset is plain/null-prototype objects, arrays including holes, primitive
undefined/nonfinite numbers/negative zero, shared references/cycles, Date, Map and Set. Native
progress fields still go through the reviewed repository decoder. Opaque extensions within
this subset remain opaque. Enumerable named array properties are refused because native
IndexedDB preserves them while devalue drops them. Named Map/Set/Date properties are also
refused before serialization. Synchronous serialization uses the codec directly, since native
cloning normalizes null-prototype objects. Blob, RegExp, buffers/views, boxed values, BigInt and other unsupported
extensions fail visibly; no field is silently discarded, sanitized or replaced with defaults.

Proposed envelope limits are 8 Mi UTF-16 code units, 50,000 flattened nodes, 200,000 reference
edges, hydration depth 128 and logical array length 10,000. These are export-envelope policy
limits, not assertions that existing user progress fits. Over-limit input/output fails with
original storage unchanged; future product work must offer an explicit alternative rather
than truncate a recovery artifact.

Input text is capped before JSON parsing. The outer shape/format/version/codec are checked
before payload revival. A small preflight of the pinned flattened-table layout checks node,
edge, first-hydration traversal depth and logical array lengths before calling `unflatten` or
the downstream snapshot/source validators. Sparse `[-7,length,index,reference,…]` descriptors
cannot use a tiny file to allocate an arbitrarily long array. Sparse index/reference pairs
must be complete, with non-negative integer indices below the declared length, before the
codec library is invoked. Only the supported Date/Map/Set/
null-prototype tags are admitted; Date descriptors require a bounded string. The guard is
not a second serializer or migration framework. Cycles and already hydrated shared nodes
do not count as additional recursive hydration. Unsupported or malformed data rejects.

Hydration limits do not alone bound later validation: a small file can reuse one task list
in many history entries, or reuse one long raw string across many source entries. Each parse
and serialize validation therefore has a separate 10,000-check budget propagated through
the existing known-field decoder's fields, maps and lists. Every occurrence is charged,
including cycles/aliases; no results are memoized and owner/epoch checks still run in context.
Repository operations without a recovery budget retain their existing validation behavior.
Source inventories must be dense, contain at most 10,000 entries and total at most 8 Mi UTF-16
raw code units across all occurrences. The whole source budget is checked before any raw
metadata JSON parsing, including capture. These are per-validation limits: serialization's
verification parse is independently bounded as well. Rejection does not mutate originals.

## Why this precedes rollback and restoration

An untouched legacy snapshot does not contain new-only commits. The focused proof imports
older raw PvE 40, commits authoritative PvE 55 at revision 2, and exports both without changing
the old key. Roundtrip retains revision, epochs, owner, original season and exact raw source.
Old application code cannot read this recovery format. This stage is recoverability groundwork,
not a complete old-code rollback route.

The existing native v2 backup exporter labels Seasonal with the active season, strips internal
metadata, and its importer excludes non-current Seasonal payloads. Reusing that codec here
would lose recovery targeting. A later deliberate native-backup conversion must preserve the
original season, clearly report unsupported targeting and verify the actual importer. Foreign
owner claims in a bundle confer no authorization. Archived prestige runs are server-managed
outside `UserState`; this artifact makes no cloud/archive completeness or mutation claim.

## Lifecycle contract awaiting review

No lifecycle operation is implemented in this slice. First automatic adoption would require a
durable owner-scoped import-once outcome tied to exact observed bytes, including a completed
no-source scan. Malformed, foreign, newer-version and later old-client values remain recoverable
candidates, never silent replacements. A deletion tombstone must prevent automatic resurrection.

Explicit restoration must be a distinct user intent with a freshly verified current owner token
and current revision; exported session provenance cannot be reused as authority. Which selected
mode epochs advance, how original-season eligibility is handled, file portability across owners,
and what survives explicit device removal remain decisions for independent review. Do not
implement `max(epoch)+1` or deletion/retention policy merely because it is a plausible proposal.
The current repository intentionally rejects ordinary commits to deleted owners.

The eventual temporary bridge should expose one authoritative API, preserve old writable keys,
and avoid permanent dual writes or a projection over `v2_progress`. Natural open/reload remains
the low-friction direction. An automatic reload needs an exact committed owner/revision and
barriers for imports, resets, prestige, handoffs and unapplied UI work. No such coordinator or
authority switch is implemented here.

#1091's owner patch is not required for this pure codec/export slice. It remains required as
preserved reference before guest/reset writer integration. Its issue records staged and
unstaged work, with no published commit/PR or matching supported GitHub branch found. Parent
coordination will obtain a complete owner-provided patch; this slice does not recreate it.
