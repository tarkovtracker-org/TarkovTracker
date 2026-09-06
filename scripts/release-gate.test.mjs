// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { releaseEligibility } from './release-gate.mjs';
function fixture() {
  const run = {
    id: 123,
    event: 'push',
    head_branch: 'main',
    head_repository: { id: 456 },
    path: '.github/workflows/ci.yml',
    status: 'completed',
    conclusion: 'success',
    head_sha: 'a'.repeat(40),
    run_attempt: 1,
    head_commit: { message: 'fix(api): reject malformed state' },
  };
  const context = {
    repo: { owner: 'owner', repo: 'repo' },
    payload: { repository: { id: 456 }, workflow_run: structuredClone(run) },
  };
  const main = { object: { sha: run.head_sha } };
  const github = {
    rest: {
      actions: { getWorkflowRun: vi.fn().mockResolvedValue({ data: run }) },
      git: { getRef: vi.fn().mockResolvedValue({ data: main }) },
    },
  };
  return { run, main, context, github };
}
describe('release eligibility', () => {
  it('releases only the successful CI commit still at main', async () => {
    const f = fixture();
    // Webhook payloads need not include the workflow path; verify it through the API.
    delete f.context.payload.workflow_run.path;
    expect(await releaseEligibility(f)).toMatchObject({ release: true, sha: f.run.head_sha });
    expect(f.github.rest.actions.getWorkflowRun).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      run_id: 123,
    });
  });
  it.each([
    { event: 'pull_request' },
    { head_branch: 'develop' },
    { head_repository: { id: 999 } },
    { head_repository: null },
    { conclusion: 'failure' },
    { conclusion: 'cancelled' },
    { status: 'in_progress' },
  ])('rejects untrusted or unsuccessful events: %o', async (changes) => {
    const f = fixture();
    Object.assign(f.context.payload.workflow_run, changes);
    expect((await releaseEligibility(f)).release).toBe(false);
    expect(f.github.rest.actions.getWorkflowRun).not.toHaveBeenCalled();
  });
  it.each([
    { conclusion: 'failure' },
    { status: 'in_progress', conclusion: null },
    { run_attempt: 2 },
    { head_sha: 'b'.repeat(40) },
    { path: '.github/workflows/unrelated.yml' },
    { head_repository: { id: 999 } },
  ])('rejects stale or mismatched live CI evidence: %o', async (changes) => {
    const f = fixture();
    Object.assign(f.run, changes);
    expect((await releaseEligibility(f)).release).toBe(false);
  });
});
describe('release freshness and failures', () => {
  it('skips a newer unvalidated main instead of checking it out', async () => {
    const f = fixture();
    f.main.object.sha = 'b'.repeat(40);
    expect((await releaseEligibility(f)).release).toBe(false);
  });
  it('detects main advancing during setup/build, including a release version commit', async () => {
    const f = fixture();
    expect((await releaseEligibility(f)).release).toBe(true);
    f.main.object.sha = 'c'.repeat(40);
    expect((await releaseEligibility(f)).release).toBe(false);
  });
  it.each(['skip ci', 'ci skip', 'no ci', 'skip actions', 'actions skip'])(
    'preserves the %s marker even when CI is rerun manually',
    async (marker) => {
      const f = fixture();
      f.run.head_commit.message = `chore(release): 1.2.3 [${marker}]`;
      expect((await releaseEligibility(f)).release).toBe(false);
    }
  );
  it.each(['skip-checks: true', 'skip-checks:true', 'skip-checks: true\r'])(
    'rejects a rerun with trailer %s',
    async (trailer) => {
      const f = fixture();
      f.run.head_commit.message = `chore: update metadata\n\n\n${trailer}`;
      expect((await releaseEligibility(f)).release).toBe(false);
    }
  );
  it('does not treat a false trailer or an inline mention as a skip directive', async () => {
    const f = fixture();
    f.run.head_commit.message = 'fix: explain skip-checks: true usage\n\n\nskip-checks: false';
    expect((await releaseEligibility(f)).release).toBe(true);
  });
  it('fails closed on API errors', async () => {
    const f = fixture();
    f.github.rest.git.getRef.mockRejectedValue(new Error('GitHub unavailable'));
    await expect(releaseEligibility(f)).rejects.toThrow('GitHub unavailable');
  });
});
