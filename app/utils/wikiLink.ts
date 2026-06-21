/**
 * Wiki link rewriting - rewrites fandom.com wiki URLs to the ad-light
 * antifandom.com mirror when the user opts in via preferences.
 */
const FANDOM_HOST_SUFFIX = '.fandom.com';
const ANTIFANDOM_HOST = 'antifandom.com';
/**
 * Rewrite a fandom.com wiki URL to its antifandom.com equivalent.
 *
 * antifandom.com serves each wiki under a path prefix, so
 * `<wiki>.fandom.com/<path>` becomes `antifandom.com/<wiki>/<path>` with the
 * query and hash preserved. Building this canonical path form directly avoids
 * the 302 that the `<wiki>.antifandom.com` host form issues - that redirect
 * also drops the query string, which would break Special:Search links. Bare
 * `fandom.com`, non-fandom URLs (e.g. tarkov.dev), and unparseable values are
 * returned untouched. The rewrite is purely for display/navigation; raw
 * `wikiLink` data used for matching is left alone.
 *
 * @param url - The original wiki URL (or nullish)
 * @param useAntifandom - Whether the antifandom mirror is enabled
 * @returns The possibly-rewritten URL, preserving nullish input
 */
export function rewriteWikiUrl(url: string, useAntifandom: boolean): string;
export function rewriteWikiUrl(url: string | undefined, useAntifandom: boolean): string | undefined;
export function rewriteWikiUrl(url: string | null, useAntifandom: boolean): string | null;
export function rewriteWikiUrl(
  url: string | null | undefined,
  useAntifandom: boolean
): string | null | undefined;
export function rewriteWikiUrl(
  url: string | null | undefined,
  useAntifandom: boolean
): string | null | undefined {
  if (!url || !useAntifandom) {
    return url;
  }
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(FANDOM_HOST_SUFFIX)) {
      return url;
    }
    const wiki = parsed.hostname.slice(0, -FANDOM_HOST_SUFFIX.length);
    if (!wiki) {
      return url;
    }
    parsed.hostname = ANTIFANDOM_HOST;
    parsed.pathname = `/${wiki}${parsed.pathname}`;
    return parsed.toString();
  } catch {
    return url;
  }
}
