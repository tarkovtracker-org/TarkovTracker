#!/usr/bin/env node
// Runs in the candidate `Validate` job after the preview build. Records the versioned manifest
// inside the build output so the artifact carries its own claims; the trusted controller verifies
// each of them against GitHub and recomputes the digest before deploying.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gitExecutable } from '../validation-tools.mjs';
import { buildManifest, digestDirectory, manifestShapeErrors } from './manifest.mjs';
import { MANIFEST_FILE } from './profile.mjs';
const env = process.env;
const outputDir = resolve(env.BUILD_OUTPUT_DIR || 'dist');
const treeSha = execFileSync(gitExecutable(), ['rev-parse', 'HEAD^{tree}'], {
  encoding: 'utf8',
}).trim();
const manifest = buildManifest({
  repository: env.GITHUB_REPOSITORY,
  pullRequest: env.PR_NUMBER,
  headSha: env.HEAD_SHA,
  baseSha: env.BASE_SHA,
  checkedOutSha: env.GITHUB_SHA,
  treeSha,
  runId: env.GITHUB_RUN_ID,
  runAttempt: env.GITHUB_RUN_ATTEMPT,
  previewBranch: env.PREVIEW_BRANCH,
  appUrl: env.APP_URL,
  digest: digestDirectory(outputDir),
});
const errors = manifestShapeErrors(manifest);
if (errors.length) {
  console.error(`Refusing to write an invalid preview manifest:\n${errors.join('\n')}`);
  process.exit(1);
}
writeFileSync(join(outputDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
