import { describe, expect, it } from 'vitest';
import { rewriteWikiUrl } from '@/utils/wikiLink';
describe('rewriteWikiUrl', () => {
  const url = 'https://escapefromtarkov.fandom.com/wiki/Debut';
  it('returns the original url when the preference is disabled', () => {
    expect(rewriteWikiUrl(url, false)).toBe(url);
  });
  it('rewrites a fandom wiki url to the antifandom path form when enabled', () => {
    expect(rewriteWikiUrl(url, true)).toBe('https://antifandom.com/escapefromtarkov/wiki/Debut');
  });
  it('preserves path and query when rewriting', () => {
    expect(
      rewriteWikiUrl('https://escapefromtarkov.fandom.com/wiki/Special:Search?query=Bitcoin', true)
    ).toBe('https://antifandom.com/escapefromtarkov/wiki/Special:Search?query=Bitcoin');
  });
  it('leaves a bare fandom.com host unchanged', () => {
    expect(rewriteWikiUrl('https://fandom.com/wiki/Test', true)).toBe(
      'https://fandom.com/wiki/Test'
    );
  });
  it('leaves non-fandom hosts untouched', () => {
    expect(rewriteWikiUrl('https://tarkov.dev/task/123', true)).toBe('https://tarkov.dev/task/123');
    expect(rewriteWikiUrl('https://notreallyfandom.com/wiki/X', true)).toBe(
      'https://notreallyfandom.com/wiki/X'
    );
  });
  it('preserves nullish and unparseable input', () => {
    expect(rewriteWikiUrl(null, true)).toBeNull();
    expect(rewriteWikiUrl(undefined, true)).toBeUndefined();
    expect(rewriteWikiUrl('', true)).toBe('');
    expect(rewriteWikiUrl('not a url', true)).toBe('not a url');
  });
});
