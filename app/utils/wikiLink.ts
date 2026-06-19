/**
 * Wiki link host rewriting - swaps fandom.com wiki URLs to the ad-light
 * antifandom.com mirror when the user opts in via preferences.
 */
const FANDOM_HOST_SUFFIX = '.fandom.com';
const FANDOM_HOST = 'fandom.com';
/**
 * Rewrite a fandom.com wiki URL to its antifandom.com equivalent.
 *
 * Only the host is swapped (`<sub>.fandom.com` -> `<sub>.antifandom.com`), so
 * the path and query are preserved. Non-fandom URLs (e.g. tarkov.dev) and
 * unparseable values are returned untouched. The rewrite is purely for
 * display/navigation; raw `wikiLink` data used for matching is left alone.
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
    if (parsed.hostname === FANDOM_HOST || parsed.hostname.endsWith(FANDOM_HOST_SUFFIX)) {
      parsed.hostname = parsed.hostname.replace(/fandom\.com$/, 'antifandom.com');
      return parsed.toString();
    }
  } catch {
    return url;
  }
  return url;
}
