#!/usr/bin/env node
// Runs in the credential-bearing deployment job after `wrangler pages deploy`. Confirms the live
// Cloudflare deployment record matches the verified plan, then records evidence for the smoke job
// and the retained artifact. Any discrepancy fails the job before the URL is published.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import {
  deploymentRecordErrors,
  fetchDeploymentRecord,
  parseWranglerOutput,
} from './deployment.mjs';
const env = process.env;
const output = parseWranglerOutput(readFileSync(env.WRANGLER_OUTPUT_FILE_PATH, 'utf8'));
const expected = {
  deploymentId: output.deployment_id,
  previewBranch: env.EXPECTED_PREVIEW_BRANCH,
  headSha: env.EXPECTED_HEAD_SHA,
};
const record = await fetchDeploymentRecord({
  accountId: env.CLOUDFLARE_ACCOUNT_ID,
  token: env.CLOUDFLARE_API_TOKEN,
  deploymentId: output.deployment_id,
  fetchImpl: fetch,
});
const errors = deploymentRecordErrors(record, expected);
if (errors.length) {
  console.error(`Deployment verification failed:\n${errors.join('\n')}`);
  process.exit(1);
}
const evidence = {
  project: record.project_name,
  environment: record.environment,
  deploymentId: record.id,
  url: record.url,
  alias: output.alias ?? null,
  branch: record.deployment_trigger?.metadata?.branch,
  commitHash: record.deployment_trigger?.metadata?.commit_hash,
  createdOn: record.created_on ?? null,
  expectedDigest: env.EXPECTED_DIGEST,
  controllerRunId: env.GITHUB_RUN_ID,
};
writeFileSync(env.EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
// Evidence is consumed from the retained artifact file, not from logs: record fields are
// external strings (Cloudflare API, Wrangler output) and must not be echoed unsanitized.
if (env.GITHUB_OUTPUT) {
  appendFileSync(env.GITHUB_OUTPUT, `url=${record.url}\ndeployment_id=${record.id}\n`);
}
