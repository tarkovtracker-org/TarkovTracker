#!/usr/bin/env node
// Checks that a PR title starts with an allowed conventional type: `type(scope)!: subject`.
// PRs are squash-merged, so the title becomes the commit on `main` that semantic-release reads.
// Types come from `commit-types.mjs`; scope, length and wording are deliberately free-form.
import { pathToFileURL } from 'node:url';
import { COMMIT_TYPES } from './commit-types.mjs';
export const ALLOWED_TYPES = COMMIT_TYPES;
const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^()\s][^()]*)\))?!?: \S/;
// GitHub's "Revert" button produces `Revert "<original title>"`.
const GITHUB_REVERT = /^Revert ".+"$/;
/** Returns null when the title is valid, otherwise a human-readable reason. */
export function validatePrTitle(rawTitle, allowedTypes = ALLOWED_TYPES) {
  const title = String(rawTitle ?? '').trim();
  if (!title) return 'PR title is empty.';
  if (GITHUB_REVERT.test(title)) return null;
  const match = title.match(HEADER);
  if (!match) {
    return `PR title must look like "type: summary" or "type(scope): summary". Got: "${title}"`;
  }
  if (!allowedTypes.includes(match.groups.type)) {
    return `Unknown type "${match.groups.type}". Allowed: ${allowedTypes.join(', ')}.`;
  }
  return null;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const error = validatePrTitle(process.env.PR_TITLE);
  if (error) {
    console.error(`::error title=PR title::${error} Edit the title to re-run this check.`);
    process.exit(1);
  }
  console.log(`PR title OK: ${process.env.PR_TITLE}`);
}
