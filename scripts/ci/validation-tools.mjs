import { isAbsolute } from 'node:path';
function absoluteExecutable(path, message) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error(message);
  return path;
}
export function gitExecutable(env = process.env) {
  const standard =
    process.platform === 'win32' ? 'C:/Program Files/Git/cmd/git.exe' : '/usr/bin/git';
  return absoluteExecutable(
    env.GIT_EXECUTABLE || standard,
    'GIT_EXECUTABLE must be an absolute path'
  );
}
export function pnpmEntry(env = process.env) {
  return absoluteExecutable(env.npm_execpath, 'Run validation through pnpm run validate:changes');
}
