#!/usr/bin/env bash
set -euo pipefail

started_local_stack=false

cleanup() {
  if [ "${started_local_stack}" = true ]; then
    pnpm exec supabase stop --no-backup >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

if ! pnpm exec supabase status >/dev/null 2>&1; then
  pnpm exec supabase db start
  started_local_stack=true
fi

pnpm exec supabase db reset --no-seed
pnpm exec supabase db lint --schema public --fail-on error
