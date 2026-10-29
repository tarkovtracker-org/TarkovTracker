#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  classifyPaths,
  classifyQueuePaths,
  collectChanges,
  reusedQueuePlan,
} from './validation-plan.mjs';
import { pnpmEntry } from './validation-tools.mjs';
const args = process.argv.slice(2);
const options = { mode: 'local', explain: false, full: false, shadow: false };
let malformed = false;
while (args.length) {
  const arg = args.shift();
  if (['--base', '--head', '--mode'].includes(arg)) {
    const value = args.shift();
    if (!value || value.startsWith('--')) {
      malformed = true;
      break;
    }
    options[arg.slice(2)] = value;
  } else if (['--explain', '--full', '--shadow', '--queue', '--reused'].includes(arg)) {
    options[arg.slice(2)] = true;
  } else {
    malformed = true;
  }
}
if (!['local', 'ci', 'full'].includes(options.mode)) malformed = true;
if (options.queue && options.mode !== 'ci') malformed = true;
if (options.reused && !options.queue) malformed = true;
const changes = collectChanges({ ...options, local: options.mode !== 'ci' });
const classify = options.queue ? classifyQueuePaths : classifyPaths;
const proposed = classify(changes.paths, {
  formatterOnly: changes.formatterOnly,
  forceFull: Boolean(changes.error) || malformed || options.full || options.mode === 'full',
  reason:
    changes.error || (malformed ? 'Malformed arguments; selecting full validation' : undefined),
});
// `--reused` is set only from the trusted queue reuse step; an unreadable diff still runs in full.
const reusable = [options.reused, !malformed, !changes.error, !options.full].every(Boolean);
const selected = reusable ? reusedQueuePlan(changes.paths) : proposed;
const plan = options.shadow
  ? classifyPaths(changes.paths, { forceFull: true, reason: 'Shadow rollout: all checks enabled' })
  : selected;
console.log(
  JSON.stringify({ ...plan, proposed, base: changes.baseSha, head: changes.headSha }, null, 2)
);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `plan=${JSON.stringify(plan)}\nfull=${plan.full}\ni18n=${plan.i18n}\nworkflows=${plan.workflows}\ntooling=${plan.full || plan.formatter}\npreview=${plan.previewRequired}\n`
  );
}
if (options.explain) process.exit(0);
const packageManagerEntry = pnpmEntry();
const commands = plan.full
  ? [
      ['run', 'lint'],
      ['run', 'format:check:prettier'],
      ['run', 'typecheck'],
      ['run', 'test:workflow'],
      ['run', options.mode === 'local' ? 'test' : 'test:coverage'],
      ['run', 'i18n:check'],
      ['run', 'systems:check'],
    ]
  : [
      ...(plan.formatter
        ? [
            ['run', 'lint'],
            ['run', 'test:workflow'],
            ['run', 'test:blank-lines'],
          ]
        : []),
      ['run', 'format:check'],
      ['run', 'systems:check'],
      ...(plan.i18n ? [['run', 'i18n:check']] : []),
    ];
if (plan.full && options.mode !== 'local') {
  // CI jobs retain sharding, uploads, fork guards, and environment-specific build settings.
  commands.push(
    ['run', 'lint:fallow', '--base', changes.baseSha || 'origin/main'],
    ['run', 'build'],
    ['run', 'supabase:check'],
    ['run', 'check:progress-contracts'],
    ['run', 'verify:api-parity'],
    ['run', 'test:deno']
  );
}
for (const command of commands) {
  console.log(`> pnpm ${command.join(' ')}`);
  const result = spawnSync(process.execPath, [packageManagerEntry, ...command], {
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
if (options.mode === 'local')
  console.log(
    'Local profile complete. Apply additional path-specific AGENTS.md requirements; CI remains authoritative for full validation.'
  );
