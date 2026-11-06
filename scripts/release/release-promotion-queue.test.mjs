// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { beforeEach, expect, it, vi } from 'vitest';
import { queueOperations, queueReleasePromotion } from './release-promotion-queue.mjs';
import { candidateEvidence } from './release-promotion.mjs';
vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
vi.mock('./release-promotion.mjs', async (original) => ({
  ...(await original()),
  candidateEvidence: vi.fn(async () => ({})),
}));
vi.mock('../ci/review-admission-binding.mjs', async (original) => ({
  ...(await original()),
  requireReviewAdmission: vi.fn(),
  readAdmissionArchive: vi.fn(),
}));
const { requireReviewAdmission, readAdmissionArchive } = await import(
  new URL('../ci/review-admission-binding.mjs', import.meta.url)
);
const head = 'b'.repeat(40),
  source = 'a'.repeat(40);
beforeEach(() => vi.clearAllMocks());
function fixture(kind = 'admission') {
  const repo = { owner: 'owner', repo: 'repo' };
  const run = {
    id: kind === 'admission' ? 456 : 123,
    run_attempt: 1,
    head_sha: source,
    repository: { full_name: 'owner/repo' },
    head_repository: { full_name: 'owner/repo' },
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
    event: 'workflow_dispatch',
    path:
      kind === 'admission'
        ? '.github/workflows/review-admission.yml'
        : '.github/workflows/release.yml',
  };
  const preparation = { status: 'completed', conclusion: 'success' };
  const pr = {
    number: 901,
    state: 'open',
    draft: false,
    merged: false,
    user: { id: 41898282, type: 'Bot' },
    base: { ref: 'main', repo: { full_name: 'owner/repo' } },
    head: { sha: head, ref: 'wip/release-1.2.3-123-1', repo: { full_name: 'owner/repo' } },
  };
  const receipt = {
    schema: 1,
    number: 901,
    repository: 'owner/repo',
    statusSha: head,
    headSha: head,
    approved: true,
    runId: run.id,
    runAttempt: 1,
    workflowSourceSha: source,
  };
  const artifact = {
    id: 99,
    name: `${{ admission: 'review-admission', release: 'release-promotion' }[kind]}-${head}`,
    expired: false,
    size_in_bytes: 1000,
  };
  const state = { queued: false, comparison: 'ahead', queryHead: head, readCount: 0 };
  const github = {
    paginate: vi.fn(async () => [artifact]),
    graphql: vi.fn(async () => ({
      repository: {
        pullRequest: {
          headRefOid: state.queryHead,
          mergeQueueEntry: state.queued ? { id: 'entry' } : null,
        },
      },
    })),
    rest: {
      git: { getRef: vi.fn(async () => ({ data: { object: { sha: source } } })) },
      actions: {
        getWorkflowRun: vi.fn(async () => ({ data: run })),
        getWorkflowRunAttempt: vi.fn(async () => ({ data: preparation })),
        listWorkflowRunArtifacts: vi.fn(),
        downloadArtifact: vi.fn(async () => ({ data: Buffer.from('bounded archive') })),
      },
      repos: {
        compareCommits: vi.fn(async () => ({ data: { status: state.comparison } })),
        listPullRequestsAssociatedWithCommit: vi.fn(),
      },
      pulls: {
        get: vi.fn(async () => {
          state.readCount++;
          return { data: pr };
        }),
      },
    },
  };
  if (kind === 'release')
    github.paginate.mockImplementation(async (endpoint) =>
      endpoint === github.rest.repos.listPullRequestsAssociatedWithCommit ? [pr] : [artifact]
    );
  const operations = {
    policy: vi.fn(() => 'queue'),
    submit: vi.fn(() => {
      state.queued = true;
    }),
    dispatchMain: vi.fn(),
  };
  readAdmissionArchive.mockImplementation(async () => receipt);
  requireReviewAdmission.mockResolvedValue(receipt);
  candidateEvidence.mockResolvedValue({ baseSha: source });
  return {
    github,
    context: { repo, eventName: 'workflow_run', payload: { workflow_run: structuredClone(run) } },
    operations,
    run,
    preparation,
    pr,
    receipt,
    artifact,
    state,
  };
}
it.each(['admission', 'release'])(
  'enqueues verified generated release once on the %s wakeup and never waits or publishes',
  async (kind) => {
    const f = fixture(kind);
    expect(await queueReleasePromotion(f)).toEqual({ state: 'QUEUED', number: 901, head });
    expect(f.operations.submit).toHaveBeenCalledExactlyOnceWith(901, head, 'queue');
    expect(candidateEvidence).toHaveBeenCalledExactlyOnceWith(
      f.github,
      f.context.repo,
      f.pr,
      expect.any(Array)
    );
    expect(requireReviewAdmission).toHaveBeenCalledWith({
      github: f.github,
      repo: f.context.repo,
      head,
      number: f.pr.number,
    });
    expect(f.operations.dispatchMain).not.toHaveBeenCalled();
    expect((await queueReleasePromotion(f)).state).toBe('SKIPPED');
    expect(f.operations.submit).toHaveBeenCalledTimes(1);
  }
);
it('completed Release wakeup retries admission that raced the unfinished preparation run', async () => {
  const early = fixture();
  early.preparation.status = 'in_progress';
  expect((await queueReleasePromotion(early)).reason).toContain('Preparation is pending');
  expect(early.operations.submit).not.toHaveBeenCalled();
  const later = fixture('release');
  expect((await queueReleasePromotion(later)).state).toBe('QUEUED');
});
it.each(['release', 'ordinary'])(
  'pull_request_target admission uses trusted policy ancestry for a %s PR, not candidate ancestry',
  async (kind) => {
    const f = fixture();
    if (kind === 'ordinary') f.pr.head.ref = 'fix/app';
    f.run.event = 'pull_request_target';
    f.run.head_sha = head;
    f.run.head_branch = f.pr.head.ref;
    f.context.payload.workflow_run = structuredClone(f.run);
    f.github.rest.repos.compareCommits.mockImplementation(async ({ base }) => ({
      data: { status: base === source ? 'identical' : 'diverged' },
    }));
    expect((await queueReleasePromotion(f)).state).toBe(kind === 'release' ? 'QUEUED' : 'SKIPPED');
    expect(f.github.rest.repos.compareCommits).toHaveBeenCalledExactlyOnceWith({
      ...f.context.repo,
      base: source,
      head: 'main',
    });
    expect(f.operations.submit).toHaveBeenCalledTimes(kind === 'release' ? 1 : 0);
    expect(f.operations.dispatchMain).not.toHaveBeenCalled();
  }
);
it.each([undefined, '', 'not-a-sha', 'c'.repeat(40)])(
  'rejects missing, malformed, or untrusted admission policy source %s before reading the PR',
  async (policySource) => {
    const f = fixture();
    f.receipt.workflowSourceSha = policySource;
    f.github.rest.repos.compareCommits.mockImplementation(async ({ base }) => ({
      data: { status: base === source ? 'identical' : 'diverged' },
    }));
    await expect(queueReleasePromotion(f)).rejects.toThrow();
    expect(f.github.rest.pulls.get).not.toHaveBeenCalled();
    expect(f.operations.submit).not.toHaveBeenCalled();
    expect(f.operations.dispatchMain).not.toHaveBeenCalled();
  }
);
it.each(['ordinary', 'integration'])(
  'untrusted policy provenance cannot hide behind a skipped %s receipt',
  async (kind) => {
    const f = fixture();
    f.receipt.workflowSourceSha = 'c'.repeat(40);
    if (kind === 'ordinary') f.pr.head.ref = 'fix/app';
    if (kind === 'integration') f.receipt.headSha = 'd'.repeat(40);
    f.github.rest.repos.compareCommits.mockImplementation(async ({ base }) => ({
      data: { status: base === source ? 'identical' : 'diverged' },
    }));
    await expect(queueReleasePromotion(f)).rejects.toThrow('not on trusted main history');
    expect(f.github.rest.pulls.get).not.toHaveBeenCalled();
    expect(f.operations.submit).not.toHaveBeenCalled();
  }
);
it('release preparation still authenticates its main run SHA before reading any artifact', async () => {
  const f = fixture('release');
  f.run.head_sha = head;
  f.github.rest.repos.compareCommits.mockImplementation(async ({ base }) => ({
    data: { status: base === source ? 'identical' : 'diverged' },
  }));
  await expect(queueReleasePromotion(f)).rejects.toThrow('not on trusted main history');
  expect(f.github.rest.actions.downloadArtifact).not.toHaveBeenCalled();
  expect(f.github.paginate).not.toHaveBeenCalled();
  expect(f.operations.submit).not.toHaveBeenCalled();
});
it.each([
  ['unknown source path', (f) => (f.run.path = '.github/workflows/evil.yml')],
  ['fork source repository', (f) => (f.run.repository.full_name = 'fork/repo')],
  ['wrong source attempt', (f) => (f.run.run_attempt = 0)],
  ['untrusted source event', (f) => (f.run.event = 'pull_request')],
  ['branch controller dispatch', (f) => (f.run.head_branch = 'evil')],
  ['non-main source ancestry', (f) => (f.state.comparison = 'diverged')],
  ['failed source', (f) => (f.run.conclusion = 'failure')],
  ['expired source receipt', (f) => (f.artifact.expired = true)],
  ['foreign receipt', (f) => (f.receipt.repository = 'other/repo')],
  ['wrong receipt attempt', (f) => (f.receipt.runAttempt = 2)],
  ['unapproved receipt', (f) => (f.receipt.approved = false)],
  ['wrong canonical actor', (f) => (f.pr.user.id = 999)],
  ['fork PR', (f) => (f.pr.head.repo.full_name = 'fork/repo')],
  ['malformed generated branch', (f) => (f.pr.head.ref = 'wip/release-untrusted')],
  ['changed current head', (f) => (f.pr.head.sha = 'c'.repeat(40))],
  ['changed queried head', (f) => (f.state.queryHead = 'c'.repeat(40))],
  ['failed preparation', (f) => (f.preparation.conclusion = 'failure')],
])('rejects %s without queue writes', async (_label, mutate) => {
  const f = fixture();
  mutate(f);
  await expect(queueReleasePromotion(f)).rejects.toThrow();
  expect(f.operations.submit).not.toHaveBeenCalled();
  expect(f.operations.dispatchMain).not.toHaveBeenCalled();
});
it('authenticates source before parsing or downloading a receipt', async () => {
  const f = fixture();
  f.run.path = '.github/workflows/evil.yml';
  await expect(queueReleasePromotion(f)).rejects.toThrow();
  expect(f.github.rest.actions.downloadArtifact).not.toHaveBeenCalled();
  expect(readAdmissionArchive).not.toHaveBeenCalled();
});
it('ignores removed entries and integration-head receipts rather than re-enqueueing member PRs', async () => {
  const f = fixture();
  f.receipt.headSha = 'c'.repeat(40);
  expect((await queueReleasePromotion(f)).state).toBe('SKIPPED');
  expect(f.operations.submit).not.toHaveBeenCalled();
});
it.each(['draft', 'closed', 'queued'])('skips an already %s PR idempotently', async (status) => {
  const f = fixture();
  if (status === 'draft') f.pr.draft = true;
  if (status === 'closed') f.pr.state = 'closed';
  if (status === 'queued') f.state.queued = true;
  expect((await queueReleasePromotion(f)).state).toBe('SKIPPED');
  expect(f.operations.submit).not.toHaveBeenCalled();
});
it('requires actual immutable source/assets/CI/preview proof and authenticated latest admission', async () => {
  const f = fixture();
  candidateEvidence.mockRejectedValueOnce(new Error('Candidate CI/preview proof missing'));
  await expect(queueReleasePromotion(f)).rejects.toThrow('CI/preview');
  requireReviewAdmission.mockRejectedValueOnce(new Error('Forged admission binding'));
  await expect(queueReleasePromotion(f)).rejects.toThrow('Forged admission');
  expect(f.operations.submit).not.toHaveBeenCalled();
});
it('rechecks live head immediately before submission; head changes cannot enqueue', async () => {
  const f = fixture();
  f.github.rest.pulls.get
    .mockResolvedValueOnce({ data: f.pr })
    .mockResolvedValueOnce({ data: { ...f.pr, head: { ...f.pr.head, sha: 'c'.repeat(40) } } });
  await expect(queueReleasePromotion(f)).rejects.toThrow('head changed');
  expect(f.operations.submit).not.toHaveBeenCalled();
});
it('dispatches main CI only after an actual confirmed merge, never after queue submission', async () => {
  const f = fixture();
  f.operations.policy.mockReturnValue('strict');
  f.operations.submit.mockImplementation(() => {
    f.pr.merged = true;
    f.pr.state = 'closed';
  });
  expect((await queueReleasePromotion(f)).state).toBe('MERGED');
  expect(f.operations.dispatchMain).toHaveBeenCalledTimes(1);
});
it('submits strict-queue promotion with exact-head gates and leaves confirmed OPEN queue entries pending', async () => {
  const f = fixture();
  f.operations.policy.mockReturnValue('strict-queue');
  expect((await queueReleasePromotion(f)).state).toBe('QUEUED');
  expect(f.operations.submit).toHaveBeenCalledExactlyOnceWith(901, head, 'strict-queue');
  expect(f.operations.dispatchMain).not.toHaveBeenCalled();
});
it('does not claim QUEUED when submission is accepted without a confirmed queue entry', async () => {
  const f = fixture();
  f.operations.submit.mockImplementation(() => {});
  expect((await queueReleasePromotion(f)).reason).toContain('not confirmed');
  expect(f.operations.dispatchMain).not.toHaveBeenCalled();
});
it('metadata read failure fails closed and never turns into an empty success', async () => {
  const f = fixture();
  f.github.paginate.mockRejectedValue(new Error('API unavailable'));
  await expect(queueReleasePromotion(f)).rejects.toThrow('API unavailable');
  expect(f.operations.submit).not.toHaveBeenCalled();
});
it('CLI operations use trusted policy and guarded native enqueue without auto-merge', () => {
  execFileSync.mockReturnValue('queue\n');
  const operations = queueOperations({ owner: 'owner', repo: 'repo' });
  expect(operations.policy()).toBe('queue');
  operations.submit(901, head, 'queue');
  expect(execFileSync.mock.calls[1][0]).toBe(process.execPath);
  const [helper, ...args] = execFileSync.mock.calls[1][1];
  expect(helper).toMatch(/\/ci\/enqueue-pr-cli\.mjs$/);
  expect(args).toEqual(['owner/repo', '901', head]);
  expect(
    execFileSync.mock.calls
      .flatMap((call) => call[1])
      .some((arg) => ['--admin', '--auto'].includes(arg))
  ).toBe(false);
});
it.each(['strict'])('CLI %s submits an explicit head-pinned squash without bypass', (mode) => {
  const operations = queueOperations({ owner: 'owner', repo: 'repo' });
  operations.submit(901, head, mode);
  expect(execFileSync).toHaveBeenCalledTimes(1);
  expect(execFileSync.mock.calls[0].slice(0, 2)).toEqual([
    'gh',
    ['pr', 'merge', '901', '--repo', 'owner/repo', '--match-head-commit', head, '--squash'],
  ]);
});
it('strict-queue uses the same guarded native enqueue while freshness coexists', () => {
  const operations = queueOperations({ owner: 'owner', repo: 'repo' });
  operations.submit(901, head, 'strict-queue');
  expect(execFileSync.mock.calls[0][0]).toBe(process.execPath);
  expect(execFileSync.mock.calls[0][1][0]).toMatch(/\/ci\/enqueue-pr-cli\.mjs$/);
  expect(execFileSync.mock.calls[0][1].slice(1)).toEqual(['owner/repo', '901', head]);
});
it('consumes the PR-head receipt alongside its queue-head receipt without re-enqueueing the group', async () => {
  const f = fixture();
  const groupHead = 'c'.repeat(40);
  const groupArtifact = { ...f.artifact, id: 100, name: `review-admission-${groupHead}` };
  f.github.paginate.mockResolvedValue([f.artifact, groupArtifact]);
  readAdmissionArchive.mockImplementation(async (_bytes, statusSha) =>
    statusSha === groupHead ? { ...f.receipt, statusSha: groupHead } : f.receipt
  );
  expect((await queueReleasePromotion(f)).state).toBe('QUEUED');
  expect(f.operations.submit).toHaveBeenCalledTimes(1);
});
it('ignores the PR Controls target locator that admission runs upload beside receipts', async () => {
  const f = fixture();
  const locator = { ...f.artifact, id: 101, name: 'review-admission-target-1' };
  f.github.paginate.mockResolvedValue([locator, f.artifact]);
  expect((await queueReleasePromotion(f)).state).toBe('QUEUED');
  // A held admission run uploads only the locator: nothing to enqueue, and no failure.
  const held = fixture();
  held.github.paginate.mockResolvedValue([{ ...held.artifact, name: 'review-admission-target-2' }]);
  expect((await queueReleasePromotion(held)).state).toBe('SKIPPED');
  expect(held.operations.submit).not.toHaveBeenCalled();
  // Any other non-SHA admission artifact still fails closed.
  for (const name of [
    'review-admission-target-0',
    'review-admission-target-x',
    'review-admission-x',
  ]) {
    const odd = fixture();
    odd.github.paginate.mockResolvedValue([{ ...odd.artifact, name }]);
    await expect(queueReleasePromotion(odd)).rejects.toThrow('Invalid artifact revision.');
  }
});
it('skips ordinary independently reviewed PRs and stale generated source snapshots', async () => {
  const ordinary = fixture();
  ordinary.pr.head.ref = 'fix/app';
  expect((await queueReleasePromotion(ordinary)).state).toBe('SKIPPED');
  const stale = fixture();
  stale.github.rest.git.getRef.mockResolvedValue({ data: { object: { sha: 'c'.repeat(40) } } });
  expect((await queueReleasePromotion(stale)).reason).toContain('no longer main');
  expect(stale.operations.submit).not.toHaveBeenCalled();
});
it('a completed release publication callback cannot act as a new preparation/queue wakeup', async () => {
  const f = fixture('release');
  f.run.event = 'workflow_run';
  expect((await queueReleasePromotion(f)).state).toBe('SKIPPED');
  expect(f.operations.submit).not.toHaveBeenCalled();
  expect(f.github.paginate).not.toHaveBeenCalled();
});
