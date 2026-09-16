// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { reportDispatchedCi } from './report-dispatched-ci.mjs';
function fixture() {
  return {
    github: { rest: { repos: { createCommitStatus: vi.fn().mockResolvedValue({}) } } },
    context: {
      eventName: 'workflow_dispatch',
      repo: { owner: 'example', repo: 'repo' },
      sha: 'a'.repeat(40),
      serverUrl: 'https://github.com',
      runId: 123,
    },
    outcome: 'success',
  };
}
describe('dispatched CI commit status', () => {
  it('reports the real aggregate success on the exact validated SHA with a run link', async () => {
    const f = fixture();
    await reportDispatchedCi(f);
    expect(f.github.rest.repos.createCommitStatus).toHaveBeenCalledExactlyOnceWith({
      owner: 'example',
      repo: 'repo',
      sha: f.context.sha,
      context: 'CI Result',
      state: 'success',
      description: 'All selected CI jobs passed.',
      target_url: 'https://github.com/example/repo/actions/runs/123',
    });
  });
  it.each(['failure', 'cancelled', 'skipped', '', undefined])(
    'fails closed for outcome %s',
    async (outcome) => {
      const f = fixture();
      await reportDispatchedCi({ ...f, outcome });
      expect(f.github.rest.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({ sha: f.context.sha, state: 'failure' })
      );
    }
  );
  it.each(['push', 'pull_request', 'pull_request_target'])(
    'does not publish for %s',
    async (eventName) => {
      const f = fixture();
      f.context.eventName = eventName;
      await reportDispatchedCi(f);
      expect(f.github.rest.repos.createCommitStatus).not.toHaveBeenCalled();
    }
  );
  it('propagates publication failure so the CI Result job cannot pass', async () => {
    const f = fixture();
    f.github.rest.repos.createCommitStatus.mockRejectedValue(new Error('GitHub rejected status'));
    await expect(reportDispatchedCi(f)).rejects.toThrow('GitHub rejected status');
  });
});
