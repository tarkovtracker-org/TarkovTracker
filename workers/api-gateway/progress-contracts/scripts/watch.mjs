import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
// pnpm's parallel runner forwards consumer flags to both scripts. This compiler owns its
// fixed arguments, so app ports and focused-test paths never become TypeScript options.
try {
  execFileSync(
    process.execPath,
    [
      require.resolve('typescript/bin/tsc'),
      '-p',
      fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
      '--watch',
      '--preserveWatchOutput',
    ],
    { stdio: 'inherit', windowsHide: true }
  );
} catch (error) {
  process.exit(typeof error.status === 'number' ? error.status : 1);
}
