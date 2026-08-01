import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
const rootUrl = new URL('..', import.meta.url);
const root = rootUrl.protocol === 'file:' ? fileURLToPath(rootUrl) : process.cwd();
const script = join(root, 'scripts/lint-blank-lines.mjs');
const directory = mkdtempSync(join(tmpdir(), 'lint-blank-lines-'));
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
const multipleHeredocs = runFix(
  'multiple-heredocs',
  "cat <<A <<'B'\nfirst\n\nA\nsecond\n\nB\n\nnext\n",
  'sh'
);
if (multipleHeredocs !== "cat <<A <<'B'\nfirst\n\nA\nsecond\n\nB\nnext\n") {
  throw new Error(`Multiple heredoc protection failed:\n${multipleHeredocs}`);
}
const hyphenatedHeredoc = runFix(
  'hyphenated-heredoc',
  "cat <<'END-JSON'\nbody\nEND-JSON\n\nnext\n",
  'sh'
);
if (hyphenatedHeredoc !== "cat <<'END-JSON'\nbody\nEND-JSON\nnext\n") {
  throw new Error(`Hyphenated heredoc protection failed:\n${hyphenatedHeredoc}`);
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
const blockCommentMarker = runFix(
  'block-comment-marker',
  "const marker = '/*';\n\n/* actual\n\n */\nconst end = true;\n\n",
  'mjs'
);
if (blockCommentMarker !== "const marker = '/*';\n/* actual\n\n */\nconst end = true;\n") {
  throw new Error(`Block comment scanning failed:\n${blockCommentMarker}`);
}
const sequenceScalar = runFix(
  'sequence-scalar',
  'steps:\n  - |\n    first\n\n    second\nnext: value\n\n',
  'yml'
);
if (sequenceScalar !== 'steps:\n  - |\n    first\n\n    second\nnext: value\n') {
  throw new Error(`YAML sequence scalar protection failed:\n${sequenceScalar}`);
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
if (process.env.VITEST) it('passes formatter regression fixtures', () => {});
