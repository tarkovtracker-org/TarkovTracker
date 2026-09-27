import { describe, expect, it } from 'vitest';
import { normalizeBuildCommit, resolveBuildCommit } from '@/utils/buildCommit';
const sha = 'dce724280dd507aba2fdec7d9712c3fe20d60cfa';
describe('build commit', () => {
  it.each([
    [sha, sha],
    [` ${sha.toUpperCase()}\n`, sha],
    [sha.slice(0, 7), ''],
    ['not-a-sha', ''],
    [undefined, ''],
    [42, ''],
  ])('normalizes %j', (input, expected) => expect(normalizeBuildCommit(input)).toBe(expected));
  it('prefers the Cloudflare Pages commit and falls back to GitHub Actions', () => {
    const other = 'a'.repeat(40);
    expect(resolveBuildCommit({ CF_PAGES_COMMIT_SHA: sha, GITHUB_SHA: other })).toBe(sha);
    expect(resolveBuildCommit({ CF_PAGES_COMMIT_SHA: 'bogus', GITHUB_SHA: other })).toBe(other);
    expect(resolveBuildCommit({})).toBe('');
  });
});
