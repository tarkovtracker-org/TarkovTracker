#!/bin/bash
# Build a static SPA into dist-measure/ for repeatable page-load measurement.
# Uses the `static` nitro preset so we get a real index.html shell (the default
# cloudflare-pages build serves the shell from _worker.js with no html file).
set -e
cd "$(dirname "$0")/.."
export NITRO_PRESET=static
export NODE_ENV=production
npx nuxt generate >/tmp/generate.log 2>&1
echo "GENERATE_EXIT=$?"
tail -5 /tmp/generate.log
echo "=== output html ==="
find .output/public -maxdepth 1 -name '*.html' 2>/dev/null
