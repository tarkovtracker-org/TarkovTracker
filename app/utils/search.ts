export function normalizeSearchString(search: string): string {
  return search.toLowerCase().trim();
}
export function splitSearchTokens(search: string): string[] {
  const normalized = normalizeSearchString(search);
  if (!normalized) return [];
  return normalized.split(/\s+/).filter((token) => token.length > 0);
}
