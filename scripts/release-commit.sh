#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=scripts/github-ci-gate.sh
source "$(dirname "${BASH_SOURCE[0]}")/github-ci-gate.sh"
[[ "${RELEASE_VERSION:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid release version.' >&2; exit 1; }
[[ "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ && "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ ]] || exit 1
export GH_TOKEN="${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
require_main_ci_policy
base_sha="$(git rev-parse HEAD)"
require_main_revision "$base_sha"
# Stage only generated version assets; refuse a pre-existing staged code change.
git add -- package.json CHANGELOG.md
staged="$(git diff --cached --name-only)"
while IFS= read -r path; do
  case "$path" in
    package.json|CHANGELOG.md) ;;
    *) echo 'Unexpected staged release asset.' >&2; exit 1 ;;
  esac
done <<< "$staged"
# CI, rather than developer hooks, validates the generated files before main changes.
git -c core.hooksPath=/dev/null -c user.name='github-actions[bot]' \
  -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
  commit -m "chore(release): $RELEASE_VERSION"
release_sha="$(git rev-parse HEAD)"
staging_ref="refs/heads/wip/release-$RELEASE_VERSION-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
remote="https://github.com/$GITHUB_REPOSITORY.git"
# The job token pushes the candidate; explicit dispatch starts CI without a personal token.
git -c credential.helper= \
  -c 'credential.helper=!gh auth git-credential' push "$remote" "$release_sha:$staging_ref"
dispatch_ci "${staging_ref#refs/heads/}"
wait_for_ci_result "$release_sha"
require_main_revision "$base_sha"
require_main_ci_policy
# A non-fast-forward push rejects a concurrently advanced main; required checks cannot be bypassed.
# GITHUB_TOKEN avoids recursive main CI; this exact commit already passed staging CI.
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' \
  push "$remote" "$release_sha:refs/heads/main"
# Delete only the staging ref still pointing at our validated commit.
if ! git -c credential.helper= -c 'credential.helper=!gh auth git-credential' \
  push --force-with-lease="$staging_ref:$release_sha" "$remote" ":$staging_ref"; then
  echo "::warning::Release succeeded, but staging branch cleanup failed: $staging_ref"
fi
