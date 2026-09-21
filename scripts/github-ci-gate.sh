#!/usr/bin/env bash
# Shared by trusted Crowdin and release automation; callers enable errexit/pipefail.
# Reject a missing, non-strict, or foreign-provider main CI rule.
# The rollout administrator verifies bypass actors; reading them requires ruleset write access.
require_main_ci_policy() {
  local rules rule_id
  rules="$(gh api --paginate "repos/$GITHUB_REPOSITORY/rules/branches/main?per_page=100")"
  rule_id="$(jq -rs --arg repo "$GITHUB_REPOSITORY" '
    [ .[][] | select(.type == "required_status_checks"
      and .ruleset_source_type == "Repository" and .ruleset_source == $repo
      and .parameters.strict_required_status_checks_policy == true
      and any(.parameters.required_status_checks[]; .context == "CI Result" and .integration_id == 15368))
      | .ruleset_id ][0] // empty' <<< "$rules")"
  [[ "$rule_id" =~ ^[0-9]+$ ]] || { echo 'Missing strict main CI Result rule.' >&2; return 1; }

}
# Observe the captured main revision before promoting an already validated commit.
require_main_revision() {
  local expected="$1" current
  current="$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main" --jq '.object.sha')"
  [[ "$current" == "$expected" ]] || { echo 'Main changed after validation.' >&2; return 1; }
}
# Automated gate waits are bounded to 60 minutes (360 polls at 10 seconds).
readonly GATE_WAIT_ATTEMPTS=360
# Await successful GitHub Actions CI on one exact head; terminal failures never retry.
wait_for_ci_result() {
  local sha="$1" attempt checks result
  for ((attempt = 1; attempt <= GATE_WAIT_ATTEMPTS; attempt++)); do
    checks="$(gh api --paginate "repos/$GITHUB_REPOSITORY/commits/$sha/check-runs?check_name=CI%20Result&filter=latest&per_page=100")"
    result="$(jq -rs --arg sha "$sha" '
      [ .[].check_runs[] | select(.name == "CI Result" and .app.id == 15368 and .head_sha == $sha) ]
      | sort_by(.id) | last
      | if . == null or .status != "completed" then "pending" else .conclusion end' <<< "$checks")"
    case "$result" in
      success) return ;;
      pending) ;;
      *) echo "CI Result did not succeed: $result" >&2; return 1 ;;
    esac
    (( attempt < GATE_WAIT_ATTEMPTS )) || { echo 'Timed out waiting for CI Result.' >&2; return 1; }
    sleep 10
  done
}
# Await the authoritative `Preview Result` commit status published by the trusted preview
# controller (.github/workflows/preview.yml) on one exact head. Only the newest status for the
# context counts; failure and error are terminal, and a missing status keeps waiting until the bound.
wait_for_preview_result() {
  local sha="$1" attempt statuses result
  for ((attempt = 1; attempt <= GATE_WAIT_ATTEMPTS; attempt++)); do
    statuses="$(gh api --paginate "repos/$GITHUB_REPOSITORY/commits/$sha/statuses?per_page=100")"
    result="$(jq -rs '
      [ .[][] | select(.context == "Preview Result") ]
      | sort_by(.id) | last
      | if . == null then "pending" else .state end' <<< "$statuses")"
    case "$result" in
      success) return ;;
      pending) ;;
      *) echo "Preview Result did not succeed: $result" >&2; return 1 ;;
    esac
    (( attempt < GATE_WAIT_ATTEMPTS )) || { echo 'Timed out waiting for Preview Result.' >&2; return 1; }
    sleep 10
  done
}
# Both authoritative gates must succeed on the same validated head before promotion.
wait_for_validated_head() {
  local sha="$1"
  wait_for_ci_result "$sha"
  wait_for_preview_result "$sha"
}
# Read the newest dispatched CI run on one branch; queued runs count as created.
latest_dispatched_run() {
  local ref="$1"
  gh run list --repo "$GITHUB_REPOSITORY" --workflow ci.yml --branch "$ref" \
    --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId // 0'
  return $?
}
# Confirm an accepted dispatch creates a run before waiting for exact-SHA checks.
dispatch_ci() {
  local ref="$1" previous current attempt
  previous="$(latest_dispatched_run "$ref")"
  gh workflow run ci.yml --repo "$GITHUB_REPOSITORY" --ref "$ref"
  for ((attempt = 1; attempt <= 12; attempt++)); do
    current="$(latest_dispatched_run "$ref")"
    if [[ "$current" -gt "$previous" ]]; then return 0; fi
    sleep 5
  done
  echo "CI dispatch accepted but no new run appeared on $ref within 60 seconds." >&2
  return 1
}
