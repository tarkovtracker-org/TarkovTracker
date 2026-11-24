# Workflow automation

[Workflow inventory](../.github/workflows/README.md) covers triggers and jobs.
[CI and release](systems/ci-and-release.md) owns selection, gates and publishing, [previews](systems/previews.md)
owns preview policy, and [contributing](contributing.md) owns local setup and PR conventions.
[AGENTS.md](../AGENTS.md) defines required checks and review authority.

## Discovery brief

Use `pnpm run brief --file <path>`, `--symbol <file:export>`, or `--base <ref>` for consumers,
docs, scoped instructions and candidate tests. Use `--format json` for complete doc anchors.
The brief combines Fallow, generated Nuxt declarations, literal references and CI path selection.
Check its Uncertainty section for template/auto-import matches, stale generated types, truncated
paths and runtime strings. It does not execute tests. Candidate records contain an executable
and arguments. Pass them separately without shell concatenation. SQL requires database replay.
Deno tests need Deno and do not imply database replay.

### Push cadence

Batch reviewed changes. Reassess affected checks after a head or base change. Use the
[merge-queue lifecycle](merge-queue-rollout.md#agent-lifecycle-after-activation) for review reuse,
head-pinned submission and handoff.

### Codex request deduplication and waiting

`scripts/codex-review/codex-review.mjs` deduplicates Codex review requests across local worktrees
and waits for exact-commit completion. Usage rules live in the root `AGENTS.md`; guard semantics,
lock recovery, and command cleanup live in
[`scripts/codex-review/README.md`](../scripts/codex-review/README.md).

### Reviewer settings: external verification pending

1. Verify automatic Codex reviews are disabled in the repository/dashboard settings.
2. Keep automatic initial CodeRabbit reviews enabled and incremental reviews disabled as configured
   in `.coderabbit.yaml`. Verify exclusions on translation-only and mixed translation/code PRs.
   `greptile.json` skips PRs whose title or description contains "update translations from
   Crowdin" (narrower than CodeRabbit's `Crowdin` title keyword; only Crowdin Sync uses that
   title, and any PR using it loses Greptile review) and ignores the non-English locale files.
   Fix translation wording in Crowdin; review threads on a Crowdin PR hold Review Admission, and
   each sync rebuilds `locales`, so in-repo edits do not persist.
3. Retain manual reviewer access. Record representative PR links and observed dashboard settings;
   checked-in policy is not proof of integration state.
4. Verify revision-specific review evidence and unavailable/quota-exhausted behavior. Preserve
   completed evidence for unchanged inputs and never report unavailable review as successful.

## Operating workflows

- Use `pnpm run test:workflow` for workflow tooling and `pnpm run systems:check` for documented
  implementation paths. For focused verification, read the [workflow inventory](../.github/workflows/README.md)
  and [CI spec](systems/ci-and-release.md#ci-validation-selection).
- Use [release tooling](../scripts/release/README.md) for queue promotion, receipt recovery and retry.
  [CI and release](systems/ci-and-release.md#release-validation-and-publication) owns publication gates.
- Use [preview operations](systems/previews.md#preview-commands) for requesting, stopping and
  rerunning previews. Protected smoke runs and fork approval follow that same spec.
- See [production deployment](runbook.md#deployment) for post-merge checks and recovery.
  The public Worker deploys through its [own repository](api-ownership.md).
- Run [coverage reproduction](testing-coverage.md) separately from Nuxt preparation jobs.

## Fallow changed-file gate

Run `pnpm run lint:fallow --base origin/main` after installation and Nuxt preparation.
The audit includes local changes and uses the merge base. It fails on new errors. See
[Fallow audit snapshots](systems/ci-and-release.md#fallow-audit-snapshots) for context and isolation.
Use `--format json` for structured results. Reported commit IDs are temporary snapshots.
Source base/head appear on stderr.

### Resolving findings instead of suppressing them

Fix findings at the source. `// fallow-ignore-next-line` hides a finding without resolving it, and
because no baseline is maintained, a hidden finding is never revisited — the debt simply stops being
reported. Resolve dead code by deleting it or narrowing the export; resolve complexity by
decomposition (extract helpers, split validation from assembly, share an algorithm rather than
duplicating it).

Complexity findings usually report `exceeded: crap`. CRAP is `complexity² × (1 − coverage)³ +
complexity` and the audit runs without coverage data, so it assumes zero coverage: a function at
cyclomatic 5 scores exactly the threshold of 30 and breaches. "It is covered by tests" is therefore
not a resolution — the analyzer cannot see that coverage, and the finding will recur on every run.
Treat cyclomatic 4 as the practical ceiling for new functions.

Suppress only when the finding is provably not actionable, such as an external contract or framework
indirection the analyzer cannot model (store state hydrated through `$state` is the recurring
example). Put `// fallow-ignore-next-line` directly above the flagged declaration and explain why
the finding cannot be fixed. Explanatory `//` lines may precede the directive; the directive must be
the final comment line. Placing more comment lines between the directive and declaration targets the
wrong line and leaves the finding unsuppressed. A suppression is a reviewable decision, not a
formality. Existing suppressions are grandfathered; remove them opportunistically when already
editing that function rather than as unrelated cleanup in someone else's change.

## Blank-line scanner tests

`pnpm run test:blank-lines` runs exact-output scanner fixtures in-process and the CLI
contract tests, with dedicated V8 coverage for `scripts/checks/blank-lines/`. The
configuration is `scripts/checks/blank-lines.vitest.config.mjs`; CI enforces the
[per-module tooling coverage floors](./testing-coverage.md#gates) in Lint & Format
on full validation, separately from application coverage.

The CLI owns file discovery, exclusions, symlink handling and writes. The pure
`stripBlankLines(source, filePath, options)` dispatcher selects the language scanner;
`{ typescript: null }` explicitly exercises the conservative JavaScript fallback.
Preserve exact output, removal counts, newline endings and idempotence when changing
scanners. Retain CLI smoke tests for the `LINT_BLANK_LINES_FORCE_FALLBACK` flag.

JavaScript comment protection follows parser trivia so templates and regexes cannot
desynchronize comment scanning. The parser-free fallback distinguishes division from
regex context conservatively. YAML block scalars honor explicit indentation indicators
([YAML 1.2.2](https://yaml.org/spec/1.2.2/#8111-block-indentation-indicator)) rather
than inferring indentation from the first content line. Regression fixtures preserve
embedded blank lines in these cases.

## Codebase metrics

`pnpm run metrics` prints a JSON snapshot of the working tree: lines and files for runtime code,
tests, tooling, and migrations, plus the Fallow health score, severity counts, vitals, dead exports,
and CRAP. Snapshots include the HEAD commit, a `dirty` flag for uncommitted changes, and a
SHA-256 fingerprint of `.fallowrc.json`; tables label working-tree changes explicitly. `--base <ref>` instead compares the merge base with the working tree as a Markdown table,
using the same temporary-clone approach as the Fallow gate; `--summary <file>` also appends the
output to that file. Use the table as before/after evidence in PRs that claim a size or complexity
improvement. Fewer runtime lines, findings, and CRAP are better; test lines are shown but neutral.

CRAP is estimated (`static_estimated`) unless Istanbul coverage exists. Fallow reads
`coverage/coverage-final.json` automatically, and `--coverage <dir>` points it elsewhere; run
`pnpm run test:coverage` first for measured scores. Coverage changes CRAP and every severity count,
so a comparison fails when the base and head use different models: move `coverage/` aside to
compare refs. Comparisons also reject different `.fallowrc.json` fingerprints so changing
analyzer rules cannot masquerade as a code-health improvement. CRAP maxima and threshold counts
come from all scored files, including functions below the reporting thresholds.

CI does not run this comparison; Codecov reports coverage changes on pull requests. For a
measured local comparison, follow the steps in [`scripts/ci/README.md`](../scripts/ci/README.md):
generate both reports in this checkout, the base one at `git merge-base HEAD <ref>` and the head
one from a clean working tree, then pass `--base <ref>`, `--base-coverage` and `--coverage`.
Model and CLI tests live in `scripts/ci/metrics*.test.mjs`.

## Pre-commit Hooks

Git hooks via Husky enforce quality standards. They are a local convenience; CI
`pnpm run format:check` remains the merge gate.

### Setup (git worktree)

Bare worktrees often lack `node_modules` and husky’s `.husky/_` harness, so
pre-commit becomes a silent no-op. After `git worktree add`, from the worktree
root:

```bash
bash scripts/setup/setup-worktree.sh
```

That runs `pnpm install --frozen-lockfile` and `pnpm exec husky`. If install is
impossible, format staged paths yourself before committing (for example
`prettier --write` on touched markdown, `eslint --fix` on touched app files, and
`node scripts/checks/lint-blank-lines.mjs --fix` on supported source/config files).

### Hooks

**pre-commit (`.husky/pre-commit`):**

- Regenerates `.nuxt` in development mode when `.nuxt/eslint.config.mjs` is missing
  (a plain `postinstall` `nuxt prepare` omits `@nuxt/eslint` output)
- Runs `lint-staged` for fast, targeted formatting and linting

**commit-msg (`.husky/commit-msg`):**

- Runs commitlint, which only checks for an allowed conventional type prefix

## Dependency updates

Use the pinned setup in [contributing](contributing.md). Dependabot, pnpm supply-chain policy,
Socket and production audit stay aligned. Review provenance, the lockfile and the actual dependency
paths. Keep security updates enabled, the cooldown intact and development-only advisories out of
production. Follow the [Dependabot workflow](../.github/workflows/README.md#dependabot-auto-merge-dependabot-auto-mergeyml)
and [CI security invariants](systems/ci-and-release.md#ci-validation-selection).

## Narrow formatter validation

A lockfile-only Prettier patch/minor resolution refresh can select the formatter profile.
The classifier reads complete immutable current-base/head `package.json` and `pnpm-lock.yaml` files:
the manifest must be byte-identical, a single root importer must keep Prettier and its existing
Tailwind formatter plugin in dev dependencies, and only the Prettier leaf version/integrity and
that unchanged plugin's Prettier peer binding may differ. All other lockfile bytes, including
runtime/build dependency records, importer edges, package metadata and snapshot edges, stay
identical. Another formatter consumer, plugin upgrade, manifest update, mixed path, unknown
shape or incomplete evidence selects full validation. If the app/build starts consuming these
formatter packages, remove this exemption in that change.

The profile retains application lint, full formatting, blank-line scanner tests, workflow tooling,
systems drift, security and unchanged review admission. Application type/unit/coverage/build,
DB and Worker jobs can skip. The trusted main preview controller independently reads the same
immutable files; it never trusts the candidate's formatter flag. Queue comparisons retain exact
current-main/single-parent, complete-path, CI-attempt and final freshness checks. Main pushes and
manual CI dispatches stay full. Roll back by forcing full classification and preview-required;
no credentials, permissions, protected environments or queue rules change.
