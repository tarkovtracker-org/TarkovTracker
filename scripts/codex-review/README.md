# scripts/codex-review/

Requests or waits for a Codex PR review without duplicate posts. Agents use it as described in
[`AGENTS.md`](../../AGENTS.md); never post raw `@codex review` comments instead.

| File                     | What it does                                                      | Run by                   |
| ------------------------ | ----------------------------------------------------------------- | ------------------------ |
| `codex-review.mjs`       | Command-line entry: `node scripts/codex-review/codex-review.mjs`. | agents, by hand          |
| `codex-review-state.mjs` | Reads a PR's review state from GitHub.                            | `codex-review.mjs`       |
| `codex-review-lock.mjs`  | Lock so two runs cannot request the same review.                  | `codex-review.mjs`       |
| `*-tests.mjs`            | `node --test` tests for the files above.                          | `pnpm run test:workflow` |
