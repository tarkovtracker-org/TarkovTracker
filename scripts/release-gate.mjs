// Re-read CI and main each time: a queued release or a CI rerun can supersede the event.
export async function releaseEligibility({ github, context }) {
  const eventRun = context.payload.workflow_run;
  const repositoryId = context.payload.repository.id;
  const trusted = (run) =>
    run?.event === 'push' &&
    run.head_branch === 'main' &&
    run.head_repository?.id === repositoryId &&
    run.status === 'completed' &&
    run.conclusion === 'success';
  const skip = (reason) => ({ release: false, reason });
  if (!trusted(eventRun)) return skip('Only successful CI for a main push may release.');
  const { data: run } = await github.rest.actions.getWorkflowRun({
    ...context.repo,
    run_id: eventRun.id,
  });
  if (
    !trusted(run) ||
    run.path !== '.github/workflows/ci.yml' ||
    run.head_sha !== eventRun.head_sha ||
    run.run_attempt !== eventRun.run_attempt
  ) {
    return skip('CI evidence changed after the completion event; wait for its latest result.');
  }
  if (
    /\[(skip ci|ci skip|no ci|skip actions|actions skip)\]/i.test(run.head_commit?.message ?? '')
  ) {
    return skip('The validated commit explicitly skips automation.');
  }
  const { data: main } = await github.rest.git.getRef({ ...context.repo, ref: 'heads/main' });
  if (main.object.sha !== run.head_sha) {
    return skip('Validated commit is no longer main; its successor must pass CI before release.');
  }
  return { release: true, reason: `Release validated main commit ${run.head_sha}.` };
}
