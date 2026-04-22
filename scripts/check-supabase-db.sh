#!/usr/bin/env bash
set -euo pipefail

started_local_stack=false

cleanup() {
  if [ "${started_local_stack}" = true ]; then
    npx supabase stop --no-backup >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

if ! npx supabase status >/dev/null 2>&1; then
  npx supabase db start
  started_local_stack=true
fi

npx supabase db reset --no-seed
npx supabase db lint --schema public --fail-on error
