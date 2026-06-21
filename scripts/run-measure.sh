#!/bin/bash
cd "$(dirname "$0")/.."
pkill -9 -f google-chrome 2>/dev/null
pkill -9 -f measure-chrome 2>/dev/null
sleep 1
rm -rf /tmp/measure-chrome-*
export MEASURE_RUNS="${MEASURE_RUNS:-1}"
export MEASURE_PAGES="${MEASURE_PAGES:-/}"
timeout 120 node scripts/measure-pageload.mjs
echo "NODE_EXIT=$?"
pkill -9 -f google-chrome 2>/dev/null
