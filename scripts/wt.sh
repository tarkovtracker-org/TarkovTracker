#!/usr/bin/env bash
set -euo pipefail

GITDIR="$(git rev-parse --git-common-dir 2>/dev/null || true)"
if [[ -z "$GITDIR" ]]; then
  echo "ERROR: not inside a git work tree" >&2
  exit 1
fi
MAIN_ROOT="$(cd "$GITDIR/.." && pwd)"
WT_DIR="$MAIN_ROOT/.wt"

cmd="${1:-}"
branch="${2:-}"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/wt.sh add <branch> [base]   create .wt/<branch> and bootstrap it
  bash scripts/wt.sh rm  <branch>          remove .wt/<branch> (refuses if dirty)
  bash scripts/wt.sh ls                    list worktrees with dirty status

add: base defaults to origin/main. Runs scripts/setup-worktree.sh so husky +
     lint-staged work on commit. Refuses if <branch> is already checked out
     anywhere (main checkout or another worktree).
rm:  refuses if the worktree has uncommitted changes. After removing, prints
     the branch-delete command for the user to run manually (does not delete
     the branch itself — that's a destructive op requiring user intent).
EOF
  exit 1
}

validate_branch() {
  local b="$1"
  if ! git check-ref-format --branch "$b" >/dev/null 2>&1; then
    echo "ERROR: invalid branch name '$b'" >&2
    exit 1
  fi
}

find_branch_path() {
  local target_branch="$1" wt="" br=""
  while IFS= read -r -d '' line; do
    case "$line" in
      worktree\ *) wt="${line#worktree }" ;;
      branch\ refs/heads/*) br="${line#branch refs/heads/}" ;;
      "")
        if [[ "$br" == "$target_branch" ]]; then
          printf '%s' "$wt"
          return 0
        fi
        wt=""; br=""
        ;;
    esac
  done < <(git worktree list --porcelain -z)
  return 0
}

[[ -n "$cmd" ]] || usage

case "$cmd" in
  add)
    [[ -n "$branch" ]] || { echo "ERROR: add requires <branch>" >&2; usage; }
    validate_branch "$branch"
    base="${3:-origin/main}"

    existing_path="$(find_branch_path "$branch")"
    if [[ -n "$existing_path" ]]; then
      if [[ "$existing_path" == "$MAIN_ROOT" ]]; then
        echo "ERROR: branch '${branch}' is checked out in the main checkout ($MAIN_ROOT)." >&2
        echo "Switch to a different branch there before creating a worktree, or use a different branch name." >&2
      else
        echo "ERROR: branch '${branch}' is already checked out in worktree: $existing_path" >&2
        echo "Use a different branch name, or 'bash scripts/wt.sh rm ${branch}' first." >&2
      fi
      exit 1
    fi

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
    validate_branch "$branch"
    target="$WT_DIR/$branch"

    if [[ ! -d "$target" ]]; then
      echo "ERROR: no worktree at $target" >&2
      echo "Existing worktrees:" >&2
      git worktree list --porcelain | grep "^worktree " >&2 || true
      exit 1
    fi

    dirty="$(git -C "$target" status --porcelain 2>/dev/null | head -1)"
    if [[ -n "$dirty" ]]; then
      echo "ERROR: worktree at $target has uncommitted changes:" >&2
      git -C "$target" status --short | head -20 >&2
      echo "" >&2
      echo "Commit or stash them first, or remove manually with 'git worktree remove --force $target'." >&2
      exit 1
    fi

    git worktree remove "$target"
    echo "Removed worktree at $target."
    echo "If branch '${branch}' is merged, delete it with:  git branch -d ${branch}"
    echo "  (use -D only if you have confirmed there are no unmerged commits to keep)"
    ;;

  ls)
    echo "Main checkout: $MAIN_ROOT"
    git -C "$MAIN_ROOT" status --short --branch | head -1
    echo ""
    echo "Worktrees:"
    while IFS= read -r -d '' line; do
      case "$line" in
        worktree\ *) wt="${line#worktree }" ;;
        branch\ refs/heads/*) br="${line#branch refs/heads/}" ;;
        "")
          if [[ -n "${wt:-}" && -n "${br:-}" && "$wt" != "$MAIN_ROOT" ]]; then
            printf "  %-40s %s\n" "$wt" "$br"
          fi
          wt=""; br=""
          ;;
      esac
    done < <(git worktree list --porcelain -z)

    while IFS= read -r -d '' line; do
      case "$line" in
        worktree\ *) wt="${line#worktree }" ;;
        "")
          if [[ -n "${wt:-}" && "$wt" != "$MAIN_ROOT" ]]; then
            dirty_count="$(git -C "$wt" status --porcelain 2>/dev/null | wc -l)"
            if [[ "$dirty_count" -gt 0 ]]; then
              echo "    $wt: $dirty_count uncommitted file(s)"
            fi
          fi
          wt=""
          ;;
      esac
    done < <(git worktree list --porcelain -z)
    ;;

  *)
    echo "ERROR: unknown command '$cmd'" >&2
    usage
    ;;
esac
