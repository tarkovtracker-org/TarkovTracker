#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${HOME}/.config/codex/analytics.env"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

if [ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]; then
  echo "GOOGLE_APPLICATION_CREDENTIALS is required." >&2
  exit 1
fi

if [ -z "${GOOGLE_PROJECT_ID:-}" ]; then
  echo "GOOGLE_PROJECT_ID is required." >&2
  exit 1
fi

VENV_DIR="${HOME}/.local/share/codex-mcp/google-analytics"
VENV_PYTHON="${VENV_DIR}/bin/python"

if [ ! -x "${VENV_PYTHON}" ]; then
  mkdir -p "${VENV_DIR}"
  python3 -m venv "${VENV_DIR}" >/dev/null 2>&1 || true
fi

if [ -x "${VENV_PYTHON}" ] && "${VENV_PYTHON}" -m pip --version >/dev/null 2>&1; then
  if ! "${VENV_PYTHON}" -m pip show analytics-mcp >/dev/null 2>&1; then
    "${VENV_PYTHON}" -m pip install --upgrade pip >/dev/null
    "${VENV_PYTHON}" -m pip install analytics-mcp >/dev/null
  fi

  if "${VENV_PYTHON}" -c 'import analytics_mcp.server' >/dev/null 2>&1; then
    export MCP_PYTHON_BIN="${VENV_PYTHON}"
  fi
fi

if [ -z "${MCP_PYTHON_BIN:-}" ]; then
  python3 -m pip show analytics-mcp >/dev/null 2>&1 || \
    python3 -m pip install --user --break-system-packages analytics-mcp >/dev/null
  MCP_PYTHON_BIN="python3"
fi

exec "${MCP_PYTHON_BIN}" -c '
import asyncio
import analytics_mcp.coordinator as coordinator
import mcp.server.stdio
from mcp.server.lowlevel import NotificationOptions
from mcp.server.models import InitializationOptions

async def main() -> None:
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await coordinator.app.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name=coordinator.app.name,
                server_version="1.0.0",
                capabilities=coordinator.app.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )

asyncio.run(main())
'
