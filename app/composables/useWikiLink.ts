import { usePreferencesStore } from '@/stores/usePreferences';
import { rewriteWikiUrl } from '@/utils/wikiLink';
/**
 * Reactive wiki link helper. Wraps a raw wiki URL and rewrites fandom.com
 * links to the antifandom.com mirror when the user has enabled the preference.
 * Reads the preference on every call so templates re-render when it changes.
 */
export function useWikiLink() {
  const preferencesStore = usePreferencesStore();
  /**
   * Rewrite a wiki URL to the antifandom.com mirror when the preference is on,
   * preserving the nullability of the input for safe `:href` bindings.
   */
  function toWikiUrl(url: string): string;
  function toWikiUrl(url: string | undefined): string | undefined;
  function toWikiUrl(url: string | null): string | null;
  function toWikiUrl(url: string | null | undefined): string | null | undefined;
  function toWikiUrl(url: string | null | undefined): string | null | undefined {
    return rewriteWikiUrl(url, preferencesStore.getWikiUseAntifandom);
  }
  return { toWikiUrl };
}
