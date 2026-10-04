import { describe, expect, it } from 'vitest';
import { ALLOWED_TYPES, validatePrTitle } from './check-pr-title.mjs';
describe('validatePrTitle', () => {
  it.each([
    'fix(app): stop repeating language-independent requests on locale switch',
    'feat: add objective filter',
    'chore(deps): bump nuxt from 4.5.1 to 4.5.2',
    'build(deps-dev): bump vitest',
    'chore(i18n): update translations from Crowdin',
    'fix(no-release): internal tweak',
    'feat(tasks)!: drop the legacy filter',
    'docs(systems): document the endpoint table with a very long subject that goes well past one hundred characters total',
    'fix: Capitalized subject is fine.',
    'Revert "fix(app): stop repeating requests"',
  ])('accepts %s', (title) => {
    expect(validatePrTitle(title)).toBeNull();
  });
  it.each([
    ['', /empty/],
    ['Add a thing', /must look like/],
    ['fix:missing space', /must look like/],
    ['fix(): empty scope', /must look like/],
    ['enhance(ui): unknown type', /Unknown type "enhance"/],
    ['Fix: uppercase type', /must look like/],
  ])('rejects %j', (title, reason) => {
    expect(validatePrTitle(title)).toMatch(reason);
  });
  it('shares the commitlint type list and keeps every release-relevant type', () => {
    for (const type of ['feat', 'fix', 'perf', 'revert', 'chore', 'docs', 'ci', 'test']) {
      expect(ALLOWED_TYPES).toContain(type);
    }
  });
});
