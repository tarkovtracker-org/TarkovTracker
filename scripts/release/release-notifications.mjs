// Best-effort post-publication notices: the release is already public before this runs, so the
// workflow reports failures here as warnings and never as a failed publication.
const BOT = 'github-actions[bot]';
const LABEL = 'released';
const PAGE = 100;
const STABLE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const marker = (tag) => `<!-- release-notification:${tag} -->`;
function versionParts(tag) {
  const match = STABLE_TAG.exec(tag);
  return match ? match.slice(1).map(Number) : null;
}
function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}
/** The newest stable published release below `tag`; drafts and prereleases never bound a range. */
export async function previousStableTag(github, repo, tag) {
  const current = versionParts(tag);
  if (!current) throw new Error(`Release tag ${tag} is not a stable version.`);
  const releases = await github.paginate(github.rest.repos.listReleases, {
    ...repo,
    per_page: PAGE,
  });
  let previous = null;
  for (const release of releases) {
    const parts = versionParts(release.tag_name);
    if (release.draft || release.prerelease || !parts) continue;
    if (compareVersions(parts, current) >= 0) continue;
    if (!previous || compareVersions(parts, previous.parts) > 0)
      previous = { tag: release.tag_name, parts };
  }
  return previous?.tag ?? null;
}
async function rangeShas(github, repo, base, head) {
  const shas = [];
  for (let page = 1; ; page += 1) {
    const { data } = await github.rest.repos.compareCommitsWithBasehead({
      ...repo,
      basehead: `${base}...${head}`,
      per_page: PAGE,
      page,
    });
    if (data.status !== 'ahead') throw new Error(`${head} is not ahead of ${base}.`);
    shas.push(...data.commits.map((commit) => commit.sha));
    if (data.commits.length < PAGE) return shas;
  }
}
/** Merged main PRs for each released commit, excluding the generated version commit itself. */
async function releasedPullRequests(github, repo, shas) {
  const numbers = new Set();
  for (const sha of shas) {
    const { data } = await github.rest.repos.listPullRequestsAssociatedWithCommit({
      ...repo,
      commit_sha: sha,
      per_page: PAGE,
    });
    for (const pr of data) {
      if (pr.merged_at && pr.base?.ref === 'main') numbers.add(pr.number);
    }
  }
  return [...numbers].sort((left, right) => left - right);
}
function alreadyNotified(comments, tag) {
  const legacy = `This PR is included in version ${tag.slice(1)} :tada:`;
  return comments.some(
    (comment) =>
      comment.user?.login === BOT &&
      (comment.body?.includes(marker(tag)) || comment.body?.includes(legacy))
  );
}
async function notifyPullRequest(github, repo, number, tag, url) {
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...repo,
    issue_number: number,
    per_page: PAGE,
  });
  if (!alreadyNotified(comments, tag)) {
    await github.rest.issues.createComment({
      ...repo,
      issue_number: number,
      body: `${marker(tag)}\n:tada: This PR is included in version ${tag.slice(1)} :tada:\n\nThe release is available on [GitHub release](${url})`,
    });
  }
  await github.rest.issues.addLabels({ ...repo, issue_number: number, labels: [LABEL] });
}
/** Comment on and label every PR shipped in a published stable release; reruns stay idempotent. */
export async function notifyReleasedPullRequests({ github, context, version, sha }) {
  const repo = context.repo;
  const tag = `v${version}`;
  const { data: release } = await github.rest.repos.getReleaseByTag({ ...repo, tag });
  if (release.draft || release.prerelease) throw new Error(`${tag} is not a stable publication.`);
  const previous = await previousStableTag(github, repo, tag);
  if (!previous) return { tag, previous, notified: [], failed: [] };
  const shas = (await rangeShas(github, repo, previous, sha)).filter((item) => item !== sha);
  const numbers = await releasedPullRequests(github, repo, shas);
  const notified = [];
  const failed = [];
  for (const number of numbers) {
    try {
      await notifyPullRequest(github, repo, number, tag, release.html_url);
      notified.push(number);
    } catch (error) {
      failed.push({ number, message: error.message });
    }
  }
  if (failed.length) {
    const detail = failed.map((item) => `#${item.number}: ${item.message}`).join('; ');
    throw new Error(`Notified ${notified.length} PRs for ${tag}; failed ${detail}`);
  }
  return { tag, previous, notified, failed };
}
