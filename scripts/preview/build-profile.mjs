#!/usr/bin/env node
// Runs in the candidate `Validate` job before `pnpm run build`. Chooses the production or anonymous
// preview build settings and exports them through GITHUB_ENV so one unconditional build step uses
// them. Everything written here is a claim that the trusted preview controller re-derives.
import { appendFileSync } from 'node:fs';
import { previewBuildEnv, resolveBuildProfile } from './profile.mjs';
const PRODUCTION_PASSTHROUGH = [
  'CLARITY_PROJECT_ID',
  'GA_MEASUREMENT_ID',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'CODECOV_TOKEN',
];
function productionEnv(env) {
  return {
    NODE_ENV: 'production',
    APP_URL: 'https://tarkovtracker.org',
    ...Object.fromEntries(PRODUCTION_PASSTHROUGH.map((key) => [key, env[key] ?? ''])),
  };
}
function envFile(entries) {
  return Object.entries(entries)
    .map(([key, value]) => {
      if (/[\r\n]/.test(String(value))) throw new Error(`Multiline value for ${key}`);
      return `${key}=${value}\n`;
    })
    .join('');
}
export function resolveProfileOutputs(env) {
  const decision = resolveBuildProfile({
    eventName: env.EVENT_NAME,
    refName: env.REF_NAME,
    pullRequest: env.PR_NUMBER,
  });
  const buildEnv =
    decision.profile === 'preview' ? previewBuildEnv(decision.previewBranch) : productionEnv(env);
  return { decision, buildEnv };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const { decision, buildEnv } = resolveProfileOutputs(process.env);
  console.log(JSON.stringify({ ...decision, buildKeys: Object.keys(buildEnv) }, null, 2));
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, envFile(buildEnv));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      envFile({
        profile: decision.profile,
        preview_branch: decision.previewBranch ?? '',
        app_url: decision.appUrl ?? '',
      })
    );
  }
}
