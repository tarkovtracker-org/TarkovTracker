/**
 * Credentials for the private tarkov-data-overlay repository. The token is read-only and is
 * only ever attached to GitHub's own hosts over HTTPS, so a redirect or a configured
 * `OVERLAY_URL` pointing elsewhere never receives it.
 */
const OVERLAY_TOKEN_HOSTS = new Set(['raw.githubusercontent.com', 'api.github.com']);
export function overlayAuthHeaders(
  url: string,
  token: string | undefined = process.env.OVERLAY_TOKEN
): Record<string, string> {
  const trimmed = token?.trim();
  if (!trimmed) return {};
  try {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !OVERLAY_TOKEN_HOSTS.has(target.hostname)) return {};
  } catch {
    return {};
  }
  return { Authorization: `Bearer ${trimmed}` };
}
