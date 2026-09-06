function successfulMainPush(run) {
  return run?.event === 'push' && run.head_branch === 'main';
}
function trustedRun(run, repositoryId) {
  if (!successfulMainPush(run)) return false;
  return run.head_repository?.id === repositoryId && completedSuccessfully(run);
}
function completedSuccessfully(run) {
  return run.status === 'completed' && run.conclusion === 'success';
}
function matchesEvent(run, eventRun, repositoryId) {
  return (
    trustedRun(run, repositoryId) &&
    run.path === '.github/workflows/ci.yml' &&
    run.head_sha === eventRun.head_sha &&
    run.run_attempt === eventRun.run_attempt
  );
}
function explicitlySkipsAutomation(run) {
  const message = run.head_commit?.message ?? '';
  return /\[(skip ci|ci skip|no ci|skip actions|actions skip)\]/i.test(message);
}
function eligibleEvidence(run, eventRun, repositoryId) {
  return matchesEvent(run, eventRun, repositoryId) && !explicitlySkipsAutomation(run);
}
// Re-read CI and main each time: a queued release or a CI rerun can supersede the event.
export async function releaseEligibility({ github, context }) {
  const eventRun = context.payload.workflow_run;
  const repositoryId = context.payload.repository.id;
  const skip = (reason) => ({ release: false, reason });
  if (!trustedRun(eventRun, repositoryId))
    return skip('Only successful CI for a main push may release.');
  const { data: run } = await github.rest.actions.getWorkflowRun({
    ...context.repo,
    run_id: eventRun.id,
  });
  if (!eligibleEvidence(run, eventRun, repositoryId)) {
    return skip(
      'CI evidence changed or the commit skips automation; publication is not authorized.'
    );
  }
  const { data: main } = await github.rest.git.getRef({ ...context.repo, ref: 'heads/main' });
  if (main.object.sha !== run.head_sha) {
    return skip('Validated commit is no longer main; its successor must pass CI before release.');
  }
  return {
    release: true,
    sha: run.head_sha,
    reason: `Release validated main commit ${run.head_sha}.`,
  };
}
