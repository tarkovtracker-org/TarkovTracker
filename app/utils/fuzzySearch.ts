function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
const MAX_INITIALISM_LENGTH = 6;
function getInitialism(text: string): string {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).map((word) => word[0]).join('');
}
function getSubsequenceScore(text: string, query: string): number {
  let bestGapCount = Number.POSITIVE_INFINITY;
  let bestConsecutiveCount = 0;
  let startIndex = text.indexOf(query.charAt(0));
  while (startIndex !== -1) {
    let lastMatchIndex = startIndex;
    let maxConsecutiveCount = 1;
    let consecutiveCount = 1;
    let queryIndex = 1;
    for (let textIndex = startIndex + 1; textIndex < text.length; textIndex++) {
      if (text[textIndex] !== query[queryIndex]) continue;
      consecutiveCount = textIndex === lastMatchIndex + 1 ? consecutiveCount + 1 : 1;
      maxConsecutiveCount = Math.max(maxConsecutiveCount, consecutiveCount);
      lastMatchIndex = textIndex;
      queryIndex++;
      if (queryIndex === query.length) break;
    }
    if (queryIndex === query.length) {
      const gapCount = lastMatchIndex - startIndex + 1 - query.length;
      if (
        gapCount < bestGapCount ||
        (gapCount === bestGapCount && maxConsecutiveCount > bestConsecutiveCount)
      ) {
        bestGapCount = gapCount;
        bestConsecutiveCount = maxConsecutiveCount;
      }
    }
    startIndex = text.indexOf(query.charAt(0), startIndex + 1);
  }
  const maxGapCount = Math.max(2, Math.floor(query.length / 2));
  if (bestGapCount > maxGapCount) return 0;
  const compactness = query.length / (query.length + bestGapCount);
  const consecutiveRatio = bestConsecutiveCount / query.length;
  return 0.3 + compactness * 0.2 + consecutiveRatio * 0.2;
}
export function fuzzyMatch(text: string, query: string): boolean {
  const queryLower = normalize(query).trim();
  if (!queryLower) return true;
  if (!text) return false;
  const textLower = normalize(text);
  if (textLower.includes(queryLower)) return true;
  const words = queryLower.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return words.every((word) => textLower.includes(word));
  }
  const initialism = getInitialism(textLower);
  if (queryLower.length <= MAX_INITIALISM_LENGTH && initialism.startsWith(queryLower)) return true;
  return getSubsequenceScore(textLower, queryLower) > 0;
}
export function fuzzyMatchScore(text: string, query: string): number {
  const queryLower = normalize(query).trim();
  if (!queryLower) return 1;
  if (!text) return 0;
  const textLower = normalize(text);
  if (textLower === queryLower) return 1;
  if (textLower.startsWith(queryLower)) return 0.9;
  if (textLower.includes(queryLower)) return 0.8;
  const words = queryLower.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return words.every((word) => textLower.includes(word)) ? 0.7 : 0;
  }
  const initialism = getInitialism(textLower);
  if (queryLower.length <= MAX_INITIALISM_LENGTH && initialism.startsWith(queryLower)) return 0.7;
  return getSubsequenceScore(textLower, queryLower);
}
