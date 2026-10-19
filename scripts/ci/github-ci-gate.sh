#!/usr/bin/env bash
# Shared by trusted Crowdin and release automation; callers enable errexit/pipefail.
# Accept strict freshness or the equivalent reviewed, single-entry integration queue.
# The rollout administrator verifies bypass actors; reading them requires ruleset write access.
MAIN_MERGE_MODE=''
main_policy_mode() {
  local rules mode admission_app
  admission_app="${REVIEW_ADMISSION_APP_ID:-0}"
  [[ "$admission_app" =~ ^[0-9]+$ ]] || { echo 'Invalid admission App ID.' >&2; return 1; }
  rules="$(gh api --paginate "repos/$GITHUB_REPOSITORY/rules/branches/main?per_page=100")"
  mode="$(jq -rs --arg repo "$GITHUB_REPOSITORY" --argjson admission_app "$admission_app" '
    def own: .ruleset_source_type == "Repository" and .ruleset_source == $repo;
    def pinned($context): any(.parameters.required_status_checks[]?;
      .context == $context and .integration_id == 15368);
    [ .[][] ] as $all |
    [ $all[] | select(own and .type == "required_status_checks" and
      pinned("CI Result") and pinned("Preview Result")) ] as $checks |
    any($checks[]; .parameters.strict_required_status_checks_policy == true) as $strict |
    any($checks[]; .parameters.strict_required_status_checks_policy == false and
      ($admission_app > 0 and $admission_app != 15368) and
      any(.parameters.required_status_checks[]?; .context == "Review Admission" and .integration_id == $admission_app) and
      (.ruleset_id as $id | any($all[]; own and .ruleset_id == $id and
        .type == "pull_request" and .parameters.required_review_thread_resolution == true)) and
      (.ruleset_id as $id | any($all[]; own and .ruleset_id == $id and .type == "merge_queue" and
        .parameters.grouping_strategy == "ALLGREEN" and
        .parameters.max_entries_to_build == 1 and .parameters.max_entries_to_merge == 1 and
        .parameters.min_entries_to_merge == 1 and .parameters.merge_method == "SQUASH"))) as $queue |
    if $strict and $queue then "strict-queue"
    elif $strict then "strict"
    elif any($all[]; .type == "required_status_checks" and
      .parameters.strict_required_status_checks_policy == true and
      pinned("CI Result") and pinned("Preview Result")) then empty
    elif $queue then "queue" else empty end' <<< "$rules")"
  [[ "$mode" == strict || "$mode" == strict-queue || "$mode" == queue ]] || {
    echo 'Missing strict main CI and Preview Result rule or equivalent reviewed merge queue.' >&2
    return 1
  }
  printf '%s\n' "$mode"
}
require_main_ci_policy() {
  MAIN_MERGE_MODE="$(main_policy_mode)"
}
# Native enqueue does not depend on repository auto-merge being enabled.
enqueue_reviewed_pr() {
  node "$(dirname "${BASH_SOURCE[0]}")/enqueue-pr-cli.mjs" "$GITHUB_REPOSITORY" "$1" "$2"
}
# Job-token PR events can be suppressed. Recheck trusted admission explicitly, without bypasses.
wait_for_review_admission() {
  local number="$1" sha="$2" attempt admission_exit admission_run
  admission_run="$(gh api -X POST "repos/$GITHUB_REPOSITORY/actions/workflows/review-admission.yml/dispatches" \
    -H "X-GitHub-Api-Version: 2022-11-28" -f ref=main \
    -f "inputs[pull_request]=$number" -F return_run_details=true --jq ".workflow_run_id")"
  [[ "$admission_run" =~ ^[1-9][0-9]*$ ]] || { echo "Admission dispatch returned no authenticated run ID" >&2; return 1; }
  for ((attempt = 1; attempt <= 120; attempt++)); do
    if node "$(dirname "${BASH_SOURCE[0]}")/review-admission-cli.mjs" "$GITHUB_REPOSITORY" "$sha" "$number" "$admission_run"; then
      return 0
    else
      admission_exit=$?
    fi
    case "$admission_exit" in
      2) sleep 5 ;;
      *) return "$admission_exit" ;;
    esac
  done
  echo 'Timed out waiting for authenticated Review Admission.' >&2
  return 1
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
# controller (.github/workflows/preview.yml) on the exact head. Pull requests and standalone release
# candidates both report on their head: GitHub regenerates a PR's test-merge commit when a merge is
# attempted, so a status there would not survive. Only the newest status for the
# context counts; failure and error are terminal, and a missing status keeps waiting until the bound.
# GitHub's /commits/{sha}/statuses endpoint binds the response to the requested SHA; individual
# status objects do not contain a sha field.
wait_for_preview_result() {
  local sha="$1" attempt statuses result prefix="https://github.com/$GITHUB_REPOSITORY/actions/runs/"
  for ((attempt = 1; attempt <= GATE_WAIT_ATTEMPTS; attempt++)); do
    statuses="$(gh api --paginate "repos/$GITHUB_REPOSITORY/commits/$sha/statuses?per_page=100")"
    result="$(jq -rs --arg prefix "$prefix" '
      [ .[][] | select(.context == "Preview Result") ]
      | sort_by(.id) | last
      | if . == null then "pending"
        elif .state != "success" then .state
        elif ((.target_url // "") | startswith($prefix) | not) then "unbound"
        elif ((.target_url // "") | ltrimstr($prefix) | test("^[0-9]+$") | not)
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
# Revalidate both authoritative branch-rule results on one exact SHA before an unstable-state
# fallback merge; callers still rely on GitHub's normal merge enforcement for every other rule.
wait_for_validated_ci_and_preview() {
  local sha="$1"
  wait_for_ci_result "$sha"
  wait_for_preview_result "$sha"
}
# Statuses are forgeable by write collaborators: authenticate the reported success against
# run-owned state before the gate may pass. The bound run must use the trusted controller
# workflow on main, complete with a successful result publication, and
# must carry the deployment evidence artifact named for the exact previewed SHA.
preview_result_binding() {
  local sha="$1" run_id run jobs evidence prefix="https://github.com/$GITHUB_REPOSITORY/actions/runs/"
  run_id="$(gh api "repos/$GITHUB_REPOSITORY/commits/$sha/statuses?per_page=100" | jq -r --arg prefix "$prefix" '
    [ .[] | select(.context == "Preview Result") ]
    | sort_by(.id) | last
    | select(.state == "success")
    | (.target_url // "") | select(startswith($prefix)) | ltrimstr($prefix)
    | select(test("^[0-9]+$"))')"
  [[ "$run_id" =~ ^[0-9]+$ ]] || { echo 'Preview Result is not bound to a controller run.' >&2; return 1; }
  run="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$run_id")"
  # GitHub reports path and branch separately; path has no @main suffix for workflow_dispatch.
  jq -re --arg repo "$GITHUB_REPOSITORY" 'select(
    .path == ".github/workflows/preview.yml" and .event == "workflow_dispatch" and
    .head_branch == "main" and .head_repository.full_name == $repo and
    .repository.full_name == $repo and .status == "completed" and .conclusion == "success"
  )' >/dev/null <<< "$run" \
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
