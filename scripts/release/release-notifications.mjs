// Best-effort post-publication notices: the release is already public before this runs, so the
// workflow reports failures here as warnings and never as a failed publication.
const BOT = 'github-actions[bot]';
const LABEL = 'released';
const PAGE = 100;
const STABLE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const FULL_SHA = /^[0-9a-f]{40}$/;
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
const isPublished = (release) => release.draft === false && release.prerelease === false;
function lowerStableReleases(releases, current) {
  return releases
    .filter(isPublished)
    .map((release) => ({ tag: release.tag_name, parts: versionParts(release.tag_name) }))
    .filter((release) => release.parts && compareVersions(release.parts, current) < 0);
}
/** The newest stable published release below `tag`; drafts and prereleases never bound a range. */
export async function previousStableTag(github, repo, tag) {
  const current = versionParts(tag);
  if (!current) throw new Error(`Release tag ${tag} is not a stable version.`);
  const releases = await github.paginate(github.rest.repos.listReleases, {
    ...repo,
    per_page: PAGE,
  });
  const [previous] = lowerStableReleases(releases, current).sort((left, right) =>
    compareVersions(right.parts, left.parts)
  );
  return previous ? previous.tag : null;
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
const mergedToMain = (pr) => Boolean(pr.merged_at) && pr.base?.ref === 'main';
async function commitPullRequests(github, repo, sha) {
  const data = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, {
    ...repo,
    commit_sha: sha,
    per_page: PAGE,
  });
  return data.filter(mergedToMain).map((pr) => pr.number);
}
/** Merged main PRs for each released commit, excluding the generated version commit itself. */
async function releasedPullRequests(github, repo, shas) {
  const numbers = new Set();
  for (const sha of shas) {
    for (const number of await commitPullRequests(github, repo, sha)) numbers.add(number);
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
async function commentPullRequest(github, repo, number, tag, url) {
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...repo,
    issue_number: number,
    per_page: PAGE,
  });
  if (alreadyNotified(comments, tag)) return;
  await github.rest.issues.createComment({
    ...repo,
    issue_number: number,
    body: `${marker(tag)}\n:tada: This PR is included in version ${tag.slice(1)} :tada:\n\nThe release is available on [GitHub release](${url})`,
  });
}
async function notifyPullRequest(github, repo, number, tag, url) {
  const results = await Promise.allSettled([
    commentPullRequest(github, repo, number, tag, url),
    github.rest.issues.addLabels({ ...repo, issue_number: number, labels: [LABEL] }),
  ]);
  const operations = ['comment', 'label'];
  const errors = results.flatMap((result, index) =>
    result.status === 'rejected' ? [`${operations[index]}: ${result.reason.message}`] : []
  );
  if (errors.length) throw new Error(errors.join('; '));
}
/** Catch up only an existing stable publication; no tag/release write API is used here. */
async function latestPublication(github, repo) {
  try {
    return (await github.rest.repos.getLatestRelease(repo)).data;
  } catch (error) {
    if (error.status !== 404) throw error;
    return null;
  }
}
function stablePublication(release) {
  if (!isPublished(release) || !STABLE_TAG.test(release.tag_name))
    throw new Error(`${release.tag_name} is not a stable publication.`);
  return release;
}
async function publication(github, repo, version, sha) {
  if (!version && !sha) {
    const release = await latestPublication(github, repo);
    return release ? bindPublication(github, repo, stablePublication(release)) : null;
  }
  return recoveredPublication(github, repo, version, sha);
}
async function recoveredPublication(github, repo, version, sha) {
  if (!STABLE_TAG.test(`v${version}`) || !FULL_SHA.test(String(sha)))
    throw new Error('Notification publication requires a stable version and exact SHA.');
  const { data: release } = await github.rest.repos.getReleaseByTag({
    ...repo,
    tag: `v${version}`,
  });
  if (release.tag_name !== `v${version}`) throw new Error('Release tag identity changed.');
  return bindPublication(github, repo, stablePublication(release), sha);
}
const isCommitTag = (object) => object?.type === 'commit' && FULL_SHA.test(String(object.sha));
function exactTagSha(data) {
  if (!isCommitTag(data.object)) throw new Error('Release tag must identify an exact commit.');
  return data.object.sha;
}
async function bindPublication(github, repo, release, expectedSha) {
  const tag = release.tag_name;
  const { data } = await github.rest.git.getRef({ ...repo, ref: `tags/${tag}` });
  const sha = exactTagSha(data);
  if (expectedSha && sha !== expectedSha)
    throw new Error('Release tag does not match notification SHA.');
  return { tag, sha, release };
}
async function notifyEach(github, repo, numbers, tag, url) {
  const notified = [];
  const failed = [];
  for (const number of numbers) {
    try {
      await notifyPullRequest(github, repo, number, tag, url);
      notified.push(number);
    } catch (error) {
      failed.push({ number, message: error.message });
    }
  }
  if (!failed.length) return { notified, failed };
  const detail = failed.map((item) => `#${item.number}: ${item.message}`).join('; ');
  throw new Error(`Notified ${notified.length} PRs for ${tag}; failed ${detail}`);
}
/** Notify a just-published version, or catch up the latest stable publication on ordinary reruns. */
export async function notifyReleasedPullRequests({ github, context, version, sha }) {
  const repo = context.repo;
  const published = await publication(github, repo, version, sha);
  if (!published) return null;
  const { tag, sha: releasedSha, release } = published;
  const previous = await previousStableTag(github, repo, tag);
  if (!previous) return { tag, previous, notified: [], failed: [] };
  const shas = (await rangeShas(github, repo, previous, releasedSha)).filter(
    (item) => item !== releasedSha
  );
  const numbers = await releasedPullRequests(github, repo, shas);
  return { tag, previous, ...(await notifyEach(github, repo, numbers, tag, release.html_url)) };
}
