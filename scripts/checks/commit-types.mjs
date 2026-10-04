/**
 * Conventional types allowed in PR titles and commit headers. Single source for
 * `commitlint.config.js` and `check-pr-title.mjs`. Release impact (semantic-release, angular preset):
 * `feat` → minor; `fix`, `perf`, `revert` → patch; everything else never releases on its own.
 */
export const COMMIT_TYPES = Object.freeze([
  'feat',
  'fix',
  'perf',
  'revert',
  'refactor',
  'docs',
  'test',
  'style',
  'build',
  'ci',
  'chore',
]);
