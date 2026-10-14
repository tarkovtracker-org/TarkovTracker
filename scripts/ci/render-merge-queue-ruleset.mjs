import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
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
