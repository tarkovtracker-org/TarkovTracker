import { usePreferencesStore } from '@/stores/usePreferences';
import { toTrustedGameLinkUrl } from '@/utils/externalUrl';
import { rewriteWikiUrl } from '@/utils/wikiLink';
type WikiLinkRewriter = (url: string | null | undefined) => string | undefined;
/**
 * Reactive wiki link helper. Wraps a raw wiki URL and rewrites fandom.com
 * links to the antifandom.com mirror when the user has enabled the preference.
 * Reads the preference on every call so templates re-render when it changes.
 */
export function useWikiLink(): { toWikiUrl: WikiLinkRewriter } {
  const preferencesStore = usePreferencesStore();
  /**
   * Rewrite a wiki URL to the antifandom.com mirror when the preference is on.
   * Untrusted or malformed URLs return undefined so they never reach an `:href`.
   */
  function toWikiUrl(url: string | null | undefined): string | undefined {
    return rewriteWikiUrl(toTrustedGameLinkUrl(url), preferencesStore.getWikiUseAntifandom);
  }
  return { toWikiUrl };
}
