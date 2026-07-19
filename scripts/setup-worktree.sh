#!/usr/bin/env bash
# Bootstrap a git worktree so husky + lint-staged actually run on commit.
# Run from the worktree root after `git worktree add`.
#
# Why: bare worktrees often lack node_modules and husky's `.husky/_` harness,
# so pre-commit is a silent no-op and CI format:check fails later.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: not inside a git work tree" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@10.34.5 --activate
  else
    echo "ERROR: pnpm not found (and corepack unavailable)" >&2
    exit 1
  fi
fi

echo "Installing dependencies (frozen lockfile)..."
pnpm install --frozen-lockfile

echo "Installing husky hooks..."
# Unset any prior hooksPath so husky can point this worktree at .husky/_
git config --unset-all core.hooksPath 2>/dev/null || true
pnpm exec husky
find .husky -maxdepth 1 -type f -name '[!_]*' -exec chmod +x {} \;

hooks_path="$(git config --get core.hooksPath || true)"
if [[ ! -d ".husky/_" ]] && { [[ -z "${hooks_path}" ]] || [[ ! -d "${hooks_path}" ]]; }; then
  echo "ERROR: husky harness missing after install (core.hooksPath=${hooks_path:-unset})" >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "ERROR: node_modules missing after install" >&2
  exit 1
fi

echo ""
echo "Worktree ready for commits."
echo "  hooks: ${hooks_path:-.husky/_}"
echo "  lint-staged will format/lint staged files on commit."
echo "  If hooks still cannot run, run the same tools on staged paths before commit"
echo "  (e.g. prettier --write on touched docs; eslint --fix on touched app files)."
echo ""
