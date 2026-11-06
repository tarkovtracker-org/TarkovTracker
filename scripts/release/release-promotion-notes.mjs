import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { versionCommitted } from './release-note-state.mjs';
import { generateNotes } from './release-scope.mjs';
/** Restore the GitHub-only second notes pass after an authenticated process-local preparation. */
export async function captureGitHubNotes(context) {
  if (!versionCommitted(context))
    throw new Error("GitHub notes require this process's prepared version proof.");
  const config = JSON.parse(
    await readFile(new URL('../../.releaserc.json', import.meta.url), 'utf8')
  );
  const scope = config.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === './scripts/release/release-scope.mjs'
  );
  if (!scope) throw new Error('Release notes policy is missing.');
  const file = receiptPath(context.env);
  const receipt = JSON.parse(await readFile(file, 'utf8'));
  if (receipt.candidate !== context.nextRelease.gitHead)
    throw new Error('Promotion receipt changed after preparation.');
  receipt.githubNotes = await generateNotes(scope[1], context);
  await writeFile(file, JSON.stringify(receipt) + '\n');
}
function receiptPath(env) {
  const directory = env.RUNNER_TEMP || dirname(env.GITHUB_OUTPUT);
  return join(directory, 'release-promotion.json');
}
