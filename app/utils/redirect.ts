type RedirectInput = string | null | undefined | Array<string | null>;
export function openExternalUrl(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
function getRedirectCandidate(redirect: RedirectInput): string | null {
  if (Array.isArray(redirect)) {
    const firstValue = redirect.find((value) => typeof value === 'string');
    if (typeof firstValue !== 'string') return null;
    const trimmed = firstValue.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof redirect !== 'string') return null;
  const trimmed = redirect.trim();
  return trimmed.length > 0 ? trimmed : null;
}
export function sanitizeInternalRedirect(redirect: RedirectInput, fallback = '/'): string {
  const candidate = getRedirectCandidate(redirect);
  if (!candidate) return fallback;
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return fallback;
  try {
    const parsed = new URL(candidate, 'http://localhost');
    if (parsed.origin !== 'http://localhost') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
