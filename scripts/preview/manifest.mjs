import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  MANIFEST_FILE,
  MANIFEST_VERSION,
  PREVIEW_PROFILE_VERSION,
  isValidPreviewBranch,
  previewAppUrl,
} from './profile.mjs';
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
/** Reject unsupported output entries and report whether the entry is a directory. */
function entryIsDirectory(full, stat) {
  if (stat.isSymbolicLink()) throw new Error(`Symbolic link in build output: ${full}`);
  if (stat.isDirectory()) return true;
  if (!stat.isFile()) throw new Error(`Unsupported entry in build output: ${full}`);
  return false;
}
function collectEntries(root, dir, entries) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (entryIsDirectory(full, lstatSync(full))) collectEntries(root, full, entries);
    else entries.push(relative(root, full).split(sep).join('/'));
  }
}
/** Content digest of a build directory; the manifest itself is excluded so it can embed the value. */
export function digestDirectory(root) {
  const entries = [];
  collectEntries(root, root, entries);
  const hash = createHash('sha256');
  for (const entry of entries.filter((path) => path !== MANIFEST_FILE)) {
    hash.update(`${entry}\0${hashFile(join(root, entry))}\n`);
  }
  return hash.digest('hex');
}
function isAbsent(value) {
  return value === undefined || value === null || value === '';
}
function optionalInteger(value) {
  if (isAbsent(value)) return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : Number.NaN;
}
/** Assemble the versioned manifest recorded next to the build output. Values are claims. */
export function buildManifest(input) {
  return {
    version: MANIFEST_VERSION,
    profile: 'preview',
    buildProfileVersion: PREVIEW_PROFILE_VERSION,
    repository: input.repository,
    pullRequest: optionalInteger(input.pullRequest),
    headSha: input.headSha,
    baseSha: input.baseSha || null,
    checkedOutSha: input.checkedOutSha,
    treeSha: input.treeSha,
    runId: Number(input.runId),
    runAttempt: Number(input.runAttempt),
    previewBranch: input.previewBranch,
    appUrl: input.appUrl,
    digest: input.digest,
    createdAt: input.createdAt || new Date().toISOString(),
  };
}
/** Normalise any parsed manifest into a plain object so field checks need no defensive chains. */
function asRecord(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value;
}
function isNumberIdentity(manifest) {
  const fields = [manifest.runId, manifest.runAttempt];
  return fields.every((value) => Number.isInteger(value));
}
const SHAPE_CHECKS = [
  [(manifest) => manifest.version === MANIFEST_VERSION, 'unsupported manifest version'],
  [(manifest) => manifest.profile === 'preview', 'manifest is not a preview build'],
  [
    (manifest) => manifest.buildProfileVersion === PREVIEW_PROFILE_VERSION,
    'build profile version mismatch',
  ],
  [isNumberIdentity, 'run identity is not numeric'],
];
function shapeErrors(raw) {
  const manifest = asRecord(raw);
  return SHAPE_CHECKS.filter(([valid]) => !valid(manifest)).map(([, message]) => message);
}
const REVISION_FIELDS = [
  ['headSha', SHA_PATTERN, 'is not a commit SHA'],
  ['checkedOutSha', SHA_PATTERN, 'is not a commit SHA'],
  ['treeSha', SHA_PATTERN, 'is not a commit SHA'],
  ['digest', DIGEST_PATTERN, 'is malformed'],
];
function revisionFieldError(manifest, field, pattern, message) {
  return pattern.test(String(manifest[field])) ? null : `${field} ${message}`;
}
function baseShaError(manifest) {
  if (manifest.baseSha === null) return null;
  return revisionFieldError(manifest, 'baseSha', SHA_PATTERN, 'is not a commit SHA');
}
function revisionErrors(raw) {
  const manifest = asRecord(raw);
  const errors = REVISION_FIELDS.map(([field, pattern, message]) =>
    revisionFieldError(manifest, field, pattern, message)
  ).filter(Boolean);
  const base = baseShaError(manifest);
  return base ? [...errors.slice(0, 3), base, ...errors.slice(3)] : errors;
}
function branchAliasErrors(manifest) {
  if (!isValidPreviewBranch(manifest.previewBranch)) return ['invalid preview branch'];
  const expected = previewAppUrl(manifest.previewBranch);
  return manifest.appUrl === expected ? [] : ['appUrl does not match the preview branch alias'];
}
function pullRequestErrors(manifest) {
  const absent = manifest.pullRequest === null;
  return absent || Number.isInteger(manifest.pullRequest) ? [] : ['pullRequest is not an integer'];
}
function targetErrors(raw) {
  const manifest = asRecord(raw);
  return [...branchAliasErrors(manifest), ...pullRequestErrors(manifest)];
}
/** Structural validation only; the controller separately verifies every claim against GitHub. */
export function manifestShapeErrors(manifest) {
  return [...shapeErrors(manifest), ...revisionErrors(manifest), ...targetErrors(manifest)];
}
