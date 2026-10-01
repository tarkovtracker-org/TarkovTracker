/**
 * Upstream game data (json.tarkov.dev, overlays) is untrusted. Only HTTPS links
 * to the hosts that data legitimately points at may reach an href or window.open.
 */
const TRUSTED_GAME_LINK_HOSTS: ReadonlySet<string> = new Set([
  'tarkov.dev',
  'escapefromtarkov.fandom.com',
  'antifandom.com',
]);
function parseUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}
/**
 * Return the canonical URL when it is an HTTPS, credential-free link to a trusted game-data
 * host; otherwise undefined so callers fall back to an ID-derived URL.
 */
export function toTrustedGameLinkUrl(value: unknown): string | undefined {
  const parsed = parseUrl(value);
  if (!parsed || parsed.protocol !== 'https:') return undefined;
  if (parsed.username || parsed.password) return undefined;
  return TRUSTED_GAME_LINK_HOSTS.has(parsed.hostname) ? parsed.href : undefined;
}
/**
 * Whether a URL is safe to open in a new browsing context (http/https only).
 */
export function isWebUrl(value: unknown): value is string {
  const protocol = parseUrl(value)?.protocol;
  return protocol === 'https:' || protocol === 'http:';
}
