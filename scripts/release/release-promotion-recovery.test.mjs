// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { prepareRollback } from './release-promotion-recovery.mjs';
import { rollbackPromotion } from './release-promotion.mjs';
vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
vi.mock('node:fs', () => ({ writeFileSync: vi.fn() }));
vi.mock('./release-promotion.mjs', () => ({ queuedRelease: vi.fn(), rollbackPromotion: vi.fn() }));
const sha = 'a'.repeat(40);
const reply = (data, httpStatus = 200) =>
  `HTTP/2.0 ${httpStatus} OK\ncontent-type: application/json\n\n${JSON.stringify(data)}`;
let branch, dirty, main, conclusion, prefix;
function readOnlyCommand([tool, args]) {
  if (tool === 'git')
    return [
      ['branch', '--show-current'],
      ['status', '--porcelain'],
      ['rev-parse', 'HEAD'],
      ['rev-parse', '--show-prefix'],
    ].some((allowed) => JSON.stringify(args) === JSON.stringify(allowed));
  return [
    tool === 'gh',
    args.length === 3,
    args[0] === 'api',
    args[1] === '--include',
    args[2]?.startsWith('repos/owner/repo'),
  ].every(Boolean);
}
beforeEach(() => {
  vi.resetAllMocks();
  branch = 'fix/release-recovery';
  dirty = '';
  main = sha;
  conclusion = 'success';
  prefix = '';
  const gitResults = new Map([
    ['branch --show-current', () => branch],
    ['status --porcelain', () => dirty],
    ['rev-parse HEAD', () => sha],
    ['rev-parse --show-prefix', () => prefix],
  ]);
  const responses = new Map([
    ['repos/owner/repo/git/ref/heads/main', () => ({ object: { sha: main } })],
    [
      `repos/owner/repo/actions/workflows/ci.yml/runs?branch=main&head_sha=${sha}&per_page=100`,
      () => ({
        workflow_runs: [
          {
            id: 1,
            path: '.github/workflows/ci.yml',
            head_branch: 'main',
            head_sha: sha,
            event: 'push',
            head_repository: { id: 456 },
            status: 'completed',
            conclusion,
          },
        ],
      }),
    ],
    ['repos/owner/repo', () => ({ id: 456 })],
  ]);
  execFileSync.mockImplementation((tool, args) => {
    if (!readOnlyCommand([tool, args])) throw new Error('Unexpected write command');
    if (tool === 'git') return gitResults.get(args.join(' '))();
    const endpoint = args.at(-1);
    if (!responses.has(endpoint)) throw new Error('Unexpected command');
    return reply(responses.get(endpoint)());
  });
  rollbackPromotion.mockResolvedValue({
    manifest: '{"version":"1.2.2"}\n',
    changelog: 'old notes',
  });
});
it('creates only two local generated asset edits after current-main identity and CI proof', async () => {
  await prepareRollback('owner/repo', '901');
  expect(writeFileSync.mock.calls).toEqual([
    ['package.json', '{"version":"1.2.2"}\n'],
    ['CHANGELOG.md', 'old notes'],
  ]);
  expect(execFileSync.mock.calls.map((call) => call.slice(0, 2)).every(readOnlyCommand)).toBe(true);
});
it.each([
  ['git', ['push', 'origin', 'HEAD:main']],
  ['gh', ['api', '-X', 'POST', 'repos/owner/repo/pulls']],
  ['gh', ['api', '--method', 'POST', 'repos/owner/repo/pulls']],
])('read-only command allowlist rejects %s write arguments', (tool, args) => {
  expect(readOnlyCommand([tool, args])).toBe(false);
});
it('rejects nested working directories before GitHub reads or writing generated assets', async () => {
  prefix = 'scripts/release/';
  await expect(prepareRollback('owner/repo', '901')).rejects.toThrow('repository root');
  expect(writeFileSync).not.toHaveBeenCalled();
  expect(execFileSync.mock.calls.some(([tool]) => tool === 'gh')).toBe(false);
});
it.each(['owner/repo;touch unwanted', '../repo', 'owner'])(
  'rejects malformed repository %s',
  async (repository) => {
    await expect(prepareRollback(repository, '901')).rejects.toThrow();
    expect(writeFileSync).not.toHaveBeenCalled();
  }
);
it('rejects dirty checkout, default branch, stale main or failed CI before touching files', async () => {
  dirty = ' M app/unrelated.vue';
  await expect(prepareRollback('owner/repo', '901')).rejects.toThrow('clean checkout');
  dirty = '';
  branch = 'main';
  await expect(prepareRollback('owner/repo', '901')).rejects.toThrow('dedicated topic');
  branch = 'fix/release-recovery';
  main = 'b'.repeat(40);
  await expect(prepareRollback('owner/repo', '901')).rejects.toThrow('current main');
  main = sha;
  conclusion = 'failure';
  await expect(prepareRollback('owner/repo', '901')).rejects.toThrow('Latest main CI');
  expect(writeFileSync).not.toHaveBeenCalled();
});
it('distinguishes authenticated HTTP 404 from tool failure in optional GitHub reads', async () => {
  const normal = execFileSync.getMockImplementation();
  execFileSync.mockImplementation((tool, args, options) => {
    if (args.at(-1).endsWith('/tags/v1.2.3'))
      throw Object.assign(new Error('gh failed'), {
        status: 1,
        stdout: reply({ message: 'Not found' }, 404),
      });
    return normal(tool, args, options);
  });
  rollbackPromotion.mockImplementation(async ({ github }) => {
    await expect(github.rest.git.getRef({ ref: 'tags/v1.2.3' })).rejects.toHaveProperty(
      'status',
      404
    );
    return { manifest: '{}', changelog: 'old' };
  });
  await prepareRollback('owner/repo', '901');
});
it('propagates network/tool errors without producing a fake absent-tag proof or local edits', async () => {
  const normal = execFileSync.getMockImplementation();
  execFileSync.mockImplementation((tool, args, options) => {
    if (args.at(-1).endsWith('/tags/v1.2.3'))
      throw Object.assign(new Error('Network unavailable'), { status: 1 });
    return normal(tool, args, options);
  });
  rollbackPromotion.mockImplementation(async ({ github }) =>
    github.rest.git.getRef({ ref: 'tags/v1.2.3' })
  );
  await expect(prepareRollback('owner/repo', '901')).rejects.toThrow('Network unavailable');
  expect(writeFileSync).not.toHaveBeenCalled();
});
