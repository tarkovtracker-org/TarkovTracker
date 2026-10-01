# scripts/preview/

Deploys a pull request to a Cloudflare Pages preview when a maintainer comments `/preview`. The
PR's own build is untrusted; everything it produces is re-verified by trusted code from `main`
before deploying. Workflows: `preview.yml`, `preview-request.yml`, `preview-state.yml`,
`finalization-shadow.yml`. See the previews section of
[`docs/workflow-automation.md`](../../docs/workflow-automation.md).

| File                        | What it does                                                            |
| --------------------------- | ----------------------------------------------------------------------- |
| `comment-request.mjs`       | Handles a `/preview` (or stop) PR comment and starts the request.       |
| `request-authorization.mjs` | Checks the commenter's repo role and opt-in rules for a request.        |
| `controller.mjs`            | Trusted controller: plans, verifies, and publishes the preview result.  |
| `github-api.mjs`            | GitHub API helpers; only Actions-created checks count as CI evidence.   |
| `build-profile.mjs`         | Picks production vs. anonymous preview build settings before the build. |
| `write-manifest.mjs`        | Writes the build's manifest of claims into the build output.            |
| `manifest.mjs`              | Manifest format, parsing, and digest.                                   |
| `archive.mjs`               | Safe ZIP reader for the build artifact (no symlinks or path traversal). |
| `profile.mjs`               | Fixed Cloudflare Pages project identity for previews.                   |
| `deployment.mjs`            | Parses Wrangler output and compares the deploy with the plan.           |
| `verify-deployment.mjs`     | Confirms the live Cloudflare deploy matches the plan before publishing. |
| `finalization-shadow.mjs`   | Read-only planner for an opt-in final build rehearsal.                  |
| `shadow-container.sh`       | Runs that rehearsal build in a container with no host credentials.      |
| `smoke/`                    | Playwright smoke tests against the deployed preview URL.                |

Tests live in [`../workflow-tests/`](../workflow-tests/) (`preview*.mjs`, `finalization-shadow.mjs`).
