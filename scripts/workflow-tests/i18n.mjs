import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const cli = resolve('scripts/checks/lint-i18n.mjs');
const EN = { greeting: 'Hello {name}', menu: { title: 'Menu' } };
const USAGE = "t('greeting'); t('menu.title');";
function runFixture(t, { en = EN, locales = { de: {} }, usage = USAGE, raw = {} } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'i18n-check-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, 'app/locales'), { recursive: true });
  mkdirSync(join(cwd, 'app/utils'), { recursive: true });
  writeFileSync(
    join(cwd, 'app/utils/locales.ts'),
    "export const SUPPORTED_LOCALES = ['en', 'de'];"
  );
  writeFileSync(join(cwd, 'app/usage.ts'), usage);
  const files = {
    en: JSON.stringify(en),
    ...Object.fromEntries(
      Object.entries(locales).map(([code, messages]) => [code, JSON.stringify(messages)])
    ),
    ...raw,
  };
  for (const [code, content] of Object.entries(files)) {
    writeFileSync(join(cwd, 'app/locales', `${code}.json`), content);
  }
  return spawnSync(process.execPath, [cli], { cwd, encoding: 'utf8' });
}
test('i18n passes partially translated locales', (t) => {
  const result = runFixture(t, { locales: { de: { greeting: 'Hallo {name}' } } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /all locales are valid/);
});
test('i18n ignores extra translation keys left for Crowdin to remove', (t) => {
  const result = runFixture(t, { locales: { de: { removed_key: 'Alt' } } });
  assert.equal(result.status, 0, result.stderr);
});
for (const target of ['deleted', 'renamed']) {
  test(`i18n fails when a supported locale file is ${target}`, (t) => {
    const result = runFixture(t, { locales: target === 'renamed' ? { fr: {} } : {} });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing supported locale file\(s\): de\.json/);
  });
}
const failures = [
  ['invalid JSON', { raw: { de: '{"greeting": ' } }, /de\.json: invalid JSON/],
  [
    'non-snake_case keys',
    { en: { ...EN, BadKey: 'x' }, usage: `${USAGE} t('BadKey');` },
    /BadKey is not snake_case/,
  ],
  [
    'invalid message syntax',
    { locales: { de: { greeting: 'Hallo {name' } } },
    /greeting has invalid message syntax/,
  ],
  [
    'unescaped linked-message @',
    { locales: { de: { greeting: 'mail@x.de {name}' } } },
    /greeting has invalid message syntax/,
  ],
  [
    'renamed placeholders',
    { locales: { de: { greeting: 'Hallo {nom}' } } },
    /greeting uses unknown placeholder\(s\) \{nom\}/,
  ],
  [
    'a message where en has a group',
    { locales: { de: { menu: 'Menü' } } },
    /menu is a message but en has a group/,
  ],
  [
    'unused en keys',
    { en: { ...EN, orphan_key: 'Old' } },
    /orphan_key is not used in app\/; remove it/,
  ],
];
for (const [name, fixture, pattern] of failures) {
  test(`i18n fails on ${name}`, (t) => {
    const result = runFixture(t, fixture);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, pattern);
  });
}
test('i18n treats keys under a dynamic prefix as used', (t) => {
  const en = { ...EN, status: { open: 'Open', done: 'Done' } };
  const result = runFixture(t, { en, usage: `${USAGE} t(\`status.\${value}\`);` });
  assert.equal(result.status, 0, result.stderr);
});
