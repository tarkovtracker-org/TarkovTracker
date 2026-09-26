#!/usr/bin/env bash
# Execute candidate install/build without the main-ref runner's Actions runtime/cache token.
# Only candidate source/output is mounted; no host credentials, cache directory, or Docker socket.
set -euo pipefail
candidate_dir="$1"
app_url="$2"
trusted_dir="$3"
if [[ "$(cat "$trusted_dir/.nvmrc")" != '24.19.0' ]]; then
  echo 'Shadow image Node version must match trusted .nvmrc.' >&2
  exit 1
fi
docker run --rm -i \
  --user "$(id -u):$(id -g)" \
  --read-only --tmpfs /tmp:rw,exec,nosuid,size=4g \
  --cap-drop ALL --security-opt no-new-privileges --pids-limit 1024 \
  --mount "type=bind,source=$candidate_dir,target=/workspace" \
  --workdir /workspace \
  --env HOME=/tmp --env COREPACK_HOME=/tmp/corepack --env XDG_CACHE_HOME=/tmp/cache \
  --env CI=true --env HUSKY=0 --env "APP_URL=$app_url" \
  --env SUPABASE_URL= --env SUPABASE_ANON_KEY= --env NUXT_SUPABASE_SERVICE_KEY= \
  --env GA_MEASUREMENT_ID= --env CLARITY_PROJECT_ID= \
  --env NUXT_PUBLIC_CLIENT_LOG_SINK_URL= --env NUXT_LOG_SINK_URL= \
  --env NUXT_PUBLIC_TURNSTILE_SITE_KEY= --env NUXT_TURNSTILE_SECRET_KEY= \
  --env STRIPE_SECRET_KEY= --env CODECOV_TOKEN= \
  --env STRIPE_PRICE_SCAV_MONTHLY= --env STRIPE_PRICE_SCAV_6MONTH= \
  --env STRIPE_PRICE_SCAV_YEARLY= --env STRIPE_PRICE_TIMMY_MONTHLY= \
  --env STRIPE_PRICE_TIMMY_6MONTH= --env STRIPE_PRICE_TIMMY_YEARLY= \
  --env STRIPE_PRICE_CHAD_MONTHLY= --env STRIPE_PRICE_CHAD_6MONTH= \
  --env STRIPE_PRICE_CHAD_YEARLY= \
  node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df \
  sh -eu <<'IN_CONTAINER'
node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const value = JSON.parse(readFileSync("package.json", "utf8")).packageManager;
  if (typeof value !== "string" || !/^pnpm@\d+\.\d+\.\d+\+sha512\.[a-f0-9]{128}$/.test(value)) {
    throw new Error("Candidate packageManager must have an exact pnpm integrity pin");
  }
'
corepack pnpm install --frozen-lockfile
NODE_ENV=production corepack pnpm run build
IN_CONTAINER
