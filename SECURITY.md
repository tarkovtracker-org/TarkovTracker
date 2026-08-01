# Security Policy

## Supported versions

TarkovTracker is a continuously deployed web application. Only the latest deployed
version of `main` is supported with security fixes. We do not backport fixes to
older releases or tags.

## Reporting a vulnerability

**Do not open a public GitHub issue for a security vulnerability.**

Report vulnerabilities through either of these private channels:

1. **GitHub private vulnerability reporting** —
   <https://github.com/tarkovtracker-org/TarkovTracker/security/advisories/new>
   (preferred; routes directly to the maintainers with a private advisory workflow).
2. **Email** — <mailto:security@tarkovtracker.org>

> If GitHub private vulnerability reporting is not enabled when you try it, fall
> back to email and let us know the GitHub reporting route was unavailable so we can re-enable it.

Please include as much of the following as you can:

- Affected URL or component (e.g. `/api/tarkov/*`, Supabase Edge Function, the
  `api-gateway` Worker, the auth flow)
- Steps to reproduce
- Potential impact (what an attacker could do)
- Proof of concept, if safe to share
- Suggested mitigation, if known

## Response expectations

- **Acknowledgment:** within 72 hours of the initial report.
- **Triage:** within 7 days, with an initial assessment of severity and scope.
- **Disclosure coordination:** we will work with you on a coordinated disclosure
  timeline. Please do not disclose the vulnerability publicly until a fix is
  deployed or we have agreed that disclosure is appropriate.
- **Fix:** severity and deployment window determine timing. Critical issues are
  treated as hotfixes; lower-severity issues may ship in the next regular release.

## Out of scope

- Social engineering of maintainers or contributors
- Denial-of-service via load testing or volumetric flooding of the live site
- Reports without a reproducible impact or with only theoretical harm
- Issues in third-party services that are not reachable through TarkovTracker's
  own code (report those to the upstream service instead)
- Findings from automated scanners that have not been manually validated

## Scope

In scope:

- The TarkovTracker web application (`app/`)
- Nitro server routes and middleware (`app/server/`)
- Cloudflare Workers (`workers/`)
- Supabase Edge Functions (`supabase/functions/`)
- Authentication and session handling
- API token creation and handling
- The Stripe billing webhook path
- The Supabase database schema and Row Level Security policies

Out of scope (report upstream):

- `json.tarkov.dev` data issues — report to the tarkov.dev project
- `tarkov-data-overlay` content issues — report at
  <https://github.com/tarkovtracker-org/tarkov-data-overlay>
- Supabase platform vulnerabilities — report to Supabase
- Cloudflare platform vulnerabilities — report to Cloudflare

## Acknowledgments

We are grateful to security researchers who report vulnerabilities responsibly.
With your permission, we will credit you in the GitHub Security Advisory and/or
release notes. Let us know in your report if you would prefer to remain anonymous.
