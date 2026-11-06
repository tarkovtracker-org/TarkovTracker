// Effective branch rules exclude disabled/evaluate rules. Never infer queue mode from a loose check.
function pinned(rule, context, integrationId) {
  return rule.parameters?.required_status_checks?.some(
    (check) => check.context === context && check.integration_id === integrationId
  );
}
function validationChecks(rule) {
  return [
    rule.type === 'required_status_checks',
    pinned(rule, 'CI Result', 15368),
    pinned(rule, 'Preview Result', 15368),
  ].every(Boolean);
}
function own(rule, repository) {
  return [
    rule.ruleset_source_type === 'Repository',
    rule.ruleset_source === repository,
    Number.isSafeInteger(rule.ruleset_id),
    rule.ruleset_id > 0,
  ].every(Boolean);
}
function queueRule(rule) {
  const parameters = rule.parameters ?? {};
  return [
    rule.type === 'merge_queue',
    parameters.grouping_strategy === 'ALLGREEN',
    parameters.max_entries_to_build === 1,
    parameters.max_entries_to_merge === 1,
    parameters.min_entries_to_merge === 1,
    parameters.merge_method === 'SQUASH',
  ].every(Boolean);
}
function reviewedQueue(check, rules, appId) {
  const related = rules.filter((rule) => rule.ruleset_id === check.ruleset_id);
  return [
    validationChecks(check),
    check.parameters?.strict_required_status_checks_policy === false,
    pinned(check, 'Review Admission', appId),
    related.some(queueRule),
    related.some(
      (rule) =>
        rule.type === 'pull_request' && rule.parameters?.required_review_thread_resolution === true
    ),
  ].every(Boolean);
}
function validRule(rule) {
  return [rule !== null, typeof rule === 'object', typeof rule?.type === 'string'].every(Boolean);
}
function queuePolicy(rules, repository, appId) {
  if (!Array.isArray(rules) || !rules.every(validRule))
    throw new Error('Malformed effective main branch rules.');
  const strict = rules.some(
    (rule) =>
      validationChecks(rule) && rule.parameters.strict_required_status_checks_policy === true
  );
  if (strict) return false;
  const owned = rules.filter((rule) => own(rule, repository));
  return owned.some((check) => reviewedQueue(check, owned, appId));
}
function configuredAdmissionId(value) {
  if (!/^\d+$/.test(String(value))) throw new Error('Invalid Review Admission App ID.');
  const appId = Number(value);
  if (!Number.isSafeInteger(appId)) throw new Error('Invalid Review Admission App ID.');
  return appId;
}
export async function dispatchedQueuePolicy({ github, repo, admissionAppId = 0 }) {
  const appId = configuredAdmissionId(admissionAppId === '' ? 0 : admissionAppId);
  if ([appId === 0, appId === 15368].some(Boolean)) return false;
  const rules = await github.paginate(github.rest.repos.getBranchRules, {
    ...repo,
    branch: 'main',
    per_page: 100,
  });
  return queuePolicy(rules, `${repo.owner}/${repo.repo}`, appId);
}
