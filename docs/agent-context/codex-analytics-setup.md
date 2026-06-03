# Codex Analytics Access

## Current state

- `cloudflare-graphql` MCP is already added to Codex and authenticated with OAuth.
- Browser fallback access is working for GA4, Clarity, and Cloudflare through the Windows Chrome debug session.
- `GA4` and `Clarity` MCP are not configured yet because they still need credentials.

## Recommended long-term setup

1. `GA4 MCP` for fast report access.
2. `GA4 BigQuery export` for durable event-level analysis and funnel work.
3. `Clarity MCP` for recordings and UX debugging.
4. `Cloudflare GraphQL MCP` for traffic, cache, latency, and edge diagnostics.
5. Browser dashboard access only as fallback.

## Secret storage

Store analytics secrets outside the repo in (`${XDG_CONFIG_HOME}` defaults to `$HOME/.config`):

```bash
${XDG_CONFIG_HOME:-$HOME/.config}/codex/analytics.env
```

Example:

```bash
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/codex"
mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"
cat > "$CONFIG_DIR/analytics.env" <<EOF
CLARITY_API_TOKEN=replace-me
GOOGLE_APPLICATION_CREDENTIALS=$CONFIG_DIR/google-analytics-service-account.json
GOOGLE_PROJECT_ID=replace-me
GA4_PROPERTY_ID=replace-me
CLARITY_PROJECT_ID=replace-me
CLOUDFLARE_ACCOUNT_ID=replace-me
CLOUDFLARE_ZONE_TAG=replace-me
EOF
chmod 600 "$CONFIG_DIR/analytics.env"
```

## Cloudflare

Cloudflare is already configured in Codex:

```bash
codex mcp get cloudflare-graphql
```

If you ever need to reconnect:

```bash
codex mcp login cloudflare-graphql
```

## Clarity

Create a token in Clarity:

1. Open the Clarity project.
2. Go to `Settings -> Data Export`.
3. Select `Generate new API token`.
4. Save the token into `${XDG_CONFIG_HOME:-$HOME/.config}/codex/analytics.env` as `CLARITY_API_TOKEN`.

Add the MCP server:

Run from the repo root, or set `REPO_ROOT` to your checkout path:

```bash
codex mcp add clarity -- "$REPO_ROOT/scripts/mcp/clarity-mcp.sh"
```

Verify:

```bash
codex mcp get clarity
```

## Google Analytics

### Best durable path

Use a Google service account for Codex instead of interactive user login.

Why:

- no browser login dependency
- stable for automation
- clean read-only access
- works with both GA4 MCP and BigQuery

### Steps

1. In Google Cloud, create or choose the project you want to use for analytics access.
2. Enable:
   - `Google Analytics Admin API`
   - `Google Analytics Data API`
   - `BigQuery API`
3. Create a service account for Codex.
4. Create a service account JSON key and store it outside the repo at:

```bash
${XDG_CONFIG_HOME:-$HOME/.config}/codex/google-analytics-service-account.json
```

5. Add the service account email to the GA4 property with read access.
6. If using BigQuery export, grant that same service account read access to the exported dataset.
7. Save `GOOGLE_APPLICATION_CREDENTIALS` and `GOOGLE_PROJECT_ID` in `${XDG_CONFIG_HOME:-$HOME/.config}/codex/analytics.env`.

Add the GA4 MCP server:

```bash
codex mcp add google-analytics -- "$REPO_ROOT/scripts/mcp/google-analytics-mcp.sh"
```

Verify:

```bash
codex mcp get google-analytics
```

## BigQuery

GA4 MCP is useful for standard reports, but BigQuery is the better source for:

- event-level analysis
- custom funnels
- drop-off analysis
- feature adoption over long windows
- ad hoc segmentation

If BigQuery export is not enabled yet, enable it in GA4 admin and bind it to the same Google Cloud project used above.

## Repo guidance

`AGENTS.md` now tells Codex to prefer:

- `GA4/BigQuery` for quantitative product analysis
- `Clarity` for recordings and behavior debugging
- `Cloudflare` for infra and traffic diagnostics
- browser dashboards only as fallback
