// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { releaseEligibility } from './release-gate.mjs';
const sha = 'a'.repeat(40);
function fixture() {
  const run = {
    id: 123,
    event: 'push',
    head_branch: 'main',
    head_repository: { id: 456 },
    path: '.github/workflows/ci.yml',
    status: 'completed',
    conclusion: 'success',
    head_sha: sha,
    run_attempt: 1,
    run_started_at: '2026-09-29T14:00:00Z',
    head_commit: { message: 'fix(api): reject malformed state' },
  };
  const context = {
    eventName: 'schedule',
    ref: 'refs/heads/main',
    sha,
    repo: { owner: 'owner', repo: 'repo' },
    payload: { repository: { id: 456 } },
  };
  const main = { object: { sha } };
  const runs = [run];
  const github = {
    rest: {
      actions: {
        listWorkflowRuns: vi.fn(async () => ({ data: { workflow_runs: runs } })),
      },
      git: { getRef: vi.fn().mockResolvedValue({ data: main }) },
    },
  };
  return { run, runs, main, context, github };
}
describe('release eligibility', () => {
  it.each(['schedule', 'workflow_dispatch'])(
    'releases the %s trigger commit when its main CI passed and it is still main',
    async (eventName) => {
      const f = fixture();
      f.context.eventName = eventName;
      expect(await releaseEligibility(f)).toMatchObject({ release: true, sha });
      expect(f.github.rest.actions.listWorkflowRuns).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        workflow_id: 'ci.yml',
        branch: 'main',
        head_sha: sha,
        per_page: 100,
      });
    }
  );
  it.each([
    { eventName: 'workflow_run' },
    { eventName: 'push' },
    { eventName: 'pull_request' },
    { ref: 'refs/heads/develop' },
    { ref: 'refs/tags/v1.2.3' },
    { sha: 'abc1234' },
    { sha: undefined },
  ])('rejects non-release triggers before reading CI: %o', async (changes) => {
    const f = fixture();
    Object.assign(f.context, changes);
    expect((await releaseEligibility(f)).release).toBe(false);
    expect(f.github.rest.actions.listWorkflowRuns).not.toHaveBeenCalled();
  });
  it.each([
    { conclusion: 'failure' },
    { conclusion: 'cancelled' },
    { status: 'in_progress', conclusion: null },
    { event: 'pull_request' },
    { head_branch: 'wip/release-1.2.3' },
    { head_sha: 'b'.repeat(40) },
    { path: '.github/workflows/unrelated.yml' },
    { head_repository: { id: 999 } },
    { head_repository: null },
  ])('rejects missing, unsuccessful or untrusted CI evidence: %o', async (changes) => {
    const f = fixture();
    Object.assign(f.run, changes);
    expect((await releaseEligibility(f)).release).toBe(false);
    expect(f.github.rest.git.getRef).not.toHaveBeenCalled();
  });
  it('accepts dispatched main CI, such as the Crowdin post-merge run', async () => {
    const f = fixture();
    f.run.event = 'workflow_dispatch';
    expect((await releaseEligibility(f)).release).toBe(true);
  });
  it('lets the most recently started CI attempt decide, including a later failure', async () => {
    const f = fixture();
    const later = '2026-09-29T14:30:00Z';
    f.runs.push({
      ...f.run,
      id: 200,
      event: 'workflow_dispatch',
      conclusion: 'failure',
      run_started_at: later,
    });
    expect((await releaseEligibility(f)).release).toBe(false);
    f.runs.splice(1, 1, {
      ...f.run,
      id: 50,
      conclusion: 'failure',
      run_started_at: '2026-09-29T13:00:00Z',
    });
    expect((await releaseEligibility(f)).release).toBe(true);
  });
  it('treats a rerun of an older run record as the latest evidence', async () => {
    const f = fixture();
    // Run 100 was created first but rerun after run 123 succeeded; its attempt 2 is still running.
    f.runs.push({
      ...f.run,
      id: 100,
      run_attempt: 2,
      status: 'in_progress',
      conclusion: null,
      run_started_at: '2026-09-29T15:00:00Z',
    });
    expect(await releaseEligibility(f)).toMatchObject({ release: false });
  });
  it('breaks start-time ties by the newer run id', async () => {
    const f = fixture();
    f.runs.push({ ...f.run, id: 50, conclusion: 'failure' });
    expect((await releaseEligibility(f)).release).toBe(true);
    f.runs.push({ ...f.run, id: 300, conclusion: 'failure' });
    expect((await releaseEligibility(f)).release).toBe(false);
  });
});
describe('release freshness and failures', () => {
  it('skips a newer unvalidated main instead of checking it out', async () => {
    const f = fixture();
    f.main.object.sha = 'b'.repeat(40);
    expect(await releaseEligibility(f)).toMatchObject({ release: false });
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
    f.github.rest.actions.listWorkflowRuns.mockRejectedValue(new Error('Actions unavailable'));
    await expect(releaseEligibility(f)).rejects.toThrow('Actions unavailable');
  });
});
