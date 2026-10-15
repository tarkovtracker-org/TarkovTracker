import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
const REQUIRED_RULES = [
  {
    type: 'required_status_checks',
    parameters: {
      strict_required_status_checks_policy: false,
      required_status_checks: [
        { context: 'CI Result', integration_id: 15368 },
        { context: 'Preview Result', integration_id: 15368 },
        { context: 'Review Admission', integration_id: 0 },
      ],
    },
  },
  {
    type: 'merge_queue',
    parameters: {
      check_response_timeout_minutes: 60,
      grouping_strategy: 'ALLGREEN',
      max_entries_to_build: 1,
      max_entries_to_merge: 1,
      merge_method: 'SQUASH',
      min_entries_to_merge: 1,
      min_entries_to_merge_wait_minutes: 0,
    },
  },
  {
    type: 'pull_request',
    parameters: {
      dismiss_stale_reviews_on_push: false,
      require_code_owner_review: false,
      require_last_push_approval: false,
      required_approving_review_count: 0,
      required_review_thread_resolution: true,
    },
  },
];
function requireTemplateProtections(template) {
  if (
    !isDeepStrictEqual(template.conditions, {
      ref_name: { include: ['refs/heads/main'], exclude: [] },
    })
  )
    throw new Error('Expected main-only queue conditions.');
  if (template.target !== 'branch' || !isDeepStrictEqual(template.rules, REQUIRED_RULES))
    throw new Error('Expected the full required merge queue protections.');
}
function requireApp(appId) {
  if (!Number.isSafeInteger(appId) || appId <= 0 || appId === 15368)
    throw new Error('Admission requires a dedicated positive App ID, never GitHub Actions.');
}
function requireTemplate(template) {
  if (template.enforcement !== 'disabled' || template.bypass_actors?.length !== 0)
    throw new Error('Only the disabled, bypass-free rollout template can be rendered.');
}
/** Bind the disabled rollout template to an isolated, provisioned admission App. */
export function renderMergeQueueRuleset(template, appId) {
  requireApp(appId);
  requireTemplate(template);
  const result = structuredClone(template);
  const statusRule = result.rules.find((rule) => rule.type === 'required_status_checks');
  const admission = statusRule?.parameters.required_status_checks.filter(
    (check) => check.context === 'Review Admission'
  );
  if (admission?.length !== 1 || admission[0].integration_id !== 0)
    throw new Error('Expected one unprovisioned admission issuer placeholder.');
  requireTemplateProtections(template);
  admission[0].integration_id = appId;
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) throw new Error('Usage: render-merge-queue-ruleset.mjs <App ID>');
  const template = JSON.parse(readFileSync('.github/main-merge-queue-ruleset.json', 'utf8'));
  process.stdout.write(
    `${JSON.stringify(renderMergeQueueRuleset(template, Number(process.argv[2])), null, 2)}\n`
  );
}
