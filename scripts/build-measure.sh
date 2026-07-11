#!/bin/bash
# Build a static SPA into .output/public/ for repeatable page-load measurement.
# Uses the `static` nitro preset so we get a real index.html shell (the default
# cloudflare-pages build serves the shell from _worker.js with no html file).
cd "$(dirname "$0")/.." || exit 1
export NITRO_PRESET=static
export NODE_ENV=production
GENERATE_LOG="$(mktemp)"
trap 'rm -f "$GENERATE_LOG"' EXIT
set +e
pnpm exec nuxt generate >"$GENERATE_LOG" 2>&1
GENERATE_EXIT=$?
set -e
echo "GENERATE_EXIT=$GENERATE_EXIT"
tail -5 "$GENERATE_LOG"
if [ "$GENERATE_EXIT" != "0" ]; then
  exit "$GENERATE_EXIT"
fi
echo "=== output html ==="
find .output/public -maxdepth 1 -name '*.html' 2>/dev/null
