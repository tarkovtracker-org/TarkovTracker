// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { notifyReleasedPullRequests, previousStableTag } from './release-notifications.mjs';
import { publishRecoveredRelease } from './release-recovery.mjs';
const sha = 'f'.repeat(40);
const repo = { owner: 'owner', repo: 'repo' };
const url = 'https://github.com/owner/repo/releases/tag/v1.3.0';
const merged = (number, base = 'main') => ({
  number,
  merged_at: '2026-10-18T00:00:00Z',
  base: { ref: base },
});
async function associatedPages(method, params) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const { data } = await method({ ...params, page });
    items.push(...data);
    if (data.length < params.per_page) return items;
  }
}
function fixture({ comments = {}, prsBySha, releases } = {}) {
  const byPage = {
    'v1.2.0': [{ sha: 'a' }, { sha: 'b' }, { sha: 'c' }, { sha }],
  };
  const prs = prsBySha ?? {
    a: [merged(10)],
    b: [merged(10), merged(11)],
    c: [merged(12, 'develop'), { number: 13, merged_at: null, base: { ref: 'main' } }],
    [sha]: [merged(99)],
  };
  const rest = {
    repos: {
      getReleaseByTag: vi.fn().mockResolvedValue({
        data: { tag_name: 'v1.3.0', draft: false, prerelease: false, html_url: url },
      }),
      getLatestRelease: vi.fn().mockResolvedValue({
        data: { tag_name: 'v1.3.0', draft: false, prerelease: false, html_url: url },
      }),
      listReleases: vi.fn(),
      compareCommitsWithBasehead: vi.fn(async ({ basehead }) => ({
        data: { status: 'ahead', commits: byPage[basehead.split('...')[0]] },
      })),
      listPullRequestsAssociatedWithCommit: vi.fn(async ({ commit_sha }) => ({
        data: prs[commit_sha] ?? [],
      })),
    },
    git: { getRef: vi.fn().mockResolvedValue({ data: { object: { type: 'commit', sha } } }) },
    issues: {
      listComments: vi.fn(),
      createComment: vi.fn().mockResolvedValue({}),
      addLabels: vi.fn().mockResolvedValue({}),
    },
  };
  const stableReleases = releases ?? [
    { tag_name: 'v1.3.0', draft: false, prerelease: false },
    { tag_name: 'v1.2.0', draft: false, prerelease: false },
    { tag_name: 'v1.1.0', draft: false, prerelease: false },
  ];
  const pages = new Map([
    [rest.repos.listReleases, () => stableReleases],
    [
      rest.repos.listPullRequestsAssociatedWithCommit,
      (params) => associatedPages(rest.repos.listPullRequestsAssociatedWithCommit, params),
    ],
    [rest.issues.listComments, (params) => comments[params.issue_number] ?? []],
  ]);
  const github = { rest, paginate: vi.fn((method, params) => pages.get(method)(params)) };
  return { github, rest, context: { repo }, version: '1.3.0', sha };
}
describe('release PR notifications', () => {
  it('comments on and labels each merged main PR once, excluding the version commit', async () => {
    const f = fixture();
    const result = await notifyReleasedPullRequests(f);
    expect(result).toMatchObject({ tag: 'v1.3.0', previous: 'v1.2.0', notified: [10, 11] });
    expect(f.rest.repos.compareCommitsWithBasehead).toHaveBeenCalledWith(
      expect.objectContaining({ basehead: `v1.2.0...${sha}` })
    );
    expect(f.rest.issues.createComment).toHaveBeenCalledTimes(2);
    expect(f.rest.issues.createComment).toHaveBeenCalledWith({
      ...repo,
      issue_number: 10,
      body: `<!-- release-notification:v1.3.0 -->\n:tada: This PR is included in version 1.3.0 :tada:\n\nThe release is available on [GitHub release](${url})`,
    });
    expect(f.rest.issues.addLabels).toHaveBeenCalledWith({
      ...repo,
      issue_number: 11,
      labels: ['released'],
    });
    expect(f.rest.issues.addLabels).not.toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 99 })
    );
  });
  it('skips comments already posted by the bot for this version on reruns', async () => {
    const bot = { login: 'github-actions[bot]' };
    const f = fixture({
      comments: {
        10: [{ user: bot, body: '<!-- release-notification:v1.3.0 -->\nposted' }],
        11: [{ user: bot, body: ':tada: This PR is included in version 1.3.0 :tada:' }],
      },
    });
    await notifyReleasedPullRequests(f);
    expect(f.rest.issues.createComment).not.toHaveBeenCalled();
    expect(f.rest.issues.addLabels).toHaveBeenCalledTimes(2);
  });
  it('does not treat other authors or other versions as prior notifications', async () => {
    const f = fixture({
      comments: {
        10: [{ user: { login: 'someone' }, body: '<!-- release-notification:v1.3.0 -->' }],
        11: [
          { user: { login: 'github-actions[bot]' }, body: '<!-- release-notification:v1.2.0 -->' },
        ],
      },
    });
    await notifyReleasedPullRequests(f);
    expect(f.rest.issues.createComment).toHaveBeenCalledTimes(2);
  });
  it('keeps notifying other PRs when one fails, then reports the failure', async () => {
    const f = fixture();
    f.rest.issues.createComment.mockRejectedValueOnce(new Error('HTTP 403'));
    await expect(notifyReleasedPullRequests(f)).rejects.toThrow(
      'Notified 1 PRs for v1.3.0; failed #10: comment: HTTP 403'
    );
    expect(f.rest.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 10 })
    );
  });
  it.each([
    { draft: true, prerelease: false },
    { draft: false, prerelease: true },
  ])('refuses to notify for a draft or prerelease publication: %j', async (flags) => {
    const f = fixture();
    f.rest.repos.getReleaseByTag.mockResolvedValue({ data: { tag_name: 'v1.3.0', ...flags } });
    await expect(notifyReleasedPullRequests(f)).rejects.toThrow('not a stable publication');
    expect(f.rest.issues.createComment).not.toHaveBeenCalled();
  });
  it('fails instead of notifying when the release is not ahead of the previous tag', async () => {
    const f = fixture();
    f.rest.repos.compareCommitsWithBasehead.mockResolvedValue({
      data: { status: 'diverged', commits: [{ sha: 'a' }] },
    });
    await expect(notifyReleasedPullRequests(f)).rejects.toThrow('is not ahead of v1.2.0');
    expect(f.rest.issues.createComment).not.toHaveBeenCalled();
  });
  it('attempts labels independently and reports both operation failures', async () => {
    const f = fixture();
    f.rest.issues.createComment.mockRejectedValueOnce(new Error('comment HTTP 403'));
    f.rest.issues.addLabels.mockRejectedValueOnce(new Error('label HTTP 500'));
    await expect(notifyReleasedPullRequests(f)).rejects.toThrow(
      '#10: comment: comment HTTP 403; label: label HTTP 500'
    );
    expect(f.rest.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 10 })
    );
    expect(f.rest.issues.createComment).toHaveBeenCalledTimes(2);
  });
  it('retries notifications after successful publication when recovery is skipped', async () => {
    const comments = {};
    const f = fixture({ comments });
    let published;
    let tagged;
    const missing = () => Promise.reject(Object.assign(new Error('not found'), { status: 404 }));
    f.rest.git.getRef.mockImplementation(() =>
      tagged ? Promise.resolve({ data: tagged }) : missing()
    );
    f.rest.git.createRef = vi.fn(async () => {
      tagged = { object: { type: 'commit', sha } };
    });
    f.rest.repos.getReleaseByTag.mockImplementation(() =>
      published ? Promise.resolve({ data: published }) : missing()
    );
    f.rest.repos.createRelease = vi.fn(async (release) => {
      published = { ...release, html_url: url };
    });
    f.rest.repos.getLatestRelease.mockImplementation(async () => ({ data: published }));
    await publishRecoveredRelease({
      ...f,
      recovery: { version: f.version, sha, notes: 'validated notes' },
    });
    expect(f.rest.repos.createRelease).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ tag_name: 'v1.3.0', target_commitish: sha })
    );
    f.rest.issues.createComment.mockImplementation(async ({ issue_number, body }) => {
      (comments[issue_number] ??= []).push({ user: { login: 'github-actions[bot]' }, body });
    });
    f.rest.issues.addLabels.mockRejectedValueOnce(new Error('temporary label failure'));
    // The publication already exists. Workflow reruns have empty recovery outputs.
    const retry = { ...f, version: '', sha: '' };
    await expect(notifyReleasedPullRequests(retry)).rejects.toThrow('temporary label failure');
    expect(f.rest.issues.createComment).toHaveBeenCalledTimes(2);
    await expect(notifyReleasedPullRequests(retry)).resolves.toMatchObject({ notified: [10, 11] });
    expect(f.rest.repos.getLatestRelease).toHaveBeenCalledTimes(2);
    expect(f.rest.git.getRef).toHaveBeenCalledWith({ ...repo, ref: 'tags/v1.3.0' });
    expect(f.rest.repos.compareCommitsWithBasehead).toHaveBeenCalledWith(
      expect.objectContaining({ basehead: `v1.2.0...${sha}` })
    );
    expect(f.rest.issues.createComment).toHaveBeenCalledTimes(2);
    expect(f.rest.issues.addLabels).toHaveBeenCalledTimes(4);
    expect(f.rest.repos.createRelease).toHaveBeenCalledTimes(1);
    expect(f.rest.git.createRef).toHaveBeenCalledTimes(1);
  });
  it('skips catch-up before the first publication without writing anything', async () => {
    const f = fixture();
    f.rest.repos.getLatestRelease.mockRejectedValue({ status: 404 });
    await expect(notifyReleasedPullRequests({ ...f, version: '', sha: '' })).resolves.toBeNull();
    expect(f.rest.issues.createComment).not.toHaveBeenCalled();
    expect(f.rest.issues.addLabels).not.toHaveBeenCalled();
  });
  it('rejects a tag that does not match the recovered exact commit before notifying', async () => {
    const f = fixture();
    f.rest.git.getRef.mockResolvedValue({
      data: { object: { type: 'commit', sha: 'e'.repeat(40) } },
    });
    await expect(notifyReleasedPullRequests(f)).rejects.toThrow('does not match notification SHA');
    expect(f.rest.issues.createComment).not.toHaveBeenCalled();
    expect(f.rest.issues.addLabels).not.toHaveBeenCalled();
  });
  it.each([
    { type: 'tag', sha },
    { type: 'commit', sha: 'main' },
  ])('rejects unresolved or malformed tag objects before catch-up: %j', async (object) => {
    const f = fixture();
    f.rest.git.getRef.mockResolvedValue({ data: { object } });
    await expect(notifyReleasedPullRequests({ ...f, version: '', sha: '' })).rejects.toThrow(
      'exact commit'
    );
    expect(f.rest.issues.createComment).not.toHaveBeenCalled();
    expect(f.rest.issues.addLabels).not.toHaveBeenCalled();
  });
  it('paginates associated PRs beyond the first page', async () => {
    const f = fixture({ prsBySha: {} });
    f.rest.repos.listPullRequestsAssociatedWithCommit.mockImplementation(
      async ({ commit_sha, page }) => ({
        data:
          commit_sha !== 'a'
            ? []
            : page === 1
              ? Array.from({ length: 100 }, (_, i) => merged(i + 1))
              : [merged(101)],
      })
    );
    const result = await notifyReleasedPullRequests(f);
    expect(result.notified).toHaveLength(101);
    expect(f.rest.repos.listPullRequestsAssociatedWithCommit).toHaveBeenCalledWith(
      expect.objectContaining({ commit_sha: 'a', page: 2 })
    );
    expect(f.rest.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 101 })
    );
  });
  it('pages through large release ranges', async () => {
    const f = fixture({ prsBySha: {} });
    const first = Array.from({ length: 100 }, (_, index) => ({ sha: `p${index}` }));
    f.rest.repos.compareCommitsWithBasehead.mockImplementation(async ({ page }) => ({
      data: { status: 'ahead', commits: page === 1 ? first : [{ sha: 'last' }] },
    }));
    await notifyReleasedPullRequests(f);
    expect(f.rest.repos.compareCommitsWithBasehead).toHaveBeenCalledTimes(2);
    expect(f.rest.repos.compareCommitsWithBasehead).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ page: 1 })
    );
    expect(f.rest.repos.compareCommitsWithBasehead).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ page: 2 })
    );
    expect(
      f.github.paginate.mock.calls.filter(
        ([method]) => method === f.rest.repos.listPullRequestsAssociatedWithCommit
      )
    ).toHaveLength(101);
  });
});
describe('previousStableTag', () => {
  it('picks the newest lower stable release and ignores drafts, prereleases and newer tags', async () => {
    const f = fixture({
      releases: [
        { tag_name: 'v1.10.0', draft: false, prerelease: false },
        { tag_name: 'v1.9.5', draft: true, prerelease: false },
        { tag_name: 'v1.9.4', draft: false, prerelease: true },
        { tag_name: 'v1.9.3', draft: false, prerelease: false },
        { tag_name: 'v1.10.0-beta.1', draft: false, prerelease: false },
        { tag_name: 'v1.2.0', draft: false, prerelease: false },
      ],
    });
    await expect(previousStableTag(f.github, repo, 'v1.10.0')).resolves.toBe('v1.9.3');
  });
  it('returns null for the first release so nothing is notified', async () => {
    const f = fixture({ releases: [{ tag_name: 'v1.3.0', draft: false, prerelease: false }] });
    await expect(notifyReleasedPullRequests(f)).resolves.toMatchObject({ notified: [] });
    expect(f.rest.repos.compareCommitsWithBasehead).not.toHaveBeenCalled();
  });
});
