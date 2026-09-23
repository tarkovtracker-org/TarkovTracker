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
    result="$(jq -rs --arg sha "$sha" '
      [ .[][] | select(.context == "Preview Result") ]
      | sort_by(.id) | last
      | if . == null then "pending"
        elif .state != "success" then .state
        elif .sha != $sha then "foreign"
        elif ((.target_url // "" | capture("/actions/runs/(?<id>[0-9]+)") | .id)?) == ""
        then "unbound"
        else "bound" end' <<< "$statuses")"
    case "$result" in
      bound) preview_result_binding "$sha" && return ;;
      pending) ;;
      *) echo "Preview Result did not succeed: $result" >&2; return 1 ;;
    esac
    (( attempt < GATE_WAIT_ATTEMPTS )) || { echo 'Timed out waiting for Preview Result.' >&2; return 1; }
    sleep 10
  done
}
# Statuses are forgeable by write collaborators: authenticate the reported success against
# run-owned state before the gate may pass. The bound run must be the trusted controller
# revision (default-branch workflow ref), completed with a successful result publication, and
# must carry the deployment evidence artifact named for the exact previewed SHA.
preview_result_binding() {
  local sha="$1" run_id run jobs evidence
  run_id="$(gh api "repos/$GITHUB_REPOSITORY/commits/$sha/statuses?per_page=100" | jq -r --arg sha "$sha" '
    [ .[] | select(.context == "Preview Result") ]
    | sort_by(.id) | last
    | select(.state == "success" and .sha == $sha)
    | (.target_url // "" | capture("/actions/runs/(?<id>[0-9]+)") | .id)? // ""')"
  [[ "$run_id" =~ ^[0-9]+$ ]] || { echo 'Preview Result is not bound to a controller run.' >&2; return 1; }
  run="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$run_id")"
  # Exact comparison: a branch named like 'foo@main' would otherwise satisfy prefix/suffix checks.
  jq -re 'select(.path == ".github/workflows/preview.yml@main" and .conclusion == "success")' >/dev/null <<< "$run" \
    || { echo "Controller run $run_id is not a trusted preview result publication." >&2; return 1; }
  jobs="$(gh api --paginate "repos/$GITHUB_REPOSITORY/actions/runs/$run_id/jobs?per_page=100")"
  # --paginate emits each page as a bare {total_count, jobs} document.
  jq -s -e '[.[] | .jobs[]? | select(.name == "Publish preview result" and .conclusion == "success")] | length > 0' \
    >/dev/null <<< "$jobs" || { echo 'Controller result job did not succeed.' >&2; return 1; }
  evidence="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$run_id/artifacts?per_page=100")"
  jq -re --arg sha "$sha" '
    [ .artifacts[] | select(.name == "preview-deployment-\($sha)" and .expired == false) ]
    | length > 0' >/dev/null <<< "$evidence" \
    || { echo "Controller run $run_id lacks deployment evidence for $sha." >&2; return 1; }
}
# Read the newest dispatched CI run on one branch; queued runs count as created.
DISPATCHED_CI_RUN_ID=''
latest_dispatched_run() {
  local ref="$1"
  gh run list --repo "$GITHUB_REPOSITORY" --workflow ci.yml --branch "$ref" \
    --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId // 0'
  return $?
}
# Confirm an accepted dispatch creates a run before waiting for exact-SHA checks.
dispatch_ci() {
  local ref="$1" previous current attempt
  DISPATCHED_CI_RUN_ID=''
  previous="$(latest_dispatched_run "$ref")"
  gh workflow run ci.yml --repo "$GITHUB_REPOSITORY" --ref "$ref"
  for ((attempt = 1; attempt <= 12; attempt++)); do
    current="$(latest_dispatched_run "$ref")"
    if [[ "$current" -gt "$previous" ]]; then
      DISPATCHED_CI_RUN_ID="$current"
      return 0
    fi
    sleep 5
  done
  echo "CI dispatch accepted but no new run appeared on $ref within 60 seconds." >&2
  return 1
}
# Release staging and Crowdin are explicit merge candidates. Request one preview only after the
# CI run started by this job finishes successfully on the expected revision.
request_preview_after_dispatched_ci() {
  local sha="$1" run_id="$DISPATCHED_CI_RUN_ID" run
  [[ "$run_id" =~ ^[1-9][0-9]*$ ]] || { echo 'No dispatched CI run to preview.' >&2; return 1; }
  timeout 60m gh run watch "$run_id" --repo "$GITHUB_REPOSITORY" --exit-status
  run="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$run_id")"
  jq -e --arg sha "$sha" '
    .event == "workflow_dispatch" and .head_sha == $sha and
    .status == "completed" and .conclusion == "success"' >/dev/null <<< "$run" || {
    echo "Dispatched CI run $run_id did not succeed on $sha." >&2
    return 1
  }
  wait_for_ci_result "$sha"
  gh workflow run preview.yml --repo "$GITHUB_REPOSITORY" --ref main -f "run_id=$run_id"
}
