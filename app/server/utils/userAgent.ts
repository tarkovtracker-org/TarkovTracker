import { resolvePublicAppUrl } from '@/utils/runtimeConfig';
/**
 * Upstream's identity string. Used verbatim when this deployment has no app URL configured
 * (or it fails to resolve to a usable http(s) origin), so outbound requests never claim to be
 * an instance they are not.
 */
const UPSTREAM_TARKOVTRACKER_USER_AGENT = 'TarkovTracker/1.0 (+https://tarkovtracker.org)';
/**
 * Whether a URL hostname points at the local machine rather than a public deployment:
 * `localhost` and any `*.localhost` name (reserved for loopback by RFC 6761), the whole
 * 127.0.0.0/8 loopback range, the IPv6 loopback `[::1]`, and the unspecified addresses
 * `0.0.0.0` / `[::]`. A trailing dot (the fully qualified `localhost.` form) is ignored.
 * `URL` has already lowercased the hostname and normalized IPv4 shorthand (`127.1`) and
 * long IPv6 forms, so only the canonical spellings need matching here.
 */
const isLocalHostname = (hostname: string): boolean => {
  const host = hostname.replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '[::1]' || host === '[::]' || host === '0.0.0.0') return true;
  return /^127(?:\.\d{1,3}){3}$/.test(host);
};
/**
 * Derive this deployment's outbound User-Agent from its configured public app URL
 * (`resolvePublicAppUrl`, the same APP_URL/CF_PAGES_URL resolution used for the site's own
 * canonical URL) so requests to tarkov.dev, GitHub, and Twitch identify this instance instead
 * of being misattributed to the upstream tarkovtracker.org project. Every installation names
 * itself automatically; an unconfigured or unparsable app URL falls back to the exact upstream
 * value, so upstream itself sees no behavior change.
 */
export const resolveTarkovTrackerUserAgent = (env: NodeJS.ProcessEnv): string => {
  // resolvePublicAppUrl prepends https:// to any configured value that does not already start
  // with http(s)://, so an explicit non-HTTP(S) scheme (e.g. ftp://tracker.example.com or
  // file:///tmp/tracker) would be silently mangled into a bogus http(s) origin
  // (https://ftp, https://file) instead of being rejected. Inspect the same trimmed value
  // resolvePublicAppUrl will consume (first non-empty of APP_URL / CF_PAGES_URL) and reject
  // explicit unsupported schemes up front. Bare hostnames carry no scheme and still go
  // through the normal https normalization, including localhost handling.
  const configuredUrl = env.APP_URL?.trim() || env.CF_PAGES_URL?.trim() || '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(configuredUrl) && !/^https?:\/\//i.test(configuredUrl)) {
    return UPSTREAM_TARKOVTRACKER_USER_AGENT;
  }
  const appUrl = resolvePublicAppUrl(env);
  try {
    const { hostname, origin, protocol } = new URL(appUrl);
    // resolvePublicAppUrl always normalizes into an http(s) URL today, so this branch is
    // defense-in-depth against a future change to that normalization rather than a reachable
    // path with the current implementation.
    if (!/^https?:$/.test(protocol) || isLocalHostname(hostname)) {
      return UPSTREAM_TARKOVTRACKER_USER_AGENT;
    }
    return `TarkovTracker/1.0 (+${origin})`;
  } catch {
    return UPSTREAM_TARKOVTRACKER_USER_AGENT;
  }
};
export const TARKOVTRACKER_USER_AGENT = resolveTarkovTrackerUserAgent(process.env);
