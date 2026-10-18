// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { notifyReleasedPullRequests, previousStableTag } from './release-notifications.mjs';
const sha = 'f'.repeat(40);
const repo = { owner: 'owner', repo: 'repo' };
const url = 'https://github.com/owner/repo/releases/tag/v1.3.0';
const merged = (number, base = 'main') => ({
  number,
  merged_at: '2026-10-18T00:00:00Z',
  base: { ref: base },
});
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
        data: { draft: false, prerelease: false, html_url: url },
      }),
      listReleases: vi.fn(),
      compareCommitsWithBasehead: vi.fn(async ({ basehead }) => ({
        data: { status: 'ahead', commits: byPage[basehead.split('...')[0]] },
      })),
      listPullRequestsAssociatedWithCommit: vi.fn(async ({ commit_sha }) => ({
        data: prs[commit_sha] ?? [],
      })),
    },
    issues: {
      listComments: vi.fn(),
      createComment: vi.fn().mockResolvedValue({}),
      addLabels: vi.fn().mockResolvedValue({}),
    },
  };
  const github = {
    rest,
    paginate: vi.fn(async (method, params) => {
      if (method === rest.repos.listReleases)
        return (
          releases ?? [
            { tag_name: 'v1.3.0', draft: false, prerelease: false },
            { tag_name: 'v1.2.0', draft: false, prerelease: false },
            { tag_name: 'v1.1.0', draft: false, prerelease: false },
          ]
        );
      return comments[params.issue_number] ?? [];
    }),
  };
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
      'Notified 1 PRs for v1.3.0; failed #10: HTTP 403'
    );
    expect(f.rest.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 11 })
    );
  });
  it('refuses to notify for a draft or prerelease publication', async () => {
    const f = fixture();
    f.rest.repos.getReleaseByTag.mockResolvedValue({ data: { draft: true, prerelease: false } });
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
  it('pages through large release ranges', async () => {
    const f = fixture({ prsBySha: {} });
    const first = Array.from({ length: 100 }, (_, index) => ({ sha: `p${index}` }));
    f.rest.repos.compareCommitsWithBasehead
      .mockResolvedValueOnce({ data: { status: 'ahead', commits: first } })
      .mockResolvedValueOnce({ data: { status: 'ahead', commits: [{ sha: 'last' }] } });
    await notifyReleasedPullRequests(f);
    expect(f.rest.repos.compareCommitsWithBasehead).toHaveBeenCalledTimes(2);
    expect(f.rest.repos.listPullRequestsAssociatedWithCommit).toHaveBeenCalledTimes(101);
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
