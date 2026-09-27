const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/;
/** Normalized full commit SHA, or an empty string for anything else. */
export const normalizeBuildCommit = (value: unknown): string => {
  const sha = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return FULL_COMMIT_SHA.test(sha) ? sha : '';
};
/**
 * Commit the current build was produced from. Cloudflare Pages injects `CF_PAGES_COMMIT_SHA`;
 * GitHub Actions builds (release checks and previews) provide `GITHUB_SHA`. Local builds have none.
 */
export const resolveBuildCommit = (env: Record<string, string | undefined>): string =>
  normalizeBuildCommit(env.CF_PAGES_COMMIT_SHA) || normalizeBuildCommit(env.GITHUB_SHA);
