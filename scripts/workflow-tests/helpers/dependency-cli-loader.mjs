// Test-only subprocess transport: run fixtures through Node on every OS, without a shell.
// Preloading keeps the real CLI entry point and security checks intact; production never imports it.
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
const execFileSync = childProcess.execFileSync;
childProcess.execFileSync = (command, args, options) => {
  assert.ok(['pnpm', 'git', 'gh'].includes(command), `Unexpected fixture command: ${command}`);
  assert.ok(!options?.shell, 'CLI fixtures must not use a shell');
  return execFileSync(
    process.execPath,
    [join(process.cwd(), 'bin', `${command}.cjs`), ...args],
    options
  );
};
syncBuiltinESMExports();
