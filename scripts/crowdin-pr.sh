#!/usr/bin/env bash
# Copied from trusted main to RUNNER_TEMP before the Crowdin action changes the checkout.
set -euo pipefail
readonly PR_HEAD_QUERY='.headRefOid'
# shellcheck source=scripts/github-ci-gate.sh
source "$(dirname "${BASH_SOURCE[0]}")/github-ci-gate.sh"
# Stop the workflow with a GitHub Actions error annotation.
fail() {
  echo "::error::$*" >&2
  exit 1
}
# Reject malformed revision values before passing them to Git.
require_sha() {
  local sha="$1"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "Invalid commit SHA."
}
# Read the live PR identity and mergeability from GitHub.
read_pr() {
  gh pr view "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" \
    --json state,isDraft,isCrossRepository,headRefName,baseRefName,headRefOid,mergeable,mergeStateStatus
}
# Restrict automation to the open same-repository Crowdin PR.
check_identity() {
  local pr="$1"
  jq -e '.state == "OPEN" and .isDraft == false and .isCrossRepository == false
    and .headRefName == "locales" and .baseRefName == "main"' <<< "$pr" >/dev/null ||
    fail "Expected an open, non-draft, same-repository locales PR targeting main."
}
# Validate pinned tree differences before any candidate project code executes.
check_translation_tree() {
  local paths file mode
  paths="$(mktemp)"
  # A full tree comparison also rejects stale executable code on a behind branch.
  # Disable rename detection so moving a disallowed file cannot hide its old path.
  git diff --no-renames --name-only -z "$BASE_SHA" "$HEAD_SHA" -- > "$paths"
  [[ -s "$paths" ]] || fail "No translation changes to validate."
  while IFS= read -r -d '' file; do
    [[ "$file" =~ ^app/locales/[a-zA-Z0-9_-]+\.json$ && "$file" != app/locales/en.json ]] ||
      fail "Crowdin PR modified a non-translation path: $file"
    mode="$(git ls-tree "$HEAD_SHA" -- "$file")"
    [[ "$mode" == '100644 blob '* ]] || fail "Expected a regular translation file: $file"
  done < "$paths"
  rm "$paths"
}
# Incorporate trusted main before capturing the candidate that project checks will validate.
update() {
  [[ -n "${GH_TOKEN:-}" ]] || fail "ACCESS_TOKEN_GITHUB is required to update the translation branch."
  local pr head base updated attempt
  pr="$(read_pr)"
  check_identity "$pr"
  head="$(jq -r "$PR_HEAD_QUERY" <<< "$pr")"
  require_sha "$head"
  git fetch origin main
  base="$(git rev-parse FETCH_HEAD)"
  git fetch origin "$head"
  if git merge-base --is-ancestor "$base" "$head"; then return; fi
  # GitHub compares the expected head atomically; conflicts or concurrent pushes fail closed.
  gh api --method PUT "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER/update-branch" \
    -f "expected_head_sha=$head" >/dev/null
  for ((attempt = 1; attempt <= 20; attempt++)); do
    pr="$(read_pr)"
    check_identity "$pr"
    updated="$(jq -r "$PR_HEAD_QUERY" <<< "$pr")"
    require_sha "$updated"
    if [[ "$updated" != "$head" ]]; then return; fi
    (( attempt < 20 )) || fail "Timed out waiting for the translation branch update."
    sleep 3
  done
}
# Fetch and validate immutable revisions, then publish the detached checkout identity.
prepare() {
  local pr
  pr="$(read_pr)"
  check_identity "$pr"
  HEAD_SHA="$(jq -r "$PR_HEAD_QUERY" <<< "$pr")"
  require_sha "$HEAD_SHA"
  git fetch origin main
  BASE_SHA="$(git rev-parse FETCH_HEAD)"
  require_sha "$BASE_SHA"
  git fetch origin "$HEAD_SHA"
  [[ "$(git rev-parse FETCH_HEAD)" == "$HEAD_SHA" ]] || fail "Fetched PR head changed."
  git merge-base --is-ancestor "$BASE_SHA" "$HEAD_SHA" || fail "Crowdin head must include current main."
  check_translation_tree
  git checkout --detach "$HEAD_SHA"
  printf 'head_sha=%s\nbase_sha=%s\n' "$HEAD_SHA" "$BASE_SHA" >> "$GITHUB_OUTPUT"
}
# Reject observed head or base changes since the candidate passed validation.
check_revision() {
  local pr="$1"
  [[ "$(jq -r "$PR_HEAD_QUERY" <<< "$pr")" == "$HEAD_SHA" ]] ||
    fail "Crowdin PR head changed after validation."
  local current_base
  current_base="$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main" --jq '.object.sha')"
  [[ "$current_base" == "$BASE_SHA" ]] || fail "Main changed after validation; rerun Crowdin Sync."
}
# Retry unresolved calculations while rejecting every known ineligible state.
wait_for_mergeability() {
  local pr mergeable merge_state attempt
  for ((attempt = 1; attempt <= 20; attempt++)); do
    pr="$(read_pr)"
    check_identity "$pr"
    check_revision "$pr"
    mergeable="$(jq -r '.mergeable' <<< "$pr")"
    merge_state="$(jq -r '.mergeStateStatus' <<< "$pr")"
    case "$mergeable/$merge_state" in
      MERGEABLE/CLEAN) return ;;
      UNKNOWN/UNKNOWN|UNKNOWN/CLEAN|MERGEABLE/UNKNOWN) ;;
      *) fail "Crowdin PR is ineligible: $mergeable / $merge_state" ;;
    esac
    (( attempt < 20 )) || fail "Timed out waiting for Crowdin PR mergeability."
    sleep 3
  done
}
# Recheck the validated candidate and atomically guard the PR head during squash merge.
merge() {
  [[ -n "${GH_TOKEN:-}" ]] || fail "ACCESS_TOKEN_GITHUB is required; refusing a GITHUB_TOKEN merge."
  require_sha "${HEAD_SHA:-}"
  require_sha "${BASE_SHA:-}"
  [[ "$(git rev-parse HEAD)" == "$HEAD_SHA" ]] || fail "Checkout differs from the validated head."
  require_main_ci_policy
  wait_for_ci_result "$HEAD_SHA"
  wait_for_mergeability
  require_main_ci_policy
  # Server-side guard closes the race between the final read and the merge request.
  gh pr merge "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" \
    --match-head-commit "$HEAD_SHA" --squash \
    --subject "chore(i18n): update translations from Crowdin (#$PR_NUMBER)" \
    --body "Automated translation updates from Crowdin."
}
[[ "${PR_NUMBER:-}" =~ ^[1-9][0-9]*$ ]] || fail "Invalid Crowdin PR number."
case "${1:-}" in
  update) update ;;
  prepare) prepare ;;
  merge) merge ;;
  *) fail "Usage: crowdin-pr.sh update|prepare|merge" ;;
esac
