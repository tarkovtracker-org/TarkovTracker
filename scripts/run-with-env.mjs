import { spawn } from 'node:child_process';

const [, , envAssignment, ...commandArgs] = process.argv;

if (!envAssignment || commandArgs.length === 0 || !envAssignment.includes('=')) {
  console.error('Usage: node scripts/run-with-env.mjs KEY=value <command> [args...]');
  process.exit(1);
}

const separatorIndex = envAssignment.indexOf('=');
const envKey = envAssignment.slice(0, separatorIndex);
const envValue = envAssignment.slice(separatorIndex + 1);

if (!envKey) {
  console.error('Environment variable name cannot be empty.');
  process.exit(1);
}

const [command, ...args] = commandArgs;
const child =
  process.platform === 'win32'
    ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command, ...args], {
        env: {
          ...process.env,
          [envKey]: envValue,
        },
        stdio: 'inherit',
      })
    : spawn(command, args, {
        env: {
          ...process.env,
          [envKey]: envValue,
        },
        stdio: 'inherit',
      });

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
