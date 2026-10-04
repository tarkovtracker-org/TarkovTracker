import { COMMIT_TYPES } from './scripts/checks/commit-types.mjs';
/**
 * Commit-header rules: only the conventional `type(scope): subject` prefix is enforced.
 *
 * PRs are squash-merged, so the PR title becomes the commit on `main` that semantic-release reads
 * (`feat` → minor; `fix`, `perf`, `revert` → patch; internal scopes in
 * `scripts/release/release-scope.mjs` never release). CI checks the PR title
 * (`scripts/checks/check-pr-title.mjs`); branch commits are only checked by the local commit-msg
 * hook. Length, casing, wording, and scope names are intentionally not enforced, because
 * rewording commits costs more than it is worth.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [...COMMIT_TYPES]],
    // Scopes are free-form: release behavior depends on scopes such as `preview` and `no-release`.
    'scope-enum': [0],
    'scope-case': [0],
    'subject-case': [0],
    'subject-full-stop': [0],
    'header-max-length': [0],
    'body-leading-blank': [0],
    'body-max-line-length': [0],
    'footer-leading-blank': [0],
    'footer-max-line-length': [0],
  },
};
