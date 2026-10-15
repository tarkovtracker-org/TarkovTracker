import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { recordPreparedVersion } from './release-note-state.mjs';
const preparedContexts = new WeakMap();
/** Internal control flow: successful staging is not publication authorization. */
export class ReleasePrepared extends Error {
  constructor(context) {
    super('Version PR prepared; publication waits for its reviewed merge.');
    this.code = 'RELEASE_PR_PREPARED';
    preparedContexts.set(this, context);
  }
}
/** Stage generated assets and stop semantic-release before it may tag or publish. */
export function prepare(_config, context) {
  if (context.branch.name !== 'main') throw new Error('Version promotion only supports main.');
  execFileSync('/bin/bash', [fileURLToPath(new URL('./release-commit.sh', import.meta.url))], {
    cwd: context.cwd,
    env: { ...context.env, RELEASE_VERSION: context.nextRelease.version },
    stdio: 'inherit',
  });
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: context.cwd,
    encoding: 'utf8',
  }).trim();
  recordPreparedVersion(context, sha);
  context.nextRelease.gitHead = sha;
  throw new ReleasePrepared(context);
}
/** Credentials/context are never enumerable Error properties or part of logged exceptions. */
export function preparedContext(error) {
  return preparedContexts.get(error);
}
