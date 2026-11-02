import { createHash } from 'node:crypto';
import {
  SHA,
  comparisonDigest,
  evidenceDates,
  fetchResponse,
  githubJson,
  requireEvidence,
} from './dependency-evidence.mjs';
const longText = (value) => typeof value === 'string' && value.trim().length >= 80;
const sourceFile = (file) =>
  [typeof file.source === 'string', SHA.test(file.sourceBlob)].every(Boolean);
const validTag = (value) =>
  [typeof value === 'string', /^[\w./-]+$/.test(value), !String(value).includes('..')].every(
    Boolean
  );
function validComparison(comparison, digest) {
  if (!Array.isArray(comparison)) return false;
  return [
    comparison.length > 0,
    comparison.every(sourceFile),
    comparisonDigest(comparison) === digest,
  ].every(Boolean);
}
export function reviewFailures(review, manifest, now) {
  const data = review ?? {};
  const source = data.source ?? {};
  const checks = [
    [evidenceDates(data, now), 'missing, expired, or invalid review dates'],
    [
      [
        data.integrity === manifest.dist?.integrity,
        /^sha512-[A-Za-z0-9+/]+=*$/.test(data.integrity),
      ].every(Boolean),
      'reviewed tarball integrity does not match npm',
    ],
    [/^[\w.-]+\/[\w.-]+$/.test(source.repository), 'missing upstream repository'],
    [SHA.test(source.commit), 'missing immutable upstream commit'],
    [validTag(source.tag), 'missing upstream release tag'],
    [longText(data.evidence), 'missing substantive artifact review'],
    [/^[a-f0-9]{64}$/.test(source.comparisonSha256), 'missing source comparison receipt'],
    [
      validComparison(data.comparison, source.comparisonSha256),
      'source comparison receipt changed',
    ],
    [manifest.gitHead === source.commit, 'npm gitHead differs from reviewed upstream commit'],
    [
      !['preinstall', 'install', 'postinstall'].some((key) => manifest.scripts?.[key]),
      'source-reviewed exceptions cannot run install hooks',
    ],
  ];
  return checks.filter(([ok]) => !ok).map(([, message]) => message);
}
async function verifySourceTree(review) {
  const { repository, commit } = review.source;
  const tree = await githubJson(`repos/${repository}/git/trees/${commit}?recursive=1`);
  requireEvidence(
    Array.isArray(tree.tree) && tree.truncated === false,
    'Incomplete upstream source tree'
  );
  const blobs = new Map(
    tree.tree.filter((item) => item.type === 'blob').map((item) => [item.path, item.sha])
  );
  for (const file of review.comparison) {
    requireEvidence(
      [sourceFile(file), blobs.has(file.source), blobs.get(file.source) === file.sourceBlob].every(
        Boolean
      ),
      `Reviewed upstream source changed: ${file.source}`
    );
    requireEvidence(
      /^[a-f0-9]{64}$/.test(file.publishedSha256),
      'Missing published runtime digest'
    );
    requireEvidence(
      ['identical', 'typescript-6.0.3-ast-parity'].includes(file.method),
      'Unknown source comparison method'
    );
  }
}
async function releaseCommit(repository, tag) {
  const ref = await githubJson(`repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`);
  const target = ref.object ?? {};
  if (target.type === 'commit') return target.sha;
  requireEvidence(target.type === 'tag', 'Unsupported upstream release reference');
  const object = await githubJson(`repos/${repository}/git/tags/${target.sha}`);
  return annotatedCommit(object);
}
function annotatedCommit(object) {
  requireEvidence(object.object?.type === 'commit', 'Upstream tag does not identify a commit');
  return object.object.sha;
}
async function verifyTarball(manifest, integrity) {
  const url = new URL(manifest.dist.tarball);
  requireEvidence(
    url.protocol === 'https:' && url.hostname === 'registry.npmjs.org',
    'Untrusted tarball host'
  );
  const response = await fetchResponse(url, { redirect: 'error' });
  requireEvidence(response.ok, `Tarball returned ${response.status}`);
  const hash = createHash('sha512');
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    requireEvidence(size <= 32 * 1024 ** 2, 'Tarball exceeds review size limit');
    hash.update(chunk);
  }
  requireEvidence(
    `sha512-${hash.digest('base64')}` === integrity,
    'Downloaded tarball differs from reviewed artifact'
  );
}
/** Reviews are code-reviewed attestations, not a substitute for Socket or the live advisory check. */
export async function verifyArtifact(review, manifest, now = Date.now()) {
  const failures = reviewFailures(review, manifest, now);
  requireEvidence(failures.length === 0, failures.join('; '));
  const { repository, tag, commit } = review.source;
  const resolved = await releaseCommit(repository, tag);
  requireEvidence(resolved === commit, 'Upstream release tag moved from reviewed commit');
  await Promise.all([verifyTarball(manifest, review.integrity), verifySourceTree(review)]);
  return { verified: true, repository: `https://github.com/${repository}`, parent: review.parent };
}
