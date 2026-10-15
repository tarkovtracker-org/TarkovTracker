#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=scripts/ci/github-ci-gate.sh
source "$(dirname "${BASH_SOURCE[0]}")/../ci/github-ci-gate.sh"
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
# The version commit is a deployable change; it needs a successful preview before promotion.
request_preview_after_dispatched_ci "$release_sha"
wait_for_preview_result "$release_sha"
require_main_revision "$base_sha"
require_main_ci_policy
# Main changes only through reviewed PR admission and the required merge queue. Publication is
# a later trusted release run; never wait for review/queue completion inside this job.
body="Prepared by https://github.com/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/attempts/$GITHUB_RUN_ATTEMPT

Source: $base_sha
Candidate: $release_sha

Version assets passed exact-head CI and preview. Review this immutable head before queue admission.
Publication requires the actual merged commit to preserve this source and candidate tree."
pr_url="$(gh api --method POST "repos/$GITHUB_REPOSITORY/pulls" \
  -f "title=chore(release): $RELEASE_VERSION" -f "head=${staging_ref#refs/heads/}" \
  -f base=main -f "body=$body" --jq '.html_url')"
printf '%s\n' "$pr_url"
pr_number="${pr_url##*/}"
[[ "$pr_number" =~ ^[1-9][0-9]*$ && "$pr_url" == "https://github.com/$GITHUB_REPOSITORY/pull/$pr_number" ]] \
  || { echo 'Unexpected release PR response.' >&2; exit 1; }
# Job-token PR events may need approval or be suppressed. Trigger trusted admission explicitly,
# without treating queue/review submission as approval or waiting for reviewers inside Release.
if ! gh workflow run review-admission.yml --repo "$GITHUB_REPOSITORY" --ref main \
  -f "pull_request=$pr_number"; then
  echo "::warning::Version PR #$pr_number awaits admission; retry: gh workflow run review-admission.yml --repo $GITHUB_REPOSITORY --ref main -f pull_request=$pr_number"
fi
printf 'sha=%s\n' "$release_sha" >> "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
jq -n --arg source "$base_sha" --arg candidate "$release_sha" --arg version "$RELEASE_VERSION" \
  --arg pr "$pr_url" '{schema: 1, source: $source, candidate: $candidate, version: $version, pr: $pr}' \
  > "${RUNNER_TEMP:-$(dirname "$GITHUB_OUTPUT")}/release-promotion.json"
