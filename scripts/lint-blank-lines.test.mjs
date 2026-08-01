import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const script = join(root, 'scripts/lint-blank-lines.mjs');
const directory = mkdtempSync(join(root, '.github/workflows/.lint-blank-lines-'));
process.on('exit', () => rmSync(directory, { force: true, recursive: true }));
const runFix = (name, source, extension) => {
  const file = join(directory, `${name}.${extension}`);
  writeFileSync(file, source);
  execFileSync(process.execPath, [script, '--fix', file], { cwd: root, stdio: 'pipe' });
  return readFileSync(file, 'utf8');
};
const yaml = runFix('scalar', 'run: |\n  first\n\n  second\nnext: value\n\n', 'yml');
if (yaml !== 'run: |\n  first\n\n  second\nnext: value\n') {
  throw new Error(`YAML scalar protection failed:\n${yaml}`);
}
const heredoc = runFix(
  'heredoc',
  'cat <<EOF\nkeep\n\n EOF\n\nstill protected\nEOF\n\nnext\n',
  'sh'
);
if (heredoc !== 'cat <<EOF\nkeep\n\n EOF\n\nstill protected\nEOF\nnext\n') {
  throw new Error(`Heredoc protection failed:\n${heredoc}`);
}
const substitution = runFix(
  'substitution',
  'value=$(\n  printf first\n\n  printf second\n)\n\nnext\n',
  'sh'
);
if (substitution !== 'value=$(\n  printf first\n\n  printf second\n)\nnext\n') {
  throw new Error(`Command substitution protection failed:\n${substitution}`);
}
const template = runFix(
  'template',
  'const value = 1;\n\nconst text = `first\n\nsecond`;\n\n',
  'mjs'
);
if (template !== 'const value = 1;\nconst text = `first\n\nsecond`;\n') {
  throw new Error(`Template protection failed:\n${template}`);
}
const comment = runFix('comment', "# don't stop\n\nkey: value\n\n", 'yml');
if (comment !== "# don't stop\nkey: value\n") {
  throw new Error(`Comment scanning failed:\n${comment}`);
}
const empty = runFix('empty', '', 'mjs');
if (empty !== '') throw new Error('Empty file handling failed');
execFileSync(process.execPath, [script, '--fix', join(directory, 'deleted.mjs')], {
  cwd: root,
  stdio: 'pipe',
});
