#!/usr/bin/env bash
# Run from the workspace root. packageManager includes Corepack's integrity hash.
set -euo pipefail
package_manager="$(node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const value = JSON.parse(readFileSync("package.json", "utf8")).packageManager;
  if (typeof value !== "string" || !/^pnpm@\d+\.\d+\.\d+(?:\+sha(?:224|256|384|512)\.[a-fA-F0-9]+)?$/.test(value)) {
    throw new Error("package.json must pin an exact pnpm packageManager");
  }
  process.stdout.write(value);
')"
expected_version="${package_manager#pnpm@}"
expected_version="${expected_version%%+*}"
installed_version="$(pnpm --version 2>/dev/null || true)"
if [[ "$installed_version" != "$expected_version" ]]; then
  if ! command -v corepack >/dev/null 2>&1; then
    echo "ERROR: pnpm $expected_version is required; Corepack is unavailable to activate it." >&2
    exit 1
  fi
  corepack enable pnpm
  corepack prepare "$package_manager" --activate
  hash -r
fi
if [[ "$(pnpm --version)" != "$expected_version" ]]; then
  echo "ERROR: pnpm does not match packageManager after activation." >&2
  exit 1
fi
