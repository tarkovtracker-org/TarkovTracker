#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${HOME}/.config/codex/analytics.env"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

if [ -z "${CLARITY_API_TOKEN:-}" ]; then
  echo "CLARITY_API_TOKEN is required." >&2
  exit 1
fi

exec npx -y @microsoft/clarity-mcp-server "--clarity_api_token=${CLARITY_API_TOKEN}"
