import { requireEvidence } from './review-admission-policy.mjs';
/** Validate the one effective main queue, using the public REST branch-rules read path. */
export async function requireQueueConfiguration(github, repo) {
  const rules = await github.paginate('GET /repos/{owner}/{repo}/rules/branches/{branch}', {
    ...repo,
    branch: 'main',
    per_page: 100,
  });
  requireEvidence(Array.isArray(rules), 'Queue branch rules are incomplete.');
  const queues = rules.filter((rule) => rule.type === 'merge_queue');
  requireEvidence(queues.length === 1, 'Effective main queue is missing or ambiguous.');
  const rule = queues[0];
  requireEvidence(
    [
      rule.ruleset_source_type === 'Repository',
      rule.ruleset_source === `${repo.owner}/${repo.repo}`,
      Number.isSafeInteger(rule.ruleset_id),
      rule.ruleset_id > 0,
    ].every(Boolean),
    'Effective queue is not repository-owned.'
  );
  requireEvidence(Boolean(rule.parameters), 'Queue configuration is missing.');
  requireSingleEntrySquash(rule.parameters);
}
function requireSingleEntrySquash(config) {
  requireEvidence(
    [
      config.max_entries_to_build === 1,
      config.max_entries_to_merge === 1,
      config.min_entries_to_merge === 1,
      config.grouping_strategy === 'ALLGREEN',
      config.merge_method === 'SQUASH',
      config.check_response_timeout_minutes === 60,
    ].every(Boolean),
    'Queue configuration is not bounded single-entry squash ALLGREEN.'
  );
}
