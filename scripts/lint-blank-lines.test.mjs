import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, it } from 'vitest';
const rootUrl = new URL('..', import.meta.url);
const root = rootUrl.protocol === 'file:' ? fileURLToPath(rootUrl) : process.cwd();
const script = join(root, 'scripts/lint-blank-lines.mjs');
const directory = mkdtempSync(join(tmpdir(), 'lint-blank-lines-'));
const cleanup = () => rmSync(directory, { force: true, recursive: true });
if (process.env.VITEST) afterAll(cleanup);
else process.on('exit', cleanup);
const runFix = (name, source, extension) => {
  const file = join(directory, `${name}.${extension}`);
  writeFileSync(file, source);
  execFileSync(process.execPath, [script, '--fix', file], { cwd: root, stdio: 'pipe' });
  return readFileSync(file, 'utf8');
};
const runFixtures = () => {
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
  const spacedHeredoc = runFix(
    'spaced-heredoc',
    "cat <<'END JSON'\nbody\n\nEND JSON\n\nnext\n",
    'sh'
  );
  if (spacedHeredoc !== "cat <<'END JSON'\nbody\n\nEND JSON\nnext\n") {
    throw new Error(`Spaced heredoc protection failed:\n${spacedHeredoc}`);
  }
  const escapedHeredoc = runFix('escaped-heredoc', 'cat <<\\EOF\nbody\n\nEOF\n\nnext\n', 'sh');
  if (escapedHeredoc !== 'cat <<\\EOF\nbody\n\nEOF\nnext\n') {
    throw new Error(`Escaped heredoc protection failed:\n${escapedHeredoc}`);
  }
  const escapedDelimiter = runFix(
    'escaped-delimiter',
    'cat <<E\\ OF\nbody\n\nE OF\n\nnext\n',
    'sh'
  );
  if (escapedDelimiter !== 'cat <<E\\ OF\nbody\n\nE OF\nnext\n') {
    throw new Error(`Escaped delimiter protection failed:\n${escapedDelimiter}`);
  }
  const ansiHeredoc = runFix('ansi-heredoc', "cat <<$'END JSON'\nbody\n\nEND JSON\n\nnext\n", 'sh');
  if (ansiHeredoc !== "cat <<$'END JSON'\nbody\n\nEND JSON\nnext\n") {
    throw new Error(`ANSI heredoc protection failed:\n${ansiHeredoc}`);
  }
  const continuedHeredoc = runFix(
    'continued-heredoc',
    'cat <<\\\nEOF\nbody\n\nEOF\n\nnext\n',
    'sh'
  );
  if (continuedHeredoc !== 'cat <<\\\nEOF\nbody\n\nEOF\nnext\n') {
    throw new Error(`Continued heredoc protection failed:\n${continuedHeredoc}`);
  }
  const heredocText = runFix('heredoc-text', 'printf "a <<EOF"\n\nnext\n\n', 'sh');
  if (heredocText !== 'printf "a <<EOF"\nnext\n') {
    throw new Error(`Quoted heredoc text handling failed:\n${heredocText}`);
  }
  const shellComment = runFix(
    'shell-comment',
    "# don't parse this\n\nvalue=$(\n  printf first\n\n  printf second\n)\n\nnext\n",
    'sh'
  );
  if (
    shellComment !== "# don't parse this\nvalue=$(\n  printf first\n\n  printf second\n)\nnext\n"
  ) {
    throw new Error(`Shell comment scanning failed:\n${shellComment}`);
  }
  const substitution = runFix(
    'substitution',
    'value=$(\n  printf first\n\n  printf second\n)\n\nnext\n',
    'sh'
  );
  if (substitution !== 'value=$(\n  printf first\n\n  printf second\n)\nnext\n') {
    throw new Error(`Command substitution protection failed:\n${substitution}`);
  }
  const subshell = runFix('subshell', '(\n  printf first\n\n  printf second\n)\n\nnext\n', 'sh');
  if (subshell !== '(\n  printf first\n\n  printf second\n)\nnext\n') {
    throw new Error(`Subshell protection failed:\n${subshell}`);
  }
  const arithmetic = runFix('arithmetic', 'value=$((1 << 2))\n\nnext\n\n', 'sh');
  if (arithmetic !== 'value=$((1 << 2))\nnext\n') {
    throw new Error(`Arithmetic shift handling failed:\n${arithmetic}`);
  }
  const continuation = runFix('continuation', 'printf first \\\n\n  printf second\n\nnext\n', 'sh');
  if (continuation !== 'printf first \\\n\n  printf second\nnext\n') {
    throw new Error(`Shell continuation handling failed:\n${continuation}`);
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
  const quotedYamlKey = runFix(
    'quoted-yaml-key',
    '"run#section": |\n  first\n\n  second\nnext: value\n\n',
    'yml'
  );
  if (quotedYamlKey !== '"run#section": |\n  first\n\n  second\nnext: value\n') {
    throw new Error(`Quoted YAML key protection failed:\n${quotedYamlKey}`);
  }
  const yamlApostrophe = runFix('yaml-apostrophe', "message: don't stop\n\nnext: value\n\n", 'yml');
  if (yamlApostrophe !== "message: don't stop\nnext: value\n") {
    throw new Error(`YAML apostrophe scanning failed:\n${yamlApostrophe}`);
  }
  const yamlHeredocText = runFix('yaml-heredoc-text', 'message: <<TOKEN\n\nnext: value\n\n', 'yml');
  if (yamlHeredocText !== 'message: <<TOKEN\nnext: value\n') {
    throw new Error(`YAML heredoc text handling failed:\n${yamlHeredocText}`);
  }
  const emptyScalar = runFix('empty-scalar', 'description: |\n\nnext: value\n\n', 'yml');
  if (emptyScalar !== 'description: |\n\nnext: value\n') {
    throw new Error(`Empty YAML scalar protection failed:\n${emptyScalar}`);
  }
  const rootScalar = runFix('root-scalar', '|\n  first\n\n  second\n', 'yml');
  if (rootScalar !== '|\n  first\n\n  second\n') {
    throw new Error(`Root YAML scalar protection failed:\n${rootScalar}`);
  }
  const anchoredScalar = runFix(
    'anchored-scalar',
    'value: &anchor |\n  first\n\n  second\nnext: value\n\n',
    'yml'
  );
  if (anchoredScalar !== 'value: &anchor |\n  first\n\n  second\nnext: value\n') {
    throw new Error(`Anchored YAML scalar protection failed:\n${anchoredScalar}`);
  }
  const anchoredQuotedYaml = runFix(
    'anchored-quoted-yaml',
    'value: &anchor "first\n\nsecond"\nnext: value\n\n',
    'yml'
  );
  if (anchoredQuotedYaml !== 'value: &anchor "first\n\nsecond"\nnext: value\n') {
    throw new Error(`Anchored YAML quote protection failed:\n${anchoredQuotedYaml}`);
  }
  const plainYaml = runFix(
    'plain-yaml',
    'message: first paragraph\n  second paragraph\n\n  third paragraph\nnext: value\n\n',
    'yml'
  );
  if (
    plainYaml !== 'message: first paragraph\n  second paragraph\n\n  third paragraph\nnext: value\n'
  ) {
    throw new Error(`Plain YAML scalar protection failed:\n${plainYaml}`);
  }
  const anchoredPlainYaml = runFix(
    'anchored-plain-yaml',
    'message: &anchor first paragraph\n  second paragraph\n\n  third paragraph\nnext: value\n\n',
    'yml'
  );
  if (
    anchoredPlainYaml !==
    'message: &anchor first paragraph\n  second paragraph\n\n  third paragraph\nnext: value\n'
  ) {
    throw new Error(`Anchored plain YAML protection failed:\n${anchoredPlainYaml}`);
  }
  const quotedYamlValue = runFix(
    'quoted-yaml-value',
    'message: "first\n\nsecond"\nnext: value\n\n',
    'yml'
  );
  if (quotedYamlValue !== 'message: "first\n\nsecond"\nnext: value\n') {
    throw new Error(`Quoted YAML value protection failed:\n${quotedYamlValue}`);
  }
  const quotedYamlSequence = runFix(
    'quoted-yaml-sequence',
    '- "first\n\nsecond"\n- next\n\n',
    'yml'
  );
  if (quotedYamlSequence !== '- "first\n\nsecond"\n- next\n') {
    throw new Error(`Quoted YAML sequence protection failed:\n${quotedYamlSequence}`);
  }
  const keepChompAtEof = runFix(
    'keep-chomp-at-eof',
    'run: |2+\n    first\n\nfolded: >2+\n    second\n\n',
    'yml'
  );
  if (keepChompAtEof !== 'run: |2+\n    first\n\nfolded: >2+\n    second\n\n') {
    throw new Error(`YAML keep-chomp EOF protection failed:\n${keepChompAtEof}`);
  }
  const flowQuotedYaml = runFix(
    'flow-quoted-yaml',
    'values: [ "first\n\nsecond" ]\nnext: value\n\n',
    'yml'
  );
  if (flowQuotedYaml !== 'values: [ "first\n\nsecond" ]\nnext: value\n') {
    throw new Error(`YAML flow scalar protection failed:\n${flowQuotedYaml}`);
  }
  const clippedScalar = runFix(
    'clipped-scalar',
    'run: |\n  first\n\n  second\n\nnext: value\n\n',
    'yml'
  );
  if (clippedScalar !== 'run: |\n  first\n\n  second\nnext: value\n') {
    throw new Error(`YAML clip-chomp handling failed:\n${clippedScalar}`);
  }
  const vue = runFix(
    'component',
    '<template>\n  <div>first</div>\n\n  <div>second</div>\n</template>\n\n<script setup lang="ts">\nconst text = `first\n\nsecond`;\n\nconst second = 2;\n</script\n data>\n\n<style>\n/* first\n\nsecond */\n</style>\n',
    'vue'
  );
  if (
    vue !==
    '<template>\n  <div>first</div>\n\n  <div>second</div>\n</template>\n<script setup lang="ts">\nconst text = `first\n\nsecond`;\nconst second = 2;\n</script\n data>\n<style>\n/* first\n\nsecond */\n</style>\n'
  ) {
    throw new Error(`Vue SFC handling failed:\n${vue}`);
  }
  const explicitKey = runFix('explicit-key', '? |\n  first\n\n  second\n: value\n\n', 'yml');
  if (explicitKey !== '? |\n  first\n\n  second\n: value\n') {
    throw new Error(`YAML explicit-key protection failed:\n${explicitKey}`);
  }
  const mixedQuotedHeredoc = runFix(
    'mixed-quoted-heredoc',
    'cat <<E"OF"\nbody\n\nEOF\n\nnext\n',
    'sh'
  );
  if (mixedQuotedHeredoc !== 'cat <<E"OF"\nbody\n\nEOF\nnext\n') {
    throw new Error(`Mixed heredoc delimiter handling failed:\n${mixedQuotedHeredoc}`);
  }
  const emptyQuotedHeredoc = runFix('empty-quoted-heredoc', "cat <<''\nbody\n\n\n\nnext\n", 'sh');
  if (emptyQuotedHeredoc !== "cat <<''\nbody\n\nnext\n") {
    throw new Error(`Empty heredoc delimiter handling failed:\n${emptyQuotedHeredoc}`);
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
  const checkFile = join(directory, 'check.mjs');
  writeFileSync(checkFile, 'const value = 1;\n\nconst next = 2;\n');
  const dirtyCheck = spawnSync(process.execPath, [script, checkFile], { cwd: root });
  if (dirtyCheck.status !== 1) throw new Error('Dirty check mode should fail');
  execFileSync(process.execPath, [script, '--fix', checkFile], { cwd: root, stdio: 'pipe' });
  const cleanCheck = spawnSync(process.execPath, [script, checkFile], { cwd: root });
  if (cleanCheck.status !== 0) throw new Error('Clean check mode should pass');
};
if (process.env.VITEST) it('passes formatter regression fixtures', runFixtures);
else runFixtures();
