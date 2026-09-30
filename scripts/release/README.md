# scripts/release/

Release automation. [`.releaserc.json`](../../.releaserc.json) loads the plugins and
[`release.yml`](../../.github/workflows/release.yml) runs the gate and recovery. See the releases
section of [`docs/workflow-automation.md`](../../docs/workflow-automation.md).

| File                     | What it does                                                               | Run by               |
| ------------------------ | -------------------------------------------------------------------------- | -------------------- |
| `release-scope.mjs`      | Which commit scopes are internal and excluded from releases and notes.     | `.releaserc.json`    |
| `release-commit.mjs`     | semantic-release plugin that prepares the version commit.                  | `.releaserc.json`    |
| `release-commit.sh`      | Pushes that commit to a staging branch and waits for CI before tagging.    | `release-commit.mjs` |
| `release-gate.mjs`       | Allows publishing only on the weekly schedule or a maintainer dispatch.    | `release.yml`        |
| `release-recovery.mjs`   | Resumes a release that stopped partway, using published release assets.    | `release.yml`        |
| `release-highlights.mjs` | Builds player-facing highlights from each PR's `## Release note` section.  | `release-scope.mjs`  |
| `release-note-state.mjs` | In-process proof that the prepare step succeeded before notes are written. | `release-commit.mjs` |
| `*.test.mjs`             | Vitest unit and integration tests for the files above.                     | `pnpm run test`      |
