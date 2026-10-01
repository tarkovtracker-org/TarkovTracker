# Tarkov browser-clearance rollout proposal

Status: **application support only, disabled by default; no enforcement deployed or verified**.
Production mutation, deployment, plan upgrade, and merge require separate approval.
This discourages unattended integrations, not determined browser automation. Anonymous site
access and the progress API remain supported.

## Read-only inventory and blockers

Read on 2026-09-28: zone `tarkovtracker.org` is Free; Pages project `tarkovtracker` uses
`tarkovtrackernuxt.pages.dev`, production branch `main`. Canonical deployment at inspection:
`33d0181e`, commit `645580be`. Account-level Access apps and policies returned empty.
The deployment API reported 4,534 deployments; only the first 1,000 were inspected
(843 preview, 157 production). **This is not a complete historical-host inventory or a
reachability test.** Enumerate every page before rollout, retaining URLs privately.

Available credentials returned 403 for zone settings, WAF/rate rulesets, and Turnstile
widgets. Challenge Passage, normalization, skip ordering, occupied rule slots, widget
hostnames and clearance level are **unknown**, not defaults. Obtain read-only Zone Settings,
WAF, Rate Limiting and Account Turnstile permissions or a reviewed dashboard export.
Do not infer effective security from repository configuration.

Live documentation checked 2026-09-28:

- [Clearance](https://developers.cloudflare.com/cloudflare-challenges/concepts/clearance/)
- [Rate-limit availability](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Preview protection](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Challenge detection](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/)

## Proposed edge configuration (not apply-ready)

Dedicated managed Turnstile widget: production hostname restrictions listing the approved site
hosts. A widget hostname also admits its subdomains, so the widget does not isolate exact hosts;
the exact `NUXT_TARKOV_ACCESS_EXPECTED_HOSTNAMES` Siteverify check does, and clearance behavior on
any other subdomain must be reviewed before enabling; `clearance_level: managed`, `mode: managed`. Use a different widget
for staging. Store secrets only in platform secret storage. Retain the profile-import widget.
Do not change zone Challenge Passage without reviewing its impact on all challenge rules.

Proposed custom-rule expression (normalized path, including bare prefix):

```text
(http.host in {"tarkovtracker.org" "www.tarkovtracker.org"}
 and (http.request.uri.path eq "/api/tarkov"
      or starts_with(http.request.uri.path, "/api/tarkov/")))
```

Action: `managed_challenge`. Initially disabled. Include `www` only if verified as an active
site alias; inventory all other custom domains. Confirm normalization occurs before WAF and
matches origin routing; stage encoded separators, percent-encoded characters, repeated
slashes, dot segments, case variants and the bare prefix. Reject any ambiguity that reaches
an unchallenged data handler. No cookie-exists rules, User-Agent exceptions, browser keys,
IP-based CI skips, or skips based merely on Access header presence.

Read the complete custom-rule list and account/zone skip rules before inserting this rule.
Any earlier skip that bypasses custom rules or rate limiting must be narrowed or removed
with approval. The verification route `/api/security/tarkov-verify` and widget resources must
remain reachable without clearance or Supabase login. Keep shared data cache keys unchanged.

### Rate limiting decision gate

Free currently supports **one rule, a 10-second window, a 10-second mitigation period,
IP counting, and path (not hostname) filtering**. Cached requests count; cache exclusion
is not available. A path-only rule would also match that path on other hosts in the zone,
including the progress API/operations host. Do not silently accept this collateral scope.
Choose an approved plan supporting hostname expressions (or a separately reviewed isolation
solution), then use the same site-host/path expression with a blocking rate action, counting
cached and origin requests. Do not rely on challenge clearance to throttle solved browsers.

Threshold: **unset; rollout blocker**. Capture timestamped browser request bursts for cold
and warm cache, desktop/mobile, language/mode switching, profiles and log import; aggregate
maximum rolling counts in the actual supported window and include shared-NAT headroom.
The sampled 117/minute figure cannot establish a ten-second limit. Record the measured
counts, chosen threshold and approved plan in the PR before constructing the final rule.
Validate the disabled candidate through Cloudflare before activation. No destructive
whole-ruleset replacement is authorized.

## Alternate hosts and operations prerequisites

1. Export every Pages deployment/alias, all custom domains and branch aliases (all pages,
   not the sampled inventory). Include historical production hashes as well as previews.
2. Configure a Pages-supported production `tarkovtrackernuxt.pages.dev` redirect to
   `https://tarkovtracker.org`, preserving path/query and covering Functions routes, not
   merely static assets. A `_redirects` file alone does not cover Pages Functions.
3. Enable preview Access and review its hostname coverage. Test historical production
   hashes explicitly: the documented preview toggle does not protect the production
   `pages.dev` hostname. If it cannot cover an old URL, obtain approval for an alternative
   protection or retirement; do not delete deployments without approval.
4. Configure human Access membership and a dedicated Service Auth policy for the trusted
   preview runner. Missing/invalid service tokens must fail; valid tokens must succeed.
   `scripts/preview/smoke/access.mjs` sends the service token once per exact origin, without
   redirects, to obtain the host-scoped `CF_Authorization` session; browser and API smoke
   traffic carries only that session, and traces are disabled. The exchange uses bounded native
   fetch outside Playwright instrumentation, cancels the response body after reading headers,
   and replaces transport diagnostics with a fixed error before they reach retained reports.
   Authenticated API smoke requests also use bounded native fetch outside Playwright instrumentation,
   preserve status/JSON assertions and manual redirects, and discard transport, JSON parsing, and
   disposal diagnostics that could contain the session. Preview code is untrusted and
   still receives that exchange request, so before configuring `PREVIEW_ACCESS_*`: verify
   that Access or an edge request-header rule strips `CF-Access-Client-*` before the origin,
   keep the token limited to preview hosts, short session durations, and rotate it on
   exposure. Also verify on a real preview host that a cookie-only request carrying that
   session passes the Service Auth policy; Cloudflare does not document session reuse for
   service tokens. The exchange fails closed on a denied (401/403) or cookie-less response,
   readiness retries it within its startup window, and a session is re-exchanged after five
   minutes, so keep the Access session duration at 15 minutes or longer. If cookie reuse is rejected, keep
   `PREVIEW_ACCESS_*` unset and route smoke traffic through a trusted proxy instead of
   forwarding the token to preview code. Never pass these secrets to the preview build or
   untrusted PR code.
5. Proposed operations hostname (not provisioned): `tarkov-ops.tarkovtracker.org`, entirely
   behind Access with Service Auth, no bypass policies. Expose only GET
   `/api/tarkov/overlay-status` and `/api/tarkov/tasks-core`; reject every other route.
   Configure the same deployed data/cache/overlay path, not a stale independent origin.
   Access must validate service tokens at the edge; an origin proxy must also validate
   Access JWT signature, issuer, audience and expiry before data access. Sending headers
   is not authentication. This infrastructure and its negative tests remain a blocker.
6. `scripts/precompute/check-overlay.ts` supports an explicit HTTPS operations origin and
   dedicated credentials; redirects fail closed. Configure only after the above path is
   reviewed. Local readiness in `pr-checks.yml` uses local endpoints with enforcement off.
   The llms link checker no longer probes internal game-data links; public pages/feed
   checks remain. Nitro streamer metadata calls are relative internal dispatch, not a
   public bypass or a reason to exempt their User-Agent.

## Rollout and acceptance evidence

1. Merge/deploy application support with `NUXT_PUBLIC_TARKOV_ACCESS_ENABLED=false`.
2. Obtain approval to provision a real protected staging hostname, dedicated widget and
   disabled candidate WAF/rate rules. Enable staging support and test there.
3. Resolve every alias, preview and operations prerequisite above. Select the rate limit
   from measurements and obtain approval for the exact production JSON/rule IDs/order.
4. Export previous configuration securely: zone settings, all relevant rulesets (IDs,
   versions, full ordered rules), widget config, Pages/Access/redirect settings. Exclude
   secrets from PR artifacts. Record export path and checksums in the operator ticket.
5. Enable production widget/frontend support first; validate existing-clearance and new
   challenge flows. Then activate approved WAF and rate rules and immediately read back
   their exact expressions, actions, order and settings.
6. Test plain HTTP clients, forged Origin/Referer/Sec-Fetch headers, fake clearance cookies,
   alternate paths/hosts, and invalid Access credentials. Repeat after a real browser
   warms shared CDN objects. All must fail to retrieve data without valid clearance or
   authenticated operations access. Verify cache HITs remain shared for cleared browsers.
7. Check anonymous desktop/mobile startup, language/mode changes, shared profiles, log
   import, legacy profile-import verification, concurrent initial requests, clearance
   expiry, blocked script/cookies, Siteverify outages and manual retry without reload.
   Run approved automation and progress-API regressions. Record exact commit, staging
   settings/readback, timestamps, request counts, statuses and screenshots without secrets.
8. Monitor challenge failure rates, frontend loading failures, Siteverify 503/429 counts,
   cache hit ratio, origin load and legitimate burst blocking. Do not label enforcement
   live until production tests **and** readback are recorded.

Local tests with mocked challenge headers/Siteverify establish coordination only. They do
not prove Cloudflare cookie validation, cache enforcement, alias closure or rate behavior.
These staging/production acceptance rows remain **not run** until separately authorized.

## Rollback (edge first)

1. Disable the specific newly enabled WAF challenge rule by its recorded rule ID; disable
   the new rate rule if it causes collateral blocking. Read back disabled state and verify
   ordinary anonymous data requests recover, including warm-cache requests.
2. Keep frontend recovery support deployed until the edge challenge is confirmed off.
   Only then disable the public feature flag or roll back the application commit.
3. Restore only settings changed by this rollout from the approved export, comparing
   current versions first so unrelated concurrent configuration is not overwritten.
   Restore Challenge Passage only if this rollout changed it. Retain Access protection
   and secure operations unless their separate rollback was approved; do not reopen aliases
   incidentally. Rotate/revoke service tokens separately if exposed.
4. Recheck anonymous loading, operations, preview CI, progress API and cache performance;
   record the actual reversal operations and readback in the incident log.
