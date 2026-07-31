#!/usr/bin/env bash
# Manage co-located git worktrees at .wt/<branch> for parallel PR work.
# See AGENTS.md "Worktree policy" for when to use this.
#
# Usage:
#   bash scripts/wt.sh add <branch> [base]   create .wt/<branch> and bootstrap it
#   bash scripts/wt.sh rm  <branch>          remove .wt/<branch> (refuses if dirty)
#   bash scripts/wt.sh ls                    list worktrees with dirty status
#
# add: base defaults to origin/main. Runs scripts/setup-worktree.sh so husky +
#      lint-staged work on commit. Refuses if <branch> is already checked out
#      anywhere (main checkout or another worktree).
# rm:  refuses if the worktree has uncommitted changes. After removing, prints
#      the branch-delete command for the user to run manually (does not delete
#      the branch itself — that's a destructive op requiring user intent).

set -euo pipefail

# Resolve the repo root (the main checkout, not this worktree's parent).
# All worktrees share one .git database; the main checkout owns .wt/.
GITDIR="$(git rev-parse --git-common-dir 2>/dev/null || true)"
if [[ -z "$GITDIR" ]]; then
  echo "ERROR: not inside a git work tree" >&2
  exit 1
fi
# .git-common-dir points at the main checkout's .git even from a worktree.
MAIN_ROOT="$(cd "$GITDIR/.." && pwd)"
WT_DIR="$MAIN_ROOT/.wt"

cmd="${1:-}"
branch="${2:-}"

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

[[ -n "$cmd" ]] || usage

case "$cmd" in
  add)
    [[ -n "$branch" ]] || { echo "ERROR: add requires <branch>" >&2; usage; }
    base="${3:-origin/main}"

    # Refuse if branch is already checked out anywhere.
    if git worktree list --porcelain | grep -q "^branch refs/heads/${branch}$"; then
      echo "ERROR: branch '${branch}' is already checked out in a worktree:" >&2
      git worktree list | grep -E " \[${branch}\]$" >&2 || true
      echo "Use a different branch name, or 'bash scripts/wt.sh rm ${branch}' first." >&2
      exit 1
    fi

    # Ensure the base is fetched.
    if [[ "$base" == origin/* ]]; then
      git fetch origin --quiet "${base#origin/}" 2>/dev/null || git fetch origin --quiet
    fi

    target="$WT_DIR/$branch"
    echo "Creating worktree at $target on branch ${branch} (from ${base})..."
    git worktree add "$target" -b "$branch" "$base"

    echo "Bootstrapping (node_modules + husky)..."
    ( cd "$target" && bash scripts/setup-worktree.sh )

    echo ""
    echo "Worktree ready: $target"
    echo "  cd $target"
    echo "  Point your agent's cwd at this path."
    ;;

  rm)
    [[ -n "$branch" ]] || { echo "ERROR: rm requires <branch>" >&2; usage; }
    target="$WT_DIR/$branch"

    if [[ ! -d "$target" ]]; then
      echo "ERROR: no worktree at $target" >&2
      echo "Existing worktrees:" >&2
      git worktree list --porcelain | grep "^worktree " >&2 || true
      exit 1
    fi

    # Refuse if dirty.
    dirty=$( git -C "$target" status --porcelain 2>/dev/null | head -1 )
    if [[ -n "$dirty" ]]; then
      echo "ERROR: worktree at $target has uncommitted changes:" >&2
      git -C "$target" status --short >&2 | head -20
      echo "" >&2
      echo "Commit or stash them first, or remove manually with 'git worktree remove --force $target'." >&2
      exit 1
    fi

    git worktree remove "$target"
    echo "Removed worktree at $target."
    echo "If branch '${branch}' is merged, delete it with:  git branch -D ${branch}"
    ;;

  ls)
    echo "Main checkout: $MAIN_ROOT"
    git -C "$MAIN_ROOT" status --short --branch | head -1
    echo ""
    echo "Worktrees:"
    git worktree list --porcelain | awk '
      /^worktree / { wt=$2 }
      /^branch /  { br=$2 }
      /^$/ { if (wt != "'"$MAIN_ROOT"'") printf "  %-40s %s\n", wt, br; wt=""; br="" }
    '
    # Show dirty status for each non-main worktree.
    for wt in $(git worktree list --porcelain | awk '/^worktree / {print $2}'); do
      [[ "$wt" == "$MAIN_ROOT" ]] && continue
      dirty=$( git -C "$wt" status --porcelain 2>/dev/null | wc -l )
      if [[ "$dirty" -gt 0 ]]; then
        echo "    $wt: $dirty uncommitted file(s)"
      fi
    done
    ;;

  *)
    echo "ERROR: unknown command '$cmd'" >&2
    usage
    ;;
esac
