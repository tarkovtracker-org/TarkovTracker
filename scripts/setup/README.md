# scripts/setup/

Local development setup. See the worktree section of
[`docs/workflow-automation.md`](../../docs/workflow-automation.md).

| File                       | What it does                                                          | Run by                                              |
| -------------------------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| `setup-dev-environment.sh` | First-time setup: creates `.env` from `.env.example`, installs hooks. | `pnpm run setup`                                    |
| `wt.sh`                    | Creates, removes, and lists Git worktrees under `.wt/`.               | `bash scripts/setup/wt.sh add <branch>`             |
| `setup-worktree.sh`        | Installs dependencies and Git hooks inside a new worktree.            | `wt.sh add`                                         |
| `ensure-pnpm.sh`           | Installs the exact pnpm version pinned in `package.json`.             | CI setup action, `preview.yml`, `setup-worktree.sh` |
