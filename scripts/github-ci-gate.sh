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
# Await successful GitHub Actions CI on one exact head; terminal failures never retry.
wait_for_ci_result() {
  local sha="$1" attempt checks result
  for ((attempt = 1; attempt <= 180; attempt++)); do
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
    (( attempt < 180 )) || { echo 'Timed out waiting for CI Result.' >&2; return 1; }
    sleep 10
  done
}
# Explicit dispatch works with the job token and binds CI to the requested branch tip.
dispatch_ci() {
  local ref="$1"
  gh workflow run ci.yml --repo "$GITHUB_REPOSITORY" --ref "$ref"
  return $?
}
