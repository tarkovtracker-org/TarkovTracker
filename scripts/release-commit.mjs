import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
/** Prepare the version commit through staging CI before semantic-release tags it. */
export function prepare(_config, context) {
  if (context.branch.name !== 'main') throw new Error('Version promotion only supports main.');
  execFileSync('/bin/bash', [fileURLToPath(new URL('./release-commit.sh', import.meta.url))], {
    cwd: context.cwd,
    env: { ...context.env, RELEASE_VERSION: context.nextRelease.version },
    stdio: 'inherit',
  });
}
