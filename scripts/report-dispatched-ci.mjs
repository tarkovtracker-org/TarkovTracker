// Dispatch-created job checks are excluded from branch-rule evaluation by GitHub.
// Publish the aggregate validator outcome as a commit status on the same immutable SHA.
export async function reportDispatchedCi({ github, context, outcome }) {
  if (context.eventName !== 'workflow_dispatch') return;
  const state = outcome === 'success' ? 'success' : 'failure';
  await github.rest.repos.createCommitStatus({
    ...context.repo,
    sha: context.sha,
    context: 'CI Result',
    state,
    description:
      state === 'success' ? 'All selected CI jobs passed.' : 'CI validation did not succeed.',
    target_url: `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
  });
}
