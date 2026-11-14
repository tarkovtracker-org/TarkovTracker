#!/usr/bin/env bash
set -euo pipefail
started_local_stack=false
cleanup() {
  if [ "${started_local_stack}" = true ]; then
    pnpm exec supabase stop --no-backup >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
# Hosted runners occasionally fail Docker port publication on the first start ("driver failed
# programming external connectivity"). Retry the start once from a clean stop; every validation
# below still runs exactly once and any failure still fails the check.
start_local_db() {
  if pnpm exec supabase db start; then
    return 0
  fi
  node scripts/checks/check-supabase-ci.mjs --diagnose || true
  echo 'supabase db start failed; stopping the partial stack and retrying once.' >&2
  pnpm exec supabase stop --no-backup >/dev/null 2>&1 || true
  sleep 5
  if pnpm exec supabase db start; then
    return 0
  fi
  node scripts/checks/check-supabase-ci.mjs --diagnose || true
  return 1
}
if ! pnpm exec supabase status >/dev/null 2>&1; then
  started_local_stack=true
  start_local_db
fi
pnpm exec supabase db reset --no-seed
pnpm exec supabase test db supabase/tests/database
pnpm run supabase:test:task-identity-concurrency
pnpm run supabase:test:concurrency
pnpm run supabase:test:one-time-concurrency
pnpm run supabase:test:owner-only-concurrency
pnpm run supabase:test:deletion-billing-concurrency
pnpm exec supabase db lint --schema public --fail-on error
