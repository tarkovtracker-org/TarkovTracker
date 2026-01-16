/**
 * Utility functions for search string processing.
 * Used across multiple pages (tasks, neededitems) for consistent multi-token search behavior.
 */
/**
 * Normalizes a search string by converting to lowercase and trimming whitespace.
 * @param search - The raw search input string
 * @returns Normalized search string
 */
export function normalizeSearchString(search: string): string {
  return search.toLowerCase().trim();
}
/**
 * Splits a search string into individual tokens for multi-word matching.
 * Tokens are separated by whitespace and empty tokens are filtered out.
 *
 * @example
 * splitSearchTokens('punisher 5') // returns ['punisher', '5']
 * splitSearchTokens('  gas  analyzer  ') // returns ['gas', 'analyzer']
 * splitSearchTokens('') // returns []
 *
 * @param search - The search string to tokenize (should already be normalized)
 * @returns Array of non-empty tokens
 */
export function splitSearchTokens(search: string): string[] {
  const normalized = normalizeSearchString(search);
  if (!normalized) return [];
  return normalized.split(/\s+/).filter((token) => token.length > 0);
}
/**
 * Checks if all search tokens are present in the target text.
 * Useful for multi-token search where all terms must match.
 *
 * @example
 * matchesAllTokens(['punisher', '5'], 'the punisher - part 5') // returns true
 * matchesAllTokens(['punisher', '6'], 'the punisher - part 5') // returns false
 *
 * @param tokens - Array of search tokens (should be lowercase)
 * @param text - The text to search in (should be lowercase)
 * @returns True if all tokens are found in the text
 */
export function matchesAllTokens(tokens: string[], text: string): boolean {
  return tokens.every((token) => text.includes(token));
}
