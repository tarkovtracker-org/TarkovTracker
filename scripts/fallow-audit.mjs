import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
const gitEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
);
const git = (args, environment = gitEnvironment, input = undefined) =>
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Fallow audit',
      '-c',
      'user.email=fallow-audit@example.invalid',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    {
      encoding: 'utf8',
      env: environment,
      input,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  ).trim();
const materializeContext = (source, destination) => {
  const generated = join(source, '.nuxt');
  cpSync(realpathSync(generated), join(destination, '.nuxt'), { recursive: true });
  git(['-C', destination, 'add', '--force', '--', '.nuxt']);
};
const createHead = (source, destination, base, directory) => {
  const environment = { ...gitEnvironment, GIT_INDEX_FILE: join(directory, 'head.index') };
  const location = ['--git-dir', join(destination, '.git'), '--work-tree', source];
  const candidates = execFileSync(
    'git',
    ['-C', source, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      env: gitEnvironment,
      maxBuffer: 16 * 1024 * 1024,
    }
  );
  // A tracked file may now be a directory. Only its current children belong in
  // the empty snapshot index; replaying the old filename would fail Git staging.
  const paths = [];
  const prefix = Buffer.from(`${source}/`);
  let start = 0;
  for (let end = candidates.indexOf(0); end !== -1; end = candidates.indexOf(0, start)) {
    const path = candidates.subarray(start, end);
    if (!lstatSync(Buffer.concat([prefix, path]), { throwIfNoEntry: false })?.isDirectory()) {
      paths.push(candidates.subarray(start, end + 1));
    }
    start = end + 1;
  }
  git([...location, 'read-tree', '--empty'], environment);
  git(
    [...location, 'update-index', '--add', '--remove', '-z', '--stdin'],
    environment,
    Buffer.concat(paths)
  );
  git(['-C', destination, 'add', '--force', '--', '.nuxt'], environment);
  const tree = git([...location, 'write-tree'], environment);
  return git(
    [...location, 'commit-tree', tree, '-p', base, '-m', 'Materialize audit head'],
    environment
  );
};
const runFallow = (destination, base, format) => {
  const fallow = fileURLToPath(import.meta.resolve('fallow/bin/fallow'));
  const result = spawnSync(
    process.execPath,
    [
      fallow,
      'audit',
      '--root',
      destination,
      '--base',
      base,
      '--gate',
      'new-only',
      '--format',
      format,
      '--quiet',
      '--no-cache',
    ],
    { cwd: destination, env: gitEnvironment, stdio: 'inherit' }
  );
  if (result.error) throw result.error;
  if (!Number.isInteger(result.status)) {
    throw new TypeError('Fallow did not complete');
  }
  return result.status;
};
const readOptions = () => {
  const { values } = parseArgs({
    options: {
      base: { type: 'string', default: 'origin/main' },
      format: { type: 'string', default: 'human' },
    },
  });
  if (!['human', 'json'].includes(values.format)) {
    throw new Error('--format must be human or json');
  }
  return values;
};
const validateContext = (source) => {
  if (!existsSync(join(source, '.nuxt/tsconfig.json'))) {
    throw new Error('Missing generated Nuxt tsconfig; run pnpm install or pnpm exec nuxt prepare');
  }
  if (!existsSync(join(source, 'node_modules'))) {
    throw new Error('Missing node_modules; run pnpm install');
  }
};
const audit = () => {
  const values = readOptions();
  const source = git(['rev-parse', '--show-toplevel']);
  // Keep the option terminator: caller-supplied commit-ish expressions are data,
  // and only Git-verified commit IDs reach subsequent commands.
  const requestedBase = git([
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${values.base}^{commit}`,
  ]);
  const base = git(['merge-base', 'HEAD', requestedBase]);
  const sourceHead = git(['rev-parse', 'HEAD']);
  validateContext(source);
  const directory = mkdtempSync(join(tmpdir(), 'tarkovtracker-fallow-'));
  const destination = join(directory, 'repository');
  const hooks = join(directory, 'hooks');
  try {
    mkdirSync(hooks);
    git([
      '-c',
      `core.hooksPath=${hooks}`,
      'clone',
      '--shared',
      '--no-checkout',
      '--quiet',
      '--',
      source,
      destination,
    ]);
    git(['-C', destination, 'config', 'core.hooksPath', hooks]);
    git(['-C', destination, 'checkout', '--quiet', '--detach', base]);
    materializeContext(source, destination);
    git([
      '-C',
      destination,
      'commit',
      '--quiet',
      '--allow-empty',
      '-m',
      'Materialize audit base context',
    ]);
    const analysisBase = git(['-C', destination, 'rev-parse', 'HEAD']);
    const analysisHead = createHead(source, destination, analysisBase, directory);
    git(['-C', destination, 'checkout', '--quiet', '--detach', analysisHead]);
    const modules = join(source, 'node_modules');
    if (!existsSync(join(destination, 'node_modules'))) {
      symlinkSync(realpathSync(modules), join(destination, 'node_modules'), 'junction');
    }
    console.error(
      `Fallow source base: ${base}; source HEAD: ${sourceHead} (including local changes)`
    );
    return runFallow(destination, analysisBase, values.format);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
try {
  process.exitCode = audit();
} catch (error) {
  console.error(`[fallow audit] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
