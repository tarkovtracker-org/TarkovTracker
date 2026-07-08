#!/bin/bash
cd "$(dirname "$0")/.." || exit 1
pkill -9 -f 'user-data-dir=/tmp/measure-chrome-' 2>/dev/null
sleep 1
rm -rf /tmp/measure-chrome-*
timeout 120 node scripts/measure-pageload.mjs
NODE_EXIT=$?
echo "NODE_EXIT=$NODE_EXIT"
pkill -9 -f 'user-data-dir=/tmp/measure-chrome-' 2>/dev/null || true
exit "$NODE_EXIT"
